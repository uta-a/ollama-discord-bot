import {
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Message,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { buildEmbed, type SendPayload } from './payload.js';

export type FileInput = { filename: string; buffer: Buffer };

export class SendError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'forbidden' | 'discord_error' | 'empty'
  ) {
    super(message);
    this.name = 'SendError';
  }
}

type Sendable = TextChannel | NewsChannel;

export async function sendToChannel(
  client: Client,
  payload: SendPayload,
  files: FileInput[]
): Promise<Message> {
  if (!payload.content && (!payload.embeds || payload.embeds.length === 0) && files.length === 0) {
    throw new SendError('content / embeds / files のいずれかが必要です', 'empty');
  }

  const channel = client.channels.cache.get(payload.channelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new SendError('指定チャンネルが見つからないか送信不可です', 'not_found');
  }

  const sendable = channel as Sendable;
  const me = sendable.guild.members.me;
  if (
    !me ||
    !sendable
      .permissionsFor(me)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  ) {
    throw new SendError('このチャンネルへの送信権限がありません', 'forbidden');
  }

  const embeds = (payload.embeds ?? []).map(buildEmbed);
  const attachments = files.map((f) => new AttachmentBuilder(f.buffer, { name: f.filename }));

  try {
    return await sendable.send({
      content: payload.content || undefined,
      embeds: embeds.length > 0 ? embeds : undefined,
      files: attachments.length > 0 ? attachments : undefined,
      allowedMentions: { parse: [] }, // @everyone/@here/メンション誤爆防止
    });
  } catch (err) {
    throw new SendError(
      err instanceof Error ? err.message : 'Discord 側で送信に失敗しました',
      'discord_error'
    );
  }
}

export function listSendableGuilds(client: Client) {
  return client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    iconUrl: g.iconURL() ?? null,
  }));
}

export function listSendableChannels(client: Client, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const me = guild.members.me;
  if (!me) return null;

  return guild.channels.cache
    .filter(
      (c): c is Sendable =>
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
        c.permissionsFor(me).has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ])
    )
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      name: c.name,
      parentName: c.parent?.name ?? null,
      type: c.type === ChannelType.GuildAnnouncement
        ? ('announcement' as const)
        : ('text' as const),
    }));
}
