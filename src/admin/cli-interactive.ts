import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { select, input, confirm, editor, checkbox } from '@inquirer/prompts';
import type { Client } from 'discord.js';
import { z } from 'zod';
import { sendToChannel, SendError, listSendableGuilds, listSendableChannels, type FileInput } from './send-service.js';
import { embedSchema } from './payload.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const EMBED_TEMPLATE = JSON.stringify(
  {
    title: '',
    description: '',
    color: '#5865f2',
    url: '',
    authorName: '',
    footerText: '',
    imageUrl: '',
    thumbnailUrl: '',
    timestamp: false,
    fields: [
      { name: 'フィールド名', value: 'フィールドの値', inline: false },
    ],
  },
  null,
  2
);

export async function runInteractive(client: Client): Promise<void> {
  console.log('\nDiscord Bot 管理画面 — 対話モード\n');

  // サーバー選択
  const guilds = listSendableGuilds(client);
  if (guilds.length === 0) {
    console.error('Bot が参加しているサーバーがありません。');
    return;
  }

  const guildId = await select({
    message: 'サーバーを選択してください',
    choices: guilds.map((g) => ({ name: g.name, value: g.id })),
  });

  // チャンネル選択
  const channels = listSendableChannels(client, guildId);
  if (!channels || channels.length === 0) {
    console.error('送信可能なテキストチャンネルがありません。');
    return;
  }

  const channelId = await select({
    message: 'チャンネルを選択してください',
    choices: channels.map((c) => {
      const prefix = c.parentName ? `${c.parentName} / ` : '';
      const icon = c.type === 'announcement' ? '📣' : '#';
      return {
        name: `${prefix}${icon} ${c.name}`,
        value: c.id,
      };
    }),
  });

  // 本文入力
  const content = await input({
    message: '本文を入力してください（空でも可）',
  });

  // Embed
  const embeds: z.infer<typeof embedSchema>[] = [];
  let addMoreEmbed = await confirm({ message: 'Embed を追加しますか？', default: false });

  while (addMoreEmbed && embeds.length < 10) {
    const embedJson = await editor({
      message: `Embed を JSON で入力してください（Embed ${embeds.length + 1}）`,
      default: EMBED_TEMPLATE,
      postfix: '.json',
      waitForUserInput: false,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(embedJson);
    } catch (err) {
      console.error('JSON のパースに失敗しました:', err instanceof Error ? err.message : String(err));
    }

    if (parsed !== undefined) {
      const result = embedSchema.safeParse(parsed);
      if (result.success) {
        embeds.push(result.data);
        console.log(`✓ Embed ${embeds.length} を追加しました。`);
      } else {
        console.error('Embed の形式が不正です:');
        for (const issue of result.error.issues) {
          console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
        }
      }
    }

    if (embeds.length < 10) {
      addMoreEmbed = await confirm({ message: 'さらに Embed を追加しますか？', default: false });
    } else {
      console.log('Embed は最大 10 個です。');
      addMoreEmbed = false;
    }
  }

  // ファイル指定
  const files: FileInput[] = [];
  const addFiles = await confirm({ message: 'ファイルを添付しますか？', default: false });

  if (addFiles) {
    const pathInput = await input({
      message: 'ファイルパスをカンマ区切りで入力してください（空でスキップ）',
    });

    if (pathInput.trim()) {
      const pathList = pathInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      if (pathList.length > 10) {
        console.warn(`ファイルは最大 10 個です。最初の 10 個のみ使用します。`);
        pathList.splice(10);
      }

      for (const p of pathList) {
        const abs = path.resolve(process.cwd(), p);
        try {
          const info = await stat(abs);
          if (info.size > MAX_FILE_SIZE) {
            console.error(`スキップ: ${path.basename(abs)} は 25MB を超えています。`);
            continue;
          }
          const buffer = await readFile(abs);
          files.push({ filename: path.basename(abs), buffer });
          console.log(`  ✓ ${path.basename(abs)} (${(info.size / 1024).toFixed(1)}KB)`);
        } catch (err) {
          console.error(`スキップ: ${abs} を読み込めません: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // 送信確認
  const channel = channels.find((c) => c.id === channelId);
  const guild = guilds.find((g) => g.id === guildId);
  console.log('\n─── 送信内容の確認 ───');
  console.log(`宛先: ${guild?.name ?? guildId} / ${channel?.name ?? channelId}`);
  if (content) console.log(`本文: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''} (${content.length} 文字)`);
  if (embeds.length > 0) console.log(`Embed: ${embeds.length} 個`);
  if (files.length > 0) console.log(`ファイル: ${files.map((f) => f.filename).join(', ')}`);

  if (!content && embeds.length === 0 && files.length === 0) {
    console.error('送信するコンテンツが何もありません。キャンセルします。');
    return;
  }

  const ok = await confirm({ message: '送信しますか？', default: true });
  if (!ok) {
    console.log('キャンセルしました。');
    return;
  }

  try {
    const sent = await sendToChannel(
      client,
      {
        channelId,
        content: content || undefined,
        embeds: embeds.length > 0 ? embeds : undefined,
      },
      files
    );
    console.log(`✓ 送信成功！ messageId: ${sent.id}`);
  } catch (err) {
    if (err instanceof SendError) {
      throw new Error(err.message);
    }
    throw err;
  }
}
