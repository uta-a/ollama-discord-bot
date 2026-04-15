import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { runInteractive } from './admin/cli-interactive.js';
import { runFromArgs } from './admin/cli-args.js';

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('エラー: DISCORD_TOKEN が設定されていません。.env ファイルを確認してください。');
  process.exit(1);
}

// 注意: Bot 本体（npm run dev/start）と同時に起動すると、
// 同じトークンで 2 つの接続が競合して先に起動した方が切断されます。
// Bot 本体が起動中の場合は、Web 管理画面（ADMIN_PANEL_PORT 設定時）を使ってください。

const isArgsMode =
  process.argv.includes('--channel') ||
  process.argv.includes('--json') ||
  process.argv.includes('--content') ||
  process.argv.includes('--file') ||
  process.argv.includes('--embed');

// CLI は短命プロセス。Guilds intent のみ（VC や MessageContent は不要）
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (ready) => {
  console.log(`Bot として接続しました: ${ready.user.tag}`);
  try {
    if (isArgsMode) {
      await runFromArgs(ready, process.argv.slice(2));
    } else {
      await runInteractive(ready);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('エラー:', message);
    process.exitCode = 1;
  } finally {
    await ready.destroy();
  }
});

client.login(DISCORD_TOKEN);
