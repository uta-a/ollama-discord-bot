import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { profileExists, getUserVoiceProfile, setUserVoiceProfile } from '../lib/voice-profiles.js';

export const data = new SlashCommandBuilder()
  .setName('tts-model')
  .setDescription('使用するボイスプロファイルを切り替える')
  .addStringOption((option) =>
    option
      .setName('set')
      .setDescription('切り替えるボイスプロファイル名（/tts-models で一覧確認）')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const profileId = interaction.options.getString('set', true).trim();
  const userId = interaction.user.id;

  // すでに同じプロファイルを使用中
  if (getUserVoiceProfile(userId) === profileId) {
    await interaction.reply({
      content: `すでにプロファイル **${profileId}** を使用しています。`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const exists = await profileExists(profileId);
  if (!exists) {
    await interaction.editReply(
      `プロファイル **${profileId}** が見つかりません。\n\`/tts-models\` で一覧を確認してください。`
    );
    return;
  }

  setUserVoiceProfile(userId, profileId);
  await interaction.editReply(`ボイスプロファイルを **${profileId}** に切り替えました。`);
}
