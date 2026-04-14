import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
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

/**
 * VOICEVOX スピーカー定義（すべてノーマルスタイル）。
 * ID は VOICEVOX エンジンの GET /speakers で確認可能。
 * 追加する場合は addChoices の最大 25 件に注意。
 */
const SPEAKERS = {
  metan: { id: 2, label: '四国めたん' },
  zundamon: { id: 3, label: 'ずんだもん' },
  tsumugi: { id: 8, label: '春日部つむぎ' },
  ritsu: { id: 9, label: '波音リツ' },
  hau: { id: 10, label: '雨晴はう' },
  takehiro: { id: 11, label: '玄野武宏' },
  kotaro: { id: 12, label: '白上虎太郎' },
  ryusei: { id: 13, label: '青山龍星' },
  himari: { id: 14, label: '冥鳴ひまり' },
  sora: { id: 16, label: '九州そら' },
  mochiko: { id: 20, label: 'もち子さん' },
  mesuo: { id: 21, label: '剣崎雌雄' },
} as const satisfies Record<string, { id: number; label: string }>;

type SpeakerKey = keyof typeof SPEAKERS;

const SPEAKER_CHOICES = (Object.entries(SPEAKERS) as Array<[SpeakerKey, (typeof SPEAKERS)[SpeakerKey]]>).map(
  ([value, { label }]) => ({ name: label, value })
);

export const data = new SlashCommandBuilder()
  .setName('voicevox')
  .setDescription('VOICEVOX でテキストを音声に変換して読み上げる')
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
  );

// --- /voicevox autocomplete ---

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const speakerKey = interaction.options.getString('speaker') as SpeakerKey | null;

  if (!speakerKey || !(speakerKey in SPEAKERS)) {
    await interaction.respond([]);
    return;
  }

  const normalStyleId = SPEAKERS[speakerKey].id;
  const styles = await fetchSpeakerStyles(normalStyleId);

  // VOICEVOX が起動していない場合はノーマルだけ返す
  if (styles.length === 0) {
    await interaction.respond([{ name: 'ノーマル', value: normalStyleId }]);
    return;
  }

  // ユーザーの入力で絞り込み（スタイル名 or ID の部分一致）
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
  // DM 実行ガード（サーバー専用コマンド）
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      ephemeral: true,
    });
    return;
  }

  const text = interaction.options.getString('text', true);
  const speakerKey = interaction.options.getString('speaker', true) as SpeakerKey;
  const styleId = interaction.options.getInteger('style') ?? null;
  const guildId = interaction.guildId;

  // VOICEVOX が有効か確認
  if (!getGuildConfig(guildId).voicevox) {
    await interaction.reply({
      content:
        'VOICEVOX はこのサーバーで無効になっています。`/bot config key:voicevox value:true` で有効にできます。',
      ephemeral: true,
    });
    return;
  }

  // Bot が VC にいない場合は自動参加
  if (!isConnected(guildId)) {
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

    joinChannel(guildId, voiceChannel.id, interaction.guild!.voiceAdapterCreator);
  }

  const { id: normalStyleId, label: speakerLabel } = SPEAKERS[speakerKey];
  const effectiveStyleId = styleId ?? normalStyleId;

  await interaction.deferReply();
  await interaction.editReply(
    `**音声を生成中...** | スピーカー: **${speakerLabel}**\n>>> ${text}`
  );

  try {
    // style が指定されている場合はスタイル名を取得して表示に使う（キャッシュ済みなので高速）
    const styleName = styleId !== null ? (await fetchStyleName(styleId) ?? String(styleId)) : 'ノーマル';

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
