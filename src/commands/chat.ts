import {
  ApplicationIntegrationType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { chatWithHistory, listModels, OllamaError } from '../lib/ollama.js';
import { sendLongReply } from '../lib/reply.js';
import {
  getMessages,
  addMessage,
  getUserModel,
  setUserModel,
  clearSession,
  tryLockSession,
  unlockSession,
} from '../lib/conversation.js';
import { processAttachment, AttachmentError } from '../lib/attachment.js';

export const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('AI とチャットする（会話履歴あり）')
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
      .setDescription('送るメッセージ')
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addAttachmentOption((option) =>
    option
      .setName('file')
      .setDescription('画像またはテキストファイル（任意）')
  )
  .addStringOption((option) =>
    option
      .setName('model')
      .setDescription('使用するモデルを切り替える（省略で現在のモデルを維持）')
      .setAutocomplete(true)
  )
  .addBooleanOption((option) =>
    option
      .setName('reset')
      .setDescription('true にすると会話履歴をクリアしてから送信する')
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
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const newModel = interaction.options.getString('model');
  const shouldReset = interaction.options.getBoolean('reset') ?? false;

  if (!tryLockSession(channelId, userId)) {
    await interaction.reply({
      content: '現在この会話の返答を生成中です。完了してから再度お試しください。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // model 指定時はモデル切り替え（内部で履歴リセット）
    if (newModel) {
      setUserModel(channelId, userId, newModel);
    } else if (shouldReset) {
      clearSession(channelId, userId);
    }

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

    const model = getUserModel(channelId, userId);
    const history = getMessages(channelId, userId);

    // 履歴保存時は images を除外（base64 データのメモリ肥大化を防ぐ）
    const userMessageForHistory = { role: 'user' as const, content: effectivePrompt };
    addMessage(channelId, userId, userMessageForHistory);

    // Ollama への送信時のみ images を含める（現在ターンのみ有効）
    const userMessageForOllama = images
      ? { ...userMessageForHistory, images }
      : userMessageForHistory;

    const assistantMessage = await chatWithHistory([...history, userMessageForOllama], model);

    addMessage(channelId, userId, assistantMessage);

    await sendLongReply(interaction, '', assistantMessage.content);
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError || err instanceof AttachmentError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  } finally {
    unlockSession(channelId, userId);
  }
}
