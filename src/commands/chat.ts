import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { chatWithHistory, OllamaError } from '../lib/ollama.js';
import { sendLongReply } from '../lib/reply.js';
import {
  getMessages,
  addMessage,
  getUserModel,
  tryLockSession,
  unlockSession,
} from '../lib/conversation.js';

export const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('会話履歴を保持するマルチターン対話（/newchat で履歴リセット）')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('送るメッセージ')
      .setRequired(true)
      .setMaxLength(2000)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  // 同一チャンネル・同一ユーザーの並行実行を防ぐ
  if (!tryLockSession(channelId, userId)) {
    await interaction.reply({
      content: '現在この会話の返答を生成中です。完了してから再度お試しください。',
      ephemeral: true,
    });
    return;
  }

  // Ollama の応答に時間がかかるため先に deferReply() で Discord に通知する
  await interaction.deferReply();

  try {
    const model = getUserModel(channelId, userId);
    const history = getMessages(channelId, userId);
    const userMessage = { role: 'user' as const, content: prompt };

    // ユーザーメッセージを履歴に追加してから Ollama に送信する
    addMessage(channelId, userId, userMessage);

    const assistantMessage = await chatWithHistory([...history, userMessage], model);

    // アシスタントの返答を履歴に保存する
    addMessage(channelId, userId, assistantMessage);

    const turnCount = Math.ceil(getMessages(channelId, userId).length / 2);
    const header = `**[${turnCount} ターン目 | モデル: ${model}]**\n**あなた:** ${prompt}\n\n**Gemma:** `;
    await sendLongReply(interaction, header, assistantMessage.content);
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  } finally {
    unlockSession(channelId, userId);
  }
}
