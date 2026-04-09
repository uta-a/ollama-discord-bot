import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { modelExists, OllamaError } from '../lib/ollama.js';
import { setUserModel, getUserModel } from '../lib/conversation.js';

export const data = new SlashCommandBuilder()
  .setName('model')
  .setDescription('使用するモデルを切り替える（/chat の会話履歴はリセットされる）')
  .addStringOption((option) =>
    option
      .setName('set')
      .setDescription('使用するモデル名（例: gemma4, llama3.2）')
      .setRequired(true)
      .setMaxLength(100)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const newModel = interaction.options.getString('set', true).trim();
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const currentModel = getUserModel(channelId, userId);

  if (newModel === currentModel || `${newModel}:latest` === currentModel) {
    await interaction.reply({
      content: `すでに **${currentModel}** を使用しています。`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const exists = await modelExists(newModel);
    if (!exists) {
      await interaction.editReply(
        `モデル **${newModel}** が見つかりません。\n` +
          `\`ollama pull ${newModel}\` でダウンロードしてから再度お試しください。\n` +
          `利用可能なモデルは \`/models\` で確認できます。`
      );
      return;
    }

    setUserModel(channelId, userId, newModel);
    await interaction.editReply(
      `モデルを **${currentModel}** → **${newModel}** に変更しました。\n` +
        `会話履歴もリセットされました。`
    );
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}
