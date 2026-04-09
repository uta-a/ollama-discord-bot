import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { startTtsServer, stopTtsServer, isTtsServerRunning } from '../lib/tts-process.js';

export const data = new SlashCommandBuilder()
  .setName('tts-server')
  .setDescription('TTS サーバーを起動・停止する')
  .addStringOption((option) =>
    option
      .setName('action')
      .setDescription('実行するアクション')
      .setRequired(true)
      .addChoices(
        { name: 'start — サーバーを起動', value: 'start' },
        { name: 'stop — サーバーを停止', value: 'stop' },
        { name: 'status — 起動状態を確認', value: 'status' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getString('action', true) as 'start' | 'stop' | 'status';

  await interaction.deferReply({ ephemeral: true });

  try {
    if (action === 'start') {
      const started = await startTtsServer();
      if (started) {
        await interaction.editReply('TTS サーバーを起動しました。');
      } else {
        await interaction.editReply('TTS サーバーはすでに起動しています。');
      }
    } else if (action === 'stop') {
      const stopped = await stopTtsServer();
      if (stopped) {
        await interaction.editReply('TTS サーバーを停止しました。');
      } else {
        await interaction.editReply('TTS サーバーはすでに停止しています。');
      }
    } else {
      const running = await isTtsServerRunning();
      await interaction.editReply(
        running ? 'TTS サーバーは起動しています。' : 'TTS サーバーは停止しています。'
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`エラー: ${message}`);
  }
}
