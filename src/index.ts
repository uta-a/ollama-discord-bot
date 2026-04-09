import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, ChatInputCommandInteraction } from 'discord.js';
import { checkModelAvailable } from './lib/ollama.js';
import { loadCommands } from './lib/load-commands.js';
import { startCleanupTimer } from './lib/conversation.js';
import { startOllama } from './lib/ollama-process.js';
import { isTtsServerRunning } from './lib/tts-process.js';
import { leaveAllChannels } from './lib/voice-manager.js';
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
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot として起動しました: ${readyClient.user.tag}`);

  // 会話セッションのクリーンアップタイマーを開始
  startCleanupTimer();

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

  // TTS サーバーヘルスチェック（自動起動はしない）
  const ttsRunning = await isTtsServerRunning();
  if (ttsRunning) {
    console.log('TTS: サーバーは起動しています。');
  } else {
    console.warn('警告: TTS サーバーが起動していません。/tts-server start で起動してください。');
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

    const errorMessage = 'コマンドの実行中にエラーが発生しました。';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
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
