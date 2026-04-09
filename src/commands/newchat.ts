import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { clearSession, getUserModel } from '../lib/conversation.js';

export const data = new SlashCommandBuilder()
  .setName('newchat')
  .setDescription('会話履歴をクリアして新しいチャットを開始する（モデル選択は維持）');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const model = getUserModel(channelId, userId);

  clearSession(channelId, userId);

  await interaction.reply({
    content: `会話履歴をクリアしました。新しいチャットを始めましょう！\n使用モデル: **${model}**`,
    ephemeral: true,
  });
}
