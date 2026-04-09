import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadCommands } from './lib/load-commands.js';

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

const rest = new REST().setToken(DISCORD_TOKEN);

try {
  const commands = await loadCommands();
  const body = commands.map((c) => c.data.toJSON());

  console.log(`${commands.length} 個のコマンドを登録しています...`);

  const result = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });

  const registered = result as { length: number };
  console.log(`${registered.length} 個のコマンドを登録しました。`);
} catch (err) {
  console.error('コマンド登録中にエラーが発生しました:', err);
  process.exit(1);
}
