import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { listModels, OllamaError } from '../lib/ollama.js';
import { getUserModel } from '../lib/conversation.js';

export const data = new SlashCommandBuilder()
  .setName('models')
  .setDescription('Ollama で利用可能なモデルの一覧を表示する');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const response = await listModels();
    const currentModel = getUserModel(interaction.channelId, interaction.user.id);

    if (response.models.length === 0) {
      await interaction.editReply(
        'Ollama にモデルがありません。`ollama pull <モデル名>` でダウンロードしてください。'
      );
      return;
    }

    const lines = response.models.map((m) => {
      const sizeMB = Math.round(m.size / 1024 / 1024);
      const current = m.name === currentModel || m.name === `${currentModel}:latest` ? ' ← 現在使用中' : '';
      return `• **${m.name}** (${sizeMB} MB)${current}`;
    });

    await interaction.editReply(
      `**利用可能なモデル (${response.models.length} 件)**\n\n${lines.join('\n')}\n\n` +
        `モデルを変える場合は \`/model set:<モデル名>\` を使ってください。`
    );
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}
