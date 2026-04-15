import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { isConnected, joinChannel, playAudio } from '../lib/voice-manager.js';
import {
  synthesizeVoicevox,
  fetchSpeakerStyles,
  fetchStyleName,
  VoicevoxError,
} from '../lib/voicevox-client.js';
import { getGuildConfig } from '../lib/guild-config.js';
import { SPEAKERS, SPEAKER_CHOICES, type SpeakerKey } from '../lib/voicevox-speakers.js';
import { getUserProfile, setUserProfile } from '../lib/user-profile.js';
import {
  enableAutoRead,
  disableAutoRead,
  isAutoReadEnabled,
  enableAutoReadChannel,
  disableAutoReadChannel,
  getAutoReadChannelConfig,
  type ChannelAutoReadConfig,
} from '../lib/auto-read.js';
import {
  getGuildDict,
  addDictEntry,
  removeDictEntry,
  ensureVoicevoxDictLoaded,
  type DictEntry,
} from '../lib/voicevox-dict.js';

export const data = new SlashCommandBuilder()
  .setName('voicevox')
  .setDescription('VOICEVOX 関連コマンド')
  .addSubcommand((sub) =>
    sub
      .setName('say')
      .setDescription('テキストを一回だけ読み上げる')
      .addStringOption((option) =>
        option
          .setName('text')
          .setDescription('読み上げるテキスト')
          .setRequired(true)
          .setMaxLength(200)
      )
      .addStringOption((option) =>
        option
          .setName('speaker')
          .setDescription('声のキャラクター（省略するとプロファイルの設定を使用）')
          .setRequired(false)
          .addChoices(...SPEAKER_CHOICES)
      )
      .addIntegerOption((option) =>
        option
          .setName('style')
          .setDescription('声のスタイル（省略時はノーマル）')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('auto')
      .setDescription('自動読み上げを ON にする（以降 / なしのメッセージを読み上げ）')
      .addStringOption((option) =>
        option
          .setName('speaker')
          .setDescription('声のキャラクター')
          .setRequired(true)
          .addChoices(...SPEAKER_CHOICES)
      )
      .addIntegerOption((option) =>
        option
          .setName('style')
          .setDescription('声のスタイル（省略時はノーマル）')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('stop')
      .setDescription('このチャンネルでの自動読み上げを OFF にする（自分のみ）')
  )
  .addSubcommand((sub) =>
    sub
      .setName('auto-all')
      .setDescription('このチャンネルの全員のメッセージを自動読み上げする')
      .addStringOption((option) =>
        option
          .setName('speaker')
          .setDescription('フォールバック声（プロファイル未登録ユーザー用）')
          .setRequired(true)
          .addChoices(...SPEAKER_CHOICES)
      )
      .addIntegerOption((option) =>
        option
          .setName('style')
          .setDescription('フォールバック声のスタイル（省略時はノーマル）')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('stop-all')
      .setDescription('このチャンネルの全員読み上げを OFF にする')
  )
  .addSubcommand((sub) =>
    sub
      .setName('profile')
      .setDescription('デフォルトの声（プロファイル）を設定する')
      .addStringOption((option) =>
        option
          .setName('speaker')
          .setDescription('声のキャラクター')
          .setRequired(true)
          .addChoices(...SPEAKER_CHOICES)
      )
      .addIntegerOption((option) =>
        option
          .setName('style')
          .setDescription('声のスタイル（省略時はノーマル）')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('現在の VOICEVOX 状態を確認する（VC 接続・自動読み上げ・プロファイル・辞書件数）')
  )
  .addSubcommandGroup((group) =>
    group
      .setName('dict')
      .setDescription('VOICEVOX 読み上げ辞書の管理')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('辞書に単語を追加する')
          .addStringOption((option) =>
            option
              .setName('surface')
              .setDescription('表記（例: ずんだもん）')
              .setRequired(true)
              .setMaxLength(32)
              .setAutocomplete(true)
          )
          .addStringOption((option) =>
            option
              .setName('pronunciation')
              .setDescription('読み・カタカナ（例: ズンダモン）')
              .setRequired(true)
              .setMaxLength(100)
          )
          .addIntegerOption((option) =>
            option
              .setName('accent_type')
              .setDescription('アクセント核位置 0〜4（省略時: 0 = 平板）')
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(4)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('登録済みの辞書単語一覧を表示する')
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('辞書から単語を削除する')
          .addStringOption((option) =>
            option
              .setName('surface')
              .setDescription('削除する表記（例: ずんだもん）')
              .setRequired(true)
              .setMaxLength(32)
              .setAutocomplete(true)
          )
      )
  );

// --- /voicevox autocomplete ---

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  // dict add / remove の surface autocomplete
  if (group === 'dict' && (sub === 'add' || sub === 'remove')) {
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }
    const entries = getGuildDict(interaction.guildId);
    const query = interaction.options.getFocused().toString().toLowerCase();
    const filtered = query
      ? entries.filter(
          (e) =>
            e.surface.toLowerCase().includes(query) ||
            e.pronunciation.toLowerCase().includes(query)
        )
      : [...entries];

    await interaction.respond(
      filtered.slice(0, 25).map((e) => {
        const raw = `${e.surface} → ${e.pronunciation}`;
        const name = raw.length > 97 ? raw.slice(0, 97) + '…' : raw;
        return { name, value: e.surface };
      })
    );
    return;
  }

  // style autocomplete（既存ロジック）
  const speakerKey = interaction.options.getString('speaker') as SpeakerKey | null;

  if (!speakerKey || !(speakerKey in SPEAKERS)) {
    await interaction.respond([]);
    return;
  }

  const normalStyleId = SPEAKERS[speakerKey].id;
  const styles = await fetchSpeakerStyles(normalStyleId);

  if (styles.length === 0) {
    await interaction.respond([{ name: 'ノーマル', value: normalStyleId }]);
    return;
  }

  const query = interaction.options.getFocused().toString().toLowerCase();
  const filtered = query
    ? styles.filter((s) => s.name.toLowerCase().includes(query) || String(s.id).includes(query))
    : styles;

  await interaction.respond(
    filtered.slice(0, 25).map((s) => ({ name: `${s.name} (${s.id})`, value: s.id }))
  );
}

// --- /voicevox execute ---

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      ephemeral: true,
    });
    return;
  }

  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  // voicevox 機能が有効か確認（stop / stop-all / status は制限なしで使えるようにする）
  const isStopCommand =
    !subcommandGroup &&
    (subcommand === 'stop' || subcommand === 'stop-all' || subcommand === 'status');
  if (!isStopCommand && !getGuildConfig(interaction.guildId).voicevox) {
    await interaction.reply({
      content:
        'VOICEVOX はこのサーバーで無効になっています。`/bot config key:voicevox value:true` で有効にできます。',
      ephemeral: true,
    });
    return;
  }

  if (subcommandGroup === 'dict') {
    switch (subcommand) {
      case 'add':
        return handleDictAdd(interaction);
      case 'list':
        return handleDictList(interaction);
      case 'remove':
        return handleDictRemove(interaction);
    }
    return;
  }

  switch (subcommand) {
    case 'say':
      return handleSay(interaction);
    case 'auto':
      return handleAuto(interaction);
    case 'stop':
      return handleStop(interaction);
    case 'auto-all':
      return handleAutoAll(interaction);
    case 'stop-all':
      return handleStopAll(interaction);
    case 'profile':
      return handleProfile(interaction);
    case 'status':
      return handleStatus(interaction);
  }
}

