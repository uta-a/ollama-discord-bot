import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { joinChannel } from '../lib/voice-manager.js';

export const data = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Bot をボイスチャンネルに参加させる');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;

  // 実行者がVCにいるか確認
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加してから実行してください。',
      ephemeral: true,
    });
    return;
  }

  // Bot の権限確認
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
    await interaction.reply(`**#${voiceChannel.name}** に参加しました。`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.reply({ content: `エラー: ${message}`, ephemeral: true });
  }
}
