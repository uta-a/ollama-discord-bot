import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { joinChannel, leaveChannel, isConnected } from '../lib/voice-manager.js';
import { playAudio } from '../lib/voice-manager.js';
import { synthesizeSpeech, TtsError } from '../lib/tts-client.js';
import {
  listVoiceProfiles,
  profileExists,
  getUserVoiceProfile,
  setUserVoiceProfile,
} from '../lib/voice-profiles.js';
import { getGuildConfig } from '../lib/guild-config.js';

export const data = new SlashCommandBuilder()
  .setName('voice')
  .setDescription('ボイスチャンネル・音声読み上げ')
  .addSubcommand((sub) =>
    sub.setName('join').setDescription('Bot をボイスチャンネルに参加させる')
  )
  .addSubcommand((sub) =>
    sub.setName('leave').setDescription('Bot をボイスチャンネルから退出させる')
  )
  .addSubcommand((sub) =>
    sub
      .setName('speak')
      .setDescription('テキストを音声に変換して読み上げる')
      .addStringOption((option) =>
        option
          .setName('prompt')
          .setDescription('読み上げるテキスト')
          .setRequired(true)
          .setMaxLength(500)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('profile')
      .setDescription('使用するボイスプロファイルを切り替える')
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('プロファイル名')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('profiles').setDescription('利用可能なボイスプロファイル一覧を表示する')
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const profiles = await listVoiceProfiles();
    const choices = profiles
      .filter((p) => p.id.toLowerCase().includes(focused) || p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({ name: `${p.id} — ${p.name}`, value: p.id }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'join':
      return handleJoin(interaction);
    case 'leave':
      return handleLeave(interaction);
    case 'speak':
      return handleSpeak(interaction);
    case 'profile':
      return handleProfile(interaction);
    case 'profiles':
      return handleProfiles(interaction);
  }
}

// --- /voice join ---

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加してから実行してください。',
      ephemeral: true,
    });
    return;
  }

  const botMember = interaction.guild!.members.me;
  if (botMember) {
    const perms = voiceChannel.permissionsFor(botMember);
    const missing: string[] = [];
    if (!perms?.has(PermissionFlagsBits.Connect)) missing.push('接続');
    if (!perms?.has(PermissionFlagsBits.Speak)) missing.push('発言');
    if (missing.length > 0) {
      await interaction.reply({
        content: `Bot に **${missing.join('・')}** 権限がありません。サーバー設定を確認してください。`,
        ephemeral: true,
      });
      return;
    }
  }

  try {
    joinChannel(interaction.guildId!, voiceChannel.id, interaction.guild!.voiceAdapterCreator);
    await interaction.reply(`**#${voiceChannel.name}** に参加しました。`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.reply({ content: `エラー: ${message}`, ephemeral: true });
  }
}

// --- /voice leave ---

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isConnected(interaction.guildId!)) {
    await interaction.reply({
      content: 'ボイスチャンネルに参加していません。',
      ephemeral: true,
    });
    return;
  }

  leaveChannel(interaction.guildId!);
  await interaction.reply({ content: 'ボイスチャンネルから退出しました。', ephemeral: true });
}

// --- /voice speak ---

async function handleSpeak(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const guildId = interaction.guildId!;

  // TTS が有効か確認
  if (!getGuildConfig(guildId).tts) {
    await interaction.reply({
      content: 'TTS はこのサーバーで無効になっています。`/bot config key:tts value:true` で有効にできます。',
      ephemeral: true,
    });
    return;
  }

  // Bot が VC にいるか確認
  if (!isConnected(guildId)) {
    await interaction.reply({
      content: '先に `/voice join` でボイスチャンネルに参加してください。',
      ephemeral: true,
    });
    return;
  }

  // ボイスプロファイルの確認
  const profileId = getUserVoiceProfile(interaction.user.id);
  if (!profileId) {
    const profiles = await listVoiceProfiles();
    const hint =
      profiles.length > 0
        ? `\`/voice profiles\` で一覧を確認し、\`/voice profile name:<名前>\` で設定してください。`
        : `\`/voice profiles\` でプロファイル一覧を確認してください。`;

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

// --- /voice profile ---

async function handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
  const profileId = interaction.options.getString('name', true).trim();
  const userId = interaction.user.id;

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
      `プロファイル **${profileId}** が見つかりません。\n\`/voice profiles\` で一覧を確認してください。`
    );
    return;
  }

  setUserVoiceProfile(userId, profileId);
  await interaction.editReply(`ボイスプロファイルを **${profileId}** に切り替えました。`);
}

// --- /voice profiles ---

async function handleProfiles(interaction: ChatInputCommandInteraction): Promise<void> {
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
    '`/voice profile name:<名前>` で切り替えられます。',
  ].join('\n');

  await interaction.editReply(content);
}