// --- /voicevox say ---

async function handleSay(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString('text', true);
  const speakerKey = interaction.options.getString('speaker') as SpeakerKey | null;
  const styleId = interaction.options.getInteger('style') ?? null;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  // speaker 未指定 → プロファイルから取得
  let effectiveSpeakerKey: SpeakerKey;
  let effectiveStyleId: number;

  if (speakerKey) {
    effectiveSpeakerKey = speakerKey;
    effectiveStyleId = styleId ?? SPEAKERS[speakerKey].id;
  } else {
    const profile = getUserProfile(userId);
    if (!profile) {
      await interaction.reply({
        content:
          'デフォルトの声が未登録です。`/voicevox profile` で設定するか、`speaker:` を指定して再実行してください。',
        ephemeral: true,
      });
      return;
    }
    effectiveSpeakerKey = profile.speakerKey as SpeakerKey;
    effectiveStyleId = styleId ?? profile.speakerId;
  }

  await ensureVcConnected(interaction, guildId);
  if (!isConnected(guildId)) return;

  const { label: speakerLabel } = SPEAKERS[effectiveSpeakerKey];
  await interaction.deferReply();
  await interaction.editReply(
    `**音声を生成中...** | スピーカー: **${speakerLabel}**\n>>> ${text}`
  );

  try {
    // 辞書をこのギルド用に同期（失敗しても読み上げは続行）
    try {
      await ensureVoicevoxDictLoaded(guildId);
    } catch (dictErr) {
      console.warn('辞書の同期に失敗しました（読み上げは続行します）:', dictErr);
    }

    const styleName = await fetchStyleName(effectiveStyleId) ?? String(effectiveStyleId);
    const audioBuffer = await synthesizeVoicevox(text, effectiveStyleId);
    await playAudio(guildId, audioBuffer);
    await interaction.editReply(
      `**VOICEVOX 再生中** | スピーカー: **${speakerLabel}** | スタイル: **${styleName}**\n>>> ${text}`
    );
  } catch (err) {
    const errorMessage =
      err instanceof VoicevoxError
        ? err.message
        : err instanceof Error
          ? `再生中にエラーが発生しました: ${err.message}`
          : `予期しないエラーが発生しました: ${String(err)}`;
    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}

// --- /voicevox auto ---

async function handleAuto(interaction: ChatInputCommandInteraction): Promise<void> {
  const speakerKey = interaction.options.getString('speaker', true) as SpeakerKey;
  const styleId = interaction.options.getInteger('style') ?? null;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const effectiveStyleId = styleId ?? SPEAKERS[speakerKey].id;
  const { label: speakerLabel } = SPEAKERS[speakerKey];

  // VC に接続していなければ自動参加（defer 前に呼ぶ。失敗時は ensureVcConnected 内で ephemeral 返信）
  await ensureVcConnected(interaction, guildId);
  if (!isConnected(guildId)) return;

  // VOICEVOX への HTTP 呼び出しが入るため 3 秒超過に備えて defer する
  await interaction.deferReply();

  // VC 接続を確認してからプロファイルを保存（失敗してもプロファイルが上書きされないようにする）
  await setUserProfile(userId, { speakerId: effectiveStyleId, speakerKey });
  enableAutoRead(channelId, userId);

  const styleName = await fetchStyleName(effectiveStyleId) ?? String(effectiveStyleId);
  await interaction.editReply(
    `**自動読み上げ ON** | スピーカー: **${speakerLabel}** | スタイル: **${styleName}**\n` +
    `このチャンネルで \`/\` を付けずに送信したメッセージを読み上げます。\n` +
    `停止するには \`/voicevox stop\` を使用してください。`
  );
}

// --- /voicevox stop ---

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  if (!isAutoReadEnabled(channelId, userId)) {
    await interaction.reply({
      content: 'このチャンネルでの自動読み上げは既に OFF です。',
      ephemeral: true,
    });
    return;
  }

  disableAutoRead(channelId, userId);
  await interaction.reply({ content: '**自動読み上げを OFF にしました。**', ephemeral: true });
}

