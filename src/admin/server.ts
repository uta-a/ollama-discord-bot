import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { Client } from 'discord.js';
import { registerRoutes } from './routes.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (Discord 無料鯖の上限)
const MAX_FILES = 10;

let instance: FastifyInstance | null = null;

export async function startAdminServer(client: Client): Promise<void> {
  const portStr = process.env.ADMIN_PANEL_PORT;
  if (!portStr) {
    console.log('管理画面: ADMIN_PANEL_PORT 未設定のため起動しません。');
    return;
  }

  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    console.warn(`管理画面: ADMIN_PANEL_PORT が不正な値です (${portStr})。起動しません。`);
    return;
  }

  const fastify = Fastify({ logger: false });

  // DNS リバインディング対策: Host ヘッダーを 127.0.0.1 / localhost に限定
  // 認可なし設計のため、外部サイトがブラウザ経由でローカル API を叩けないようにする
  fastify.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!host.startsWith(`127.0.0.1:${port}`) && !host.startsWith(`localhost:${port}`)) {
      reply.code(400).send({ error: 'Invalid Host header' });
    }
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: MAX_FILES,
      fields: 50,
    },
  });

  await registerRoutes(fastify, client);

  try {
    await fastify.listen({ host: '127.0.0.1', port });
    instance = fastify;
    console.log(`管理画面: http://127.0.0.1:${port} で待機中（認可なし・localhost 専用）。`);
    console.warn(
      '警告: 管理画面は認可なしで稼働しています。共用 PC ではローカルアカウントの分離を徹底してください。'
    );
  } catch (err) {
    console.error('管理画面の起動に失敗しました:', err);
    // listen に失敗した Fastify インスタンスのリソースを解放する
    try {
      await fastify.close();
    } catch {
      // close 自体の失敗は無視
    }
  }
}

export async function stopAdminServer(): Promise<void> {
  if (!instance) return;
  try {
    await instance.close();
  } catch (err) {
    console.warn('管理画面の停止中にエラーが発生しました:', err);
  }
  instance = null;
}
