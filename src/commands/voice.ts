import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  joinChannel,
  leaveChannel,
  isConnected,
  getConnectedChannelId,
} from '../lib/voice-manager.js';

export const data = new SlashCommandBuilder()
  .setName('voice')
  .setDescription('ボイスチャンネルの参加・退出')
  .addSubcommand((sub) =>
    sub.setName('join').setDescription('Bot をあなたのボイスチャンネルに参加させる')
  )
  .addSubcommand((sub) =>
    sub.setName('leave').setDescription('Bot をボイスチャンネルから退出させる')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // DM 実行ガード（サーバー専用コマンド）
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'join':
      return handleJoin(interaction);
    case 'leave':
      return handleLeave(interaction);
  }
}

// --- /voice join ---

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加してから実行してください。',
      ephemeral: true,
    });
    return;
  }

  const botMember = interaction.guild!.members.me;
  if (botMember) {
    const perms = voiceChannel.permissionsFor(botMember);
    const missing: string[] = [];
    if (!perms?.has(PermissionFlagsBits.Connect)) missing.push('接続');
    if (!perms?.has(PermissionFlagsBits.Speak)) missing.push('発言');
    if (missing.length > 0) {
      await interaction.reply({
        content: `Bot に **${missing.join('・')}** 権限がありません。サーバー設定を確認してください。`,
        ephemeral: true,
      });
      return;
    }
  }

  try {
    joinChannel(interaction.guildId!, voiceChannel.id, interaction.guild!.voiceAdapterCreator);
    // 参加はチャンネルメンバー全員が把握できるよう public
    await interaction.reply(`**#${voiceChannel.name}** に参加しました。`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.reply({ content: `エラー: ${message}`, ephemeral: true });
  }
}

// --- /voice leave ---

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  if (!isConnected(guildId)) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加していません。',
      ephemeral: true,
    });
    return;
  }

  // 退出前にチャンネル名を取得（退出後は取得不可のため）
  const channelId = getConnectedChannelId(guildId);
  const channel = channelId ? interaction.guild!.channels.cache.get(channelId) : null;
  const channelName = channel?.name ?? '不明なチャンネル';

  leaveChannel(guildId);
  // 退出も join と一貫して public
  await interaction.reply(`**#${channelName}** から退出しました。`);
}