// --- /voicevox auto-all ---

async function handleAutoAll(interaction: ChatInputCommandInteraction): Promise<void> {
  const speakerKey = interaction.options.getString('speaker', true) as SpeakerKey;
  const styleId = interaction.options.getInteger('style') ?? null;
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  const effectiveStyleId = styleId ?? SPEAKERS[speakerKey].id;
  const { label: speakerLabel } = SPEAKERS[speakerKey];

  // VC に接続していなければ自動参加（defer 前に呼ぶ）
  await ensureVcConnected(interaction, guildId);
  if (!isConnected(guildId)) return;

  // VOICEVOX への HTTP 呼び出しが入るため 3 秒超過に備えて defer する
  await interaction.deferReply();

  const config: ChannelAutoReadConfig = {
    fallbackSpeakerId: effectiveStyleId,
    fallbackSpeakerKey: speakerKey,
  };
  enableAutoReadChannel(channelId, config);

  const styleName = await fetchStyleName(effectiveStyleId) ?? String(effectiveStyleId);
  await interaction.editReply(
    `**全員読み上げ ON** | フォールバック声: **${speakerLabel}** | スタイル: **${styleName}**\n` +
    `このチャンネルのすべてのメッセージを読み上げます。\n` +
    `個人プロファイルが登録済みのユーザーはその声、未登録ユーザーは上記フォールバック声を使います。\n` +
    `停止するには \`/voicevox stop-all\` を使用してください。`
  );
}

