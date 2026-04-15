import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from 'discord.js';
import { z } from 'zod';
import { sendToChannel, SendError, type FileInput } from './send-service.js';
import { embedSchema, sendPayloadSchema } from './payload.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

// JSON モードのスキーマ。sendPayloadSchema を拡張して files パス配列を追加
// sendPayloadSchema と一元的に管理するので、スキーマ変更時に乖離しない
const jsonModeSchema = sendPayloadSchema.extend({
  files: z.array(z.string()).max(10).optional(),
});

export async function runFromArgs(client: Client, argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      channel: { type: 'string' },
      content: { type: 'string' },
      file: { type: 'string', multiple: true },
      embed: { type: 'string', multiple: true },
      json: { type: 'string' },
    },
    strict: false,
    allowPositionals: false,
  });

  // ── JSON モード ─────────────────────────────────────────────
  if (values.json) {
    const jsonPath = path.resolve(process.cwd(), String(values.json));
    let raw: string;
    try {
      raw = await readFile(jsonPath, 'utf8');
    } catch (err) {
      throw new Error(`JSON ファイルを読み込めません (${jsonPath}): ${err instanceof Error ? err.message : String(err)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JSON のパースに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }

    const result = jsonModeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`JSON の形式が不正です:\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    }

    const jsonData = result.data;
    const files = await loadFiles(jsonData.files ?? []);

    const sent = await sendToChannel(client, {
      channelId: jsonData.channelId,
      content: jsonData.content,
      embeds: jsonData.embeds,
    }, files);

    console.log(`送信成功: messageId=${sent.id} channelId=${sent.channelId} guildId=${sent.guildId}`);
    return;
  }

  // ── 引数モード ─────────────────────────────────────────────
  const channelId = values.channel ? String(values.channel) : undefined;
  if (!channelId) {
    throw new Error('--channel <channelId> が必要です。\n使い方: npm run admin -- --channel <id> [--content "..."] [--file ./path] [--embed \'{"title":"..."}\']');
  }

  const content = values.content ? String(values.content) : undefined;

  // Embed の解析
  const rawEmbeds = values.embed
    ? (Array.isArray(values.embed) ? values.embed : [values.embed]).map(String)
    : [];

  const embeds: z.infer<typeof embedSchema>[] = [];
  for (const raw of rawEmbeds) {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error(`--embed の JSON が不正です: ${raw}`);
    }
    const r = embedSchema.safeParse(obj);
    if (!r.success) {
      throw new Error(`--embed の形式が不正です: ${r.error.issues.map((i) => i.message).join(', ')}`);
    }
    embeds.push(r.data);
  }

  // ファイルの読み込み
  const filePaths = values.file
    ? (Array.isArray(values.file) ? values.file : [values.file]).map(String)
    : [];
  const files = await loadFiles(filePaths);

  // ペイロード全体の検証
  const payloadResult = sendPayloadSchema.safeParse({
    channelId,
    content,
    embeds: embeds.length > 0 ? embeds : undefined,
  });
  if (!payloadResult.success) {
    throw new Error(payloadResult.error.issues.map((i) => i.message).join(', '));
  }

  try {
    const sent = await sendToChannel(client, payloadResult.data, files);
    console.log(`送信成功: messageId=${sent.id} channelId=${sent.channelId} guildId=${sent.guildId}`);
  } catch (err) {
    if (err instanceof SendError) throw new Error(err.message);
    throw err;
  }
}

async function loadFiles(paths: string[]): Promise<FileInput[]> {
  if (paths.length > 10) {
    throw new Error(`ファイルは最大 10 個です（${paths.length} 個指定されました）`);
  }

  const results: FileInput[] = [];
  for (const p of paths) {
    const abs = path.resolve(process.cwd(), p);
    // stat でサイズ確認を先に行い、25MB 超のファイルは全バッファ読み込み前に弾く
    let fileSize: number;
    try {
      const info = await stat(abs);
      fileSize = info.size;
    } catch (err) {
      throw new Error(`ファイルにアクセスできません (${abs}): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`${path.basename(abs)} は 25MB を超えています（${(fileSize / 1048576).toFixed(1)}MB）`);
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(abs);
    } catch (err) {
      throw new Error(`ファイルを読み込めません (${abs}): ${err instanceof Error ? err.message : String(err)}`);
    }
    results.push({ filename: path.basename(abs), buffer });
  }
  return results;
}
