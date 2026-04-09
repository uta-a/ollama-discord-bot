import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { listVoiceProfiles } from '../lib/voice-profiles.js';
import { getUserVoiceProfile } from '../lib/voice-profiles.js';

export const data = new SlashCommandBuilder()
  .setName('tts-models')
  .setDescription('利用可能なボイスプロファイルの一覧を表示する');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const profiles = await listVoiceProfiles();
  const currentProfileId = getUserVoiceProfile(interaction.user.id);

  if (profiles.length === 0) {
    await interaction.editReply(
      'ボイスプロファイルが見つかりません。\n`tts-server/profiles/` にプロファイルを追加してください。'
    );
    return;
  }

  const lines = profiles.map((p) => {
    const current = p.id === currentProfileId ? ' ← 現在使用中' : '';
    const lang = p.language ? ` [${p.language}]` : '';
    return `• **${p.id}** — ${p.name}${lang}${current}`;
  });

  const content = [
    `**利用可能なボイスプロファイル** (${profiles.length} 件)`,
    '',
    ...lines,
    '',
    '`/tts-model set:<名前>` で切り替えられます。',
  ].join('\n');

  await interaction.editReply(content);
}