// --- /voicevox stop-all ---

async function handleStopAll(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const member = interaction.member as GuildMember;

  // 全員読み上げを勝手に止められないよう、メッセージの管理権限を要求する
  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({
      content: 'このコマンドには **メッセージの管理** 権限が必要です。',
      ephemeral: true,
    });
    return;
  }

  if (!getAutoReadChannelConfig(channelId)) {
    await interaction.reply({
      content: 'このチャンネルでの全員読み上げは既に OFF です。',
      ephemeral: true,
    });
    return;
  }

  disableAutoReadChannel(channelId);
  await interaction.reply({ content: '**全員読み上げを OFF にしました。**', ephemeral: true });
}

// --- /voicevox profile ---

async function handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
  const speakerKey = interaction.options.getString('speaker', true) as SpeakerKey;
  const styleId = interaction.options.getInteger('style') ?? null;
  const userId = interaction.user.id;

  const effectiveStyleId = styleId ?? SPEAKERS[speakerKey].id;
  const { label: speakerLabel } = SPEAKERS[speakerKey];

  // VOICEVOX への HTTP 呼び出しが入るため 3 秒超過に備えて defer する（ephemeral 継承）
  await interaction.deferReply({ ephemeral: true });

  await setUserProfile(userId, { speakerId: effectiveStyleId, speakerKey });

  const styleName = await fetchStyleName(effectiveStyleId) ?? String(effectiveStyleId);
  await interaction.editReply({
    content:
      `プロファイルを保存しました。\n` +
      `スピーカー: **${speakerLabel}** | スタイル: **${styleName}**`,
  });
}

// --- /voicevox dict add ---

async function handleDictAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const surface = interaction.options.getString('surface', true);
  const pronunciation = interaction.options.getString('pronunciation', true);
  const accentType = interaction.options.getInteger('accent_type') ?? 0;
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  // 読みはカタカナ（ァ〜ヶ + 長音符）のみ許可（中点 ・ や記号は不可）
  if (!/^[\u30A1-\u30F6\u30FC]+$/.test(pronunciation)) {
    await interaction.editReply({
      content: '`pronunciation` はカタカナ（例: ズンダモン）で入力してください。ひらがな・英字・記号は使用できません。',
    });
    return;
  }

  // VOICEVOX のアクセント型は 0〜4 の範囲（Discord 側で setMaxValue しているが念のため二重チェック）
  if (!Number.isInteger(accentType) || accentType < 0 || accentType > 4) {
    await interaction.editReply({
      content: '`accent_type` は 0〜4 の整数で指定してください。',
    });
    return;
  }

  const entry: DictEntry = { surface, pronunciation, accentType };
  try {
    await addDictEntry(guildId, entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : '辞書への追加に失敗しました。';
    await interaction.editReply({ content: message });
    return;
  }

  // 記号のみの surface は VOICEVOX のトークナイザが単語と認識しないため反映されない
  const symbolWarning = /^[\p{P}\p{S}]+$/u.test(surface)
    ? '\n⚠️ `surface` が記号のみのため、VOICEVOX の読み上げに反映されない可能性があります（VOICEVOX の仕様上、記号類は辞書対象外です）。'
    : '';

  await interaction.editReply({
    content:
      `辞書に追加しました。\n` +
      `**${surface}** → **${pronunciation}**（アクセント核: ${accentType}）\n` +
      `次の読み上げから反映されます。${symbolWarning}`,
  });
}

// --- /voicevox dict list ---

