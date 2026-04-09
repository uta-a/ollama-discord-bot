import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getOllamaStatus } from '../lib/ollama.js';
import { getSessionCount } from '../lib/conversation.js';
import { isTtsServerRunning } from '../lib/tts-process.js';
import { isConnected } from '../lib/voice-manager.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Bot の状態を表示する（処理中リクエスト数、セッション数など）');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const { active, capacity, host, defaultModel } = getOllamaStatus();
  const sessionCount = getSessionCount();
  const ttsRunning = await isTtsServerRunning();
  const vcConnected = isConnected(interaction.guildId!);

  const lines = [
    `**Bot ステータス**`,
    ``,
    `**[LLM]**`,
    `処理中リクエスト: ${active} / ${capacity} 件`,
    `アクティブセッション: ${sessionCount} 件`,
    `デフォルトモデル: ${defaultModel}`,
    `Ollama ホスト: ${host}`,
    ``,
    `**[TTS]**`,
    `TTS サーバー: ${ttsRunning ? '起動中' : '停止中'}`,
    `VC 接続: ${vcConnected ? 'このサーバーに接続中' : '未接続'}`,
  ];

  await interaction.editReply(lines.join('\n'));
}
