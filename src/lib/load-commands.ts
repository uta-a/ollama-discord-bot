import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from './types.js';

/**
 * src/commands/ 配下のファイルを動的に読み込みコマンド一覧を返す。
 *
 * tsx（開発時）は .ts ファイル、tsc ビルド後（本番）は .js ファイルを読む。
 * import.meta.url 基準でパスを解決するため、tsx/tsc 両環境で動作する。
 */
export async function loadCommands(): Promise<Command[]> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const commandsDir = join(__dirname, '..', 'commands');

  const files = await readdir(commandsDir);
  // .ts（tsx/開発）と .js（tsc/本番）の両方に対応
  const commandFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.js'));

  const commands: Command[] = [];
  for (const file of commandFiles) {
    const filePath = join(commandsDir, file);
    // Windows 環境では file:// URL が必要なため pathToFileURL を使う
    const { pathToFileURL } = await import('node:url');
    const mod = await import(pathToFileURL(filePath).href);
    if (mod.data && typeof mod.execute === 'function') {
      commands.push(mod as Command);
    } else {
      console.warn(`警告: ${file} は { data, execute } をエクスポートしていません。スキップします。`);
    }
  }
  return commands;
}
