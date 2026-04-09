import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { generateResponse, OllamaError } from '../lib/ollama.js';
import { sendLongReply } from '../lib/reply.js';

export const data = new SlashCommandBuilder()
  .setName('gemma4-thinking')
  .setDescription('Gemma に質問する・標準版 latest（単発・履歴なし）')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('Gemma に送るプロンプト')
      .setRequired(true)
      .setMaxLength(2000)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);

  await interaction.deferReply();

  try {
    const responseText = await generateResponse(prompt, 'gemma4:latest');
    await sendLongReply(interaction, `**Prompt:** ${prompt}\n\n`, responseText);
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}
