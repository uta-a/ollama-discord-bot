import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { synthesizeSpeech, TtsError } from '../lib/tts-client.js';
import { playAudio, isConnected } from '../lib/voice-manager.js';
import { getUserVoiceProfile, listVoiceProfiles } from '../lib/voice-profiles.js';
import { getGuildConfig } from '../lib/guild-config.js';

export const data = new SlashCommandBuilder()
  .setName('tts')
  .setDescription('テキストを音声に変換してボイスチャンネルで再生する')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('読み上げるテキスト')
      .setRequired(true)
      .setMaxLength(500)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const guildId = interaction.guildId!;

  // TTS が有効か確認
  if (!getGuildConfig(guildId).tts) {
    await interaction.reply({
      content: 'TTS はこのサーバーで無効になっています。`/config key:tts value:true` で有効にできます。',
      ephemeral: true,
    });
    return;
  }

  // Bot がVCにいるか確認
  if (!isConnected(guildId)) {
    await interaction.reply({
      content: '先に `/join` でボイスチャンネルに参加してください。',
      ephemeral: true,
    });
    return;
  }

  // ボイスプロファイルの確認
  const profileId = getUserVoiceProfile(interaction.user.id);
  if (!profileId) {
    // プロファイルが存在するか確認して案内メッセージを調整
    const profiles = await listVoiceProfiles();
    const hint =
      profiles.length > 0
        ? `\`/tts-models\` で一覧を確認し、\`/tts-model set:<名前>\` で設定してください。`
        : `\`/tts-models\` でプロファイル一覧を確認してください。`;

    await interaction.reply({
      content: `ボイスプロファイルが設定されていません。\n${hint}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const audioBuffer = await synthesizeSpeech(prompt, profileId);
    playAudio(guildId, audioBuffer).catch((err) => {
      // 再生エラーは非同期で発生する可能性があるためログのみ
      console.error('TTS 再生エラー:', err);
    });

    await interaction.editReply(
      `**TTS 再生中** | プロファイル: **${profileId}**\n> ${prompt}`
    );
  } catch (err) {
    const errorMessage =
      err instanceof TtsError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}
