import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';

/**
 * レスポンスを Discord に送信する。
 * - 2000文字以内: header + responseText をそのまま editReply
 * - 2000文字超: .txt ファイルとして添付 + 冒頭200文字のプレビュー
 */
export async function sendLongReply(
  interaction: ChatInputCommandInteraction,
  header: string,
  responseText: string
): Promise<void> {
  const fullMessage = header + responseText;

  if (fullMessage.length <= 2000) {
    await interaction.editReply(fullMessage);
    return;
  }

  const file = new AttachmentBuilder(Buffer.from(responseText, 'utf-8'), {
    name: 'response.txt',
  });

  const preview = responseText.slice(0, 200).replace(/\n/g, ' ');
  await interaction.editReply({
    content: `${header}**(全文は添付ファイルを参照)**:\n${preview}...`,
    files: [file],
  });
}
