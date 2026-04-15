import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import type { Client } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  sendToChannel,
  SendError,
  listSendableGuilds,
  listSendableChannels,
  type FileInput,
} from './send-service.js';
import { sendPayloadSchema, embedSchema } from './payload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerRoutes(fastify: FastifyInstance, client: Client): Promise<void> {
  // GET / — 管理画面 HTML
  fastify.get('/', async (_req, reply) => {
    // パスはビルド時の dist/admin/public/ または開発時の src/admin/public/ を参照
    const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
    reply.type('text/html; charset=utf-8').send(html);
  });

  // GET /api/guilds — Bot が参加中のサーバー一覧
  fastify.get('/api/guilds', async () => ({
    success: true,
    data: listSendableGuilds(client),
  }));

  // GET /api/guilds/:guildId/channels — 送信可能なチャンネル一覧
  fastify.get<{ Params: { guildId: string } }>(
    '/api/guilds/:guildId/channels',
    async (req, reply) => {
      const channels = listSendableChannels(client, req.params.guildId);
      if (!channels) {
        reply.code(404);
        return { success: false, error: 'サーバーが見つかりません' };
      }
      return { success: true, data: channels };
    }
  );

  // POST /api/send — multipart/form-data でメッセージを送信
  // フィールドの順序: channelId と content を files より前に置くこと（busboy の仕様）
  fastify.post('/api/send', async (req, reply) => {
    let channelId: string | undefined;
    let content = '';
    let embedsJson: string | undefined;
    const files: FileInput[] = [];

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          const value = String(part.value);
          if (part.fieldname === 'channelId') channelId = value;
          else if (part.fieldname === 'content') content = value;
          else if (part.fieldname === 'embeds') embedsJson = value;
        } else if (part.type === 'file') {
          const buffer = await part.toBuffer();
          files.push({ filename: part.filename, buffer });
        }
      }
    } catch (err) {
      reply.code(400);
      return {
        success: false,
        error: `リクエストの解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Embed の検証
    let embeds: z.infer<typeof embedSchema>[] | undefined;
    if (embedsJson && embedsJson.trim() !== '' && embedsJson.trim() !== '[]') {
      try {
        const parsed = JSON.parse(embedsJson) as unknown;
        embeds = z.array(embedSchema).max(10).parse(parsed);
      } catch (err) {
        reply.code(400);
        return {
          success: false,
          error: `embeds の形式が不正です: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // ペイロード全体の検証
    const payloadResult = sendPayloadSchema.safeParse({
      channelId,
      content: content || undefined,
      embeds,
    });
    if (!payloadResult.success) {
      reply.code(400);
      return {
        success: false,
        error: payloadResult.error.issues.map((i) => i.message).join(', '),
      };
    }

    try {
      const sent = await sendToChannel(client, payloadResult.data, files);
      console.log(
        `管理画面(web): 送信成功 guildId=${sent.guildId} channelId=${sent.channelId} messageId=${sent.id} embeds=${embeds?.length ?? 0} files=${files.length}`
      );
      return {
        success: true,
        data: {
          messageId: sent.id,
          channelId: sent.channelId,
          guildId: sent.guildId,
        },
      };
    } catch (err) {
      if (err instanceof SendError) {
        const status =
          err.code === 'not_found' ? 404
          : err.code === 'forbidden' ? 403
          : err.code === 'empty' ? 400
          : 500;
        reply.code(status);
        return { success: false, error: err.message };
      }
      console.error('管理画面(web): 送信中に予期しないエラー:', err);
      reply.code(500);
      return { success: false, error: '予期しないエラーが発生しました' };
    }
  });
}
