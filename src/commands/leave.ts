import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { leaveChannel, isConnected } from '../lib/voice-manager.js';

export const data = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Bot をボイスチャンネルから退出させる');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isConnected(interaction.guildId!)) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加していません。',
      ephemeral: true,
    });
    return;
  }

  leaveChannel(interaction.guildId!);
  await interaction.reply({ content: 'ボイスチャンネルから退出しました。', ephemeral: true });
}
