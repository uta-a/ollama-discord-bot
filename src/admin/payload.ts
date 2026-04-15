import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, '6 桁の hex カラーコードで指定してください（例: #ff0080）')
  .transform((s) => (s.startsWith('#') ? s : `#${s}`));

// Discord は http/https 以外のスキームをリンクとして表示しない。
// Zod v4 の .url() は javascript: を通すため、明示的に http/https のみ許可する
const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => u.startsWith('https://') || u.startsWith('http://'),
    'http または https の URL のみ指定できます'
  );

export const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().optional(),
});

export const embedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  color: hexColor.optional(),
  url: httpUrl.optional(),
  authorName: z.string().max(256).optional(),
  authorUrl: httpUrl.optional(),
  footerText: z.string().max(2048).optional(),
  imageUrl: httpUrl.optional(),
  thumbnailUrl: httpUrl.optional(),
  fields: z.array(embedFieldSchema).max(25).optional(),
  timestamp: z.boolean().optional(),
});

export type EmbedInput = z.infer<typeof embedSchema>;

export const sendPayloadSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/, 'channelId は 17〜20 桁の数字です'),
  content: z.string().max(2000).optional(),
  embeds: z.array(embedSchema).max(10).optional(),
});

export type SendPayload = z.infer<typeof sendPayloadSchema>;

export function buildEmbed(input: EmbedInput): EmbedBuilder {
  const e = new EmbedBuilder();
  if (input.title) e.setTitle(input.title);
  if (input.description) e.setDescription(input.description);
  if (input.color) e.setColor(input.color as ColorResolvable);
  if (input.url) e.setURL(input.url);
  if (input.authorName) e.setAuthor({ name: input.authorName, url: input.authorUrl });
  if (input.footerText) e.setFooter({ text: input.footerText });
  if (input.imageUrl) e.setImage(input.imageUrl);
  if (input.thumbnailUrl) e.setThumbnail(input.thumbnailUrl);
  if (input.fields && input.fields.length > 0) e.addFields(input.fields);
  if (input.timestamp) e.setTimestamp(new Date());
  return e;
}
