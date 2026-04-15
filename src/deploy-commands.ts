import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadCommands } from './lib/load-commands.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error(
    'エラー: 以下の環境変数が設定されていません。.env ファイルを確認してください。\n' +
      (!DISCORD_TOKEN ? '  - DISCORD_TOKEN\n' : '') +
      (!CLIENT_ID ? '  - CLIENT_ID\n' : '')
  );
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

try {
  const commands = await loadCommands();
  const body = commands.map((c) => c.data.toJSON());

  // 旧 guild コマンドを削除（global と重複表示を防ぐ）
  if (GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
      console.log('旧 guild コマンドをクリアしました。');
    } catch (err) {
      console.warn('旧 guild コマンドのクリアに失敗しました（スキップして続行）:', err);
    }
  } else {
    console.warn(
      '警告: GUILD_ID が未設定のため旧 guild コマンドの削除はスキップされました。\n' +
        '過去に guild コマンドを登録していた場合は、GUILD_ID を設定して再実行してください。'
    );
  }

  console.log(`${commands.length} 個のコマンドをグローバル登録しています...`);

  const result = await rest.put(Routes.applicationCommands(CLIENT_ID), { body });

  const registered = result as { length: number };
  console.log(
    `${registered.length} 個のコマンドをグローバル登録しました（反映に最大 1 時間かかります）。`
  );
} catch (err) {
  console.error('コマンド登録中にエラーが発生しました:', err);
  process.exit(1);
}