async function handleDictList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  const entries = getGuildDict(guildId);

  if (entries.length === 0) {
    await interaction.editReply({ content: '辞書に登録されている単語はありません。' });
    return;
  }

  const MAX_DICT_ENTRIES = 50;
  const MAX_DISPLAY = 30;
  const display = entries.slice(0, MAX_DISPLAY);

  const lines = display.map((e) => `• ${e.surface} → ${e.pronunciation} (accent: ${e.accentType})`);
  // Embed description は 4096 文字が上限。超える場合は収まる範囲に絞る
  let displayedCount = lines.length;
  let description = lines.join('\n');
  if (description.length > 4000) {
    const safe: string[] = [];
    for (const line of lines) {
      if ((safe.join('\n') + '\n' + line).length > 4000) break;
      safe.push(line);
    }
    description = safe.join('\n');
    displayedCount = safe.length;
  }
  // 1件目だけで 4000 文字を超える極端なケースへの保護
  if (!description) {
    description = '（エントリが長すぎて表示できません。`/voicevox dict remove` で削除してください）';
    displayedCount = 0;
  }

  const overflow = entries.length - displayedCount;

  const embed = new EmbedBuilder()
    .setTitle(`VOICEVOX 辞書（${entries.length} / ${MAX_DICT_ENTRIES} 件）`)
    .setDescription(description)
    .setColor(0x5865f2);

  if (overflow > 0) {
    embed.setFooter({ text: `他 ${overflow} 件 — /voicevox dict remove の候補で絞り込めます` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// --- /voicevox dict remove ---

async function handleDictRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const surface = interaction.options.getString('surface', true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  const removed = await removeDictEntry(guildId, surface);

  if (!removed) {
    await interaction.editReply({
      content: `「**${surface}**」は辞書に登録されていません。\`/voicevox dict list\` で登録済みの表記を確認できます。`,
    });
    return;
  }

  await interaction.editReply({ content: `辞書から削除しました: **${surface}**` });
}

// --- /voicevox status ---

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  await interaction.deferReply({ ephemeral: true });

  const vcStatus = isConnected(guildId) ? '接続中' : '未接続';
  const autoReadStatus = isAutoReadEnabled(channelId, userId) ? 'ON（このチャンネル）' : 'OFF';

  const channelConfig = getAutoReadChannelConfig(channelId);
  let autoAllStatus: string;
  if (channelConfig) {
    const fallbackLabel = SPEAKERS[channelConfig.fallbackSpeakerKey as SpeakerKey]?.label ?? channelConfig.fallbackSpeakerKey;
    autoAllStatus = `ON（フォールバック声: ${fallbackLabel}）`;
  } else {
    autoAllStatus = 'OFF';
  }

  const profile = getUserProfile(userId);
  let profileStatus: string;
  if (profile) {
    const speakerLabel = SPEAKERS[profile.speakerKey as SpeakerKey]?.label ?? profile.speakerKey;
    const styleName = await fetchStyleName(profile.speakerId) ?? String(profile.speakerId);
    profileStatus = `${speakerLabel} / ${styleName}`;
  } else {
    profileStatus = '未登録（`/voicevox profile` で設定できます）';
  }

  const MAX_DICT_ENTRIES = 50;
  const dictCount = getGuildDict(guildId).length;

  const embed = new EmbedBuilder()
    .setTitle('VOICEVOX 状態')
    .setColor(0x5865f2)
    .addFields(
      { name: 'VC 接続', value: vcStatus, inline: true },
      { name: '自分の自動読み上げ', value: autoReadStatus, inline: true },
      { name: 'チャンネル全員読み上げ', value: autoAllStatus, inline: false },
      { name: 'マイプロファイル', value: profileStatus, inline: false },
      { name: '辞書エントリ', value: `${dictCount} / ${MAX_DICT_ENTRIES} 件`, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}

// --- 内部ユーティリティ ---

/**
 * VC に接続していない場合、実行者の VC チャンネルに自動参加を試みる。
 * 失敗した場合は interaction にエラーを返信し、呼び出し元は isConnected で確認する。
 */
async function ensureVcConnected(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  if (isConnected(guildId)) return;

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
  if (!botMember) {
    await interaction.reply({
      content: 'Bot の権限情報を取得できませんでした。しばらく待ってから再試行してください。',
      ephemeral: true,
    });
    return;
  }

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

  try {
    joinChannel(guildId, voiceChannel.id, interaction.guild!.voiceAdapterCreator);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.reply({ content: `VC への参加に失敗しました: ${message}`, ephemeral: true });
  }
}
