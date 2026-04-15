import 'dotenv/config';
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  ChatInputCommandInteraction,
} from 'discord.js';
import { checkModelAvailable } from './lib/ollama.js';
import { loadCommands } from './lib/load-commands.js';
import { startCleanupTimer } from './lib/conversation.js';
import { startOllama } from './lib/ollama-process.js';
import { leaveAllChannels, setPlayStateCallback, isConnected } from './lib/voice-manager.js';
import { loadUserProfiles, getUserProfile } from './lib/user-profile.js';
import { isAutoReadEnabled, sanitizeForTTS, getAutoReadChannelConfig } from './lib/auto-read.js';
import { loadVoicevoxDict, ensureVoicevoxDictLoaded } from './lib/voicevox-dict.js';
import { synthesizeVoicevox } from './lib/voicevox-client.js';
import { playAudio } from './lib/voice-manager.js';
import { loadReactionDict, findMatchingReaction } from './lib/reaction-dict.js';
import type { Command } from './lib/types.js';

// 環境変数バリデーション
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    'エラー: 以下の環境変数が設定されていません。.env ファイルを確認してください。\n' +
      (!DISCORD_TOKEN ? '  - DISCORD_TOKEN\n' : '') +
      (!CLIENT_ID ? '  - CLIENT_ID\n' : '') +
      (!GUILD_ID ? '  - GUILD_ID\n' : '')
  );
  process.exit(1);
}

// コマンドコレクション
const commands = new Collection<string, Command>();

// コマンドを動的ロード
const commandList = await loadCommands();
for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}
console.log(`${commands.size} 個のコマンドを読み込みました: ${[...commands.keys()].join(', ')}`);

// Discordクライアント初期化
// GatewayIntentBits.GuildVoiceStates はボイスチャンネル接続に必要
// GatewayIntentBits.GuildMessages + MessageContent は自動読み上げに必要（privileged intent）
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot として起動しました: ${readyClient.user.tag}`);

  // 会話セッションのクリーンアップタイマーを開始
  startCleanupTimer();

  // ユーザープロファイルと辞書を読み込む
  await loadUserProfiles();
  await loadVoicevoxDict();
  await loadReactionDict();

  // 再生状態に応じて Bot のアクティビティを更新
  setPlayStateCallback((isPlaying) => {
    if (isPlaying) {
      readyClient.user.setActivity('VOICEVOX', { type: ActivityType.Playing });
    } else {
      readyClient.user.setPresence({ activities: [] });
    }
  });

  // Ollama を自動起動する（すでに起動中ならスキップ）
  try {
    const started = await startOllama();
    console.log(started ? 'Ollama: サーバーを起動しました。' : 'Ollama: サーバーはすでに起動しています。');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`警告: Ollama の自動起動に失敗しました。\n${message}`);
    console.warn('/ollama start で手動起動してください。');
  }

  // Ollamaヘルスチェック（失敗しても Bot の起動は継続する）
  try {
    await checkModelAvailable();
    console.log(`Ollama: モデル "${process.env.OLLAMA_MODEL ?? 'gemma4'}" の準備ができています。`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`警告: Ollama のヘルスチェックに失敗しました。\n${message}`);
    console.warn('Bot は起動しますが、/gemma4 コマンドは正常に動作しない可能性があります。');
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`オートコンプリート "${interaction.commandName}" でエラーが発生しました:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    console.error(`コマンド "${interaction.commandName}" の実行中にエラーが発生しました:`, err);

    // interaction が既にタイムアウトしている（Unknown interaction 10062）ケースもあるため、
    // エラー返信自体が失敗する可能性を考慮して try/catch で包む（Client の error イベントで落とさない）
    const errorMessage = 'コマンドの実行中にエラーが発生しました。';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyErr) {
      console.warn('エラーメッセージの送信に失敗しました:', replyErr);
    }
  }
});

