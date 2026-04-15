import {
  ApplicationIntegrationType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { generateResponse, listModels, OllamaError, DEFAULT_MODEL } from '../lib/ollama.js';
import { sendLongReply } from '../lib/reply.js';
import { processAttachment, AttachmentError } from '../lib/attachment.js';

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('AI に単発で質問する（履歴なし）')
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel
  )
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall
  )
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('質問内容')
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addStringOption((option) =>
    option
      .setName('model')
      .setDescription('使用するモデル（省略でデフォルト）')
      .setAutocomplete(true)
  )
  .addAttachmentOption((option) =>
    option
      .setName('file')
      .setDescription('画像またはテキストファイル（任意）')
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const response = await listModels();
    const choices = response.models
      .map((m) => m.name)
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const model = interaction.options.getString('model') ?? DEFAULT_MODEL;

  await interaction.deferReply();

  try {
    const attachment = interaction.options.getAttachment('file');
    let images: string[] | undefined;
    let effectivePrompt = prompt;

    if (attachment) {
      const result = await processAttachment(attachment);
      if (result.type === 'image') {
        images = [result.base64];
      } else {
        effectivePrompt = `${prompt}\n\n<attached_file name="${result.filename}">\n${result.content}\n</attached_file>`;
      }
    }

    const responseText = await generateResponse(effectivePrompt, model, images);
    await sendLongReply(interaction, '', responseText);
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError || err instanceof AttachmentError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}
