import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { startOllama, stopOllama, isOllamaRunning } from '../lib/ollama-process.js';

export const data = new SlashCommandBuilder()
  .setName('ollama')
  .setDescription('Ollama サーバーを起動・停止する')
  .addStringOption((option) =>
    option
      .setName('action')
      .setDescription('実行するアクション')
      .setRequired(true)
      .addChoices(
        { name: 'start — サーバーを起動', value: 'start' },
        { name: 'stop — サーバーを停止', value: 'stop' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getString('action', true) as 'start' | 'stop';

  await interaction.deferReply({ ephemeral: true });

  try {
    if (action === 'start') {
      const started = await startOllama();
      if (started) {
        await interaction.editReply('Ollama サーバーを起動しました。');
      } else {
        await interaction.editReply('Ollama サーバーはすでに起動しています。');
      }
    } else {
      const stopped = await stopOllama();
      if (stopped) {
        await interaction.editReply('Ollama サーバーを停止しました。');
      } else {
        await interaction.editReply('Ollama サーバーはすでに停止しています。');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`エラー: ${message}`);
  }
}
