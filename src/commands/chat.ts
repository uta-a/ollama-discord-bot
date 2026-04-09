import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { chatWithHistory, listModels, modelExists, OllamaError } from '../lib/ollama.js';
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
  .setDescription('AI とチャットする')
  .addSubcommand((sub) =>
    sub
      .setName('send')
      .setDescription('メッセージを送る（会話履歴あり）')
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
  )
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('会話履歴をクリアする（モデル選択は維持）')
  )
  .addSubcommand((sub) =>
    sub
      .setName('model')
      .setDescription('使用するモデルを切り替える')
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('モデル名')
          .setRequired(true)
          .setAutocomplete(true)
      )
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
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'send':
      return handleSend(interaction);
    case 'reset':
      return handleReset(interaction);
    case 'model':
      return handleModel(interaction);
  }
}

// --- /chat send ---

async function handleSend(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  if (!tryLockSession(channelId, userId)) {
    await interaction.reply({
      content: '現在この会話の返答を生成中です。完了してから再度お試しください。',
      ephemeral: true,
    });
    return;
  }

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

    const turnCount = Math.ceil(getMessages(channelId, userId).length / 2);
    const fileInfo = attachment ? ` | 添付: ${attachment.name}` : '';
    const header = `**[${turnCount} ターン目 | モデル: ${model}${fileInfo}]**\n**あなた:** ${prompt}\n\n**AI:** `;
    await sendLongReply(interaction, header, assistantMessage.content);
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

// --- /chat reset ---

async function handleReset(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const model = getUserModel(channelId, userId);

  clearSession(channelId, userId);

  await interaction.reply({
    content: `会話履歴をクリアしました。新しいチャットを始めましょう！\n使用モデル: **${model}**`,
    ephemeral: true,
  });
}

// --- /chat model ---

async function handleModel(interaction: ChatInputCommandInteraction): Promise<void> {
  const newModel = interaction.options.getString('name', true).trim();
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
          `利用可能なモデルは \`/bot models\` で確認できます。`
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