// 他 Bot とのキーワード反応無限ループを防ぐため、チャンネル単位で
// 「直近に Bot 発言へ反応した時刻」を記録する（ユーザー発言への反応は cooldown 対象外）
const botReactionCooldowns = new Map<string, number>();
const BOT_REACTION_COOLDOWN_MS = 10_000;

// 自動読み上げ: / なしで送信されたメッセージを VOICEVOX で読み上げる
// 個人モード（isAutoReadEnabled）と全員モード（getAutoReadChannelConfig）の両方に対応
client.on(Events.MessageCreate, async (message) => {
  // 自分自身（Bot）のメッセージは無視（他の Bot は読み上げ対象）
  if (message.author.id === client.user?.id) return;

  // DM は無視
  if (!message.inGuild()) return;

  const channelId = message.channelId;
  const userId = message.author.id;
  const guildId = message.guildId;

  // キーワード反応（VC 接続に依存しない。どこでも動作する）
  // 他 Bot から連続してトリガーされた場合は cooldown で間引き、無限ループを防ぐ
  try {
    const match = findMatchingReaction(guildId, message.content);
    if (match) {
      const isBotAuthor = message.author.bot;
      const lastBotReplyAt = botReactionCooldowns.get(channelId);
      const now = Date.now();
      const inCooldown =
        isBotAuthor &&
        lastBotReplyAt !== undefined &&
        now - lastBotReplyAt < BOT_REACTION_COOLDOWN_MS;

      if (!inCooldown) {
        await message.reply({ content: match.response, allowedMentions: { parse: [] } });
        if (isBotAuthor) {
          botReactionCooldowns.set(channelId, now);
        }
      }
    }
  } catch (err) {
    console.warn('キーワード反応の送信に失敗しました:', err);
  }

  // Bot が VC に接続していなければ無視
  if (!isConnected(guildId)) return;

  // テキストを前処理（URL・コード除去など）。両モード共通で 1 回だけ実行
  const sanitized = sanitizeForTTS(message.content);
  if (!sanitized) return;

  // 個人モード優先: ON のユーザーはプロファイルの声で読み上げて終了（全員モードは重複防止のためスキップ）
  if (isAutoReadEnabled(channelId, userId)) {
    const profile = getUserProfile(userId);
    if (!profile) return;
    try {
      try {
        await ensureVoicevoxDictLoaded(guildId);
      } catch (dictErr) {
        console.warn('辞書の同期に失敗しました（読み上げは続行します）:', dictErr);
      }
      const audioBuffer = await synthesizeVoicevox(sanitized, profile.speakerId);
      await playAudio(guildId, audioBuffer);
    } catch (err) {
      console.warn(`自動読み上げ（個人モード）でエラーが発生しました (userId=${userId}):`, err);
    }
    return;
  }

  // 全員モード: チャンネル設定があれば、プロファイル優先 + フォールバック声で読み上げ
  const channelConfig = getAutoReadChannelConfig(channelId);
  if (!channelConfig) return;

  const profile = getUserProfile(userId);
  // プロファイル登録済みならその声、未登録ならフォールバック声を使う
  const speakerId = profile?.speakerId ?? channelConfig.fallbackSpeakerId;
  const speakerLabel = profile ? profile.speakerKey : channelConfig.fallbackSpeakerKey;

  try {
    try {
      await ensureVoicevoxDictLoaded(guildId);
    } catch (dictErr) {
      console.warn('辞書の同期に失敗しました（読み上げは続行します）:', dictErr);
    }
    const audioBuffer = await synthesizeVoicevox(sanitized, speakerId);
    await playAudio(guildId, audioBuffer);
  } catch (err) {
    console.warn(`自動読み上げ（全員モード）でエラーが発生しました (userId=${userId}, speaker=${speakerLabel}):`, err);
  }
});

// Graceful shutdown: VC接続を切断してから終了する
const shutdown = () => {
  console.log('シャットダウン中...');
  leaveAllChannels();
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(DISCORD_TOKEN);
