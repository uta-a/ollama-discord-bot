import { spawn, exec } from 'node:child_process';

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';

/**
 * Ollama サーバーが起動しているか確認する。
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(OLLAMA_HOST);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ollama サーバーをバックグラウンドで起動する。
 * すでに起動している場合はスキップする。
 * @returns 起動したか（false = すでに起動済み）
 */
export async function startOllama(): Promise<boolean> {
  if (await isOllamaRunning()) {
    return false;
  }

  // detached + unref でプロセスを独立させ、Bot 終了時に巻き込まない
  const child = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // 起動を待つ（最大 10 秒）
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isOllamaRunning()) {
      return true;
    }
  }

  throw new Error('Ollama の起動に失敗しました（10 秒以内に応答がありません）');
}

/**
 * Ollama サーバーを停止する。
 * @returns 停止したか（false = すでに停止済み）
 */
export async function stopOllama(): Promise<boolean> {
  if (!(await isOllamaRunning())) {
    return false;
  }

  return new Promise((resolve, reject) => {
    exec('pkill -f "ollama serve"', (err) => {
      // pkill は対象プロセスが見つからない場合 exit code 1 を返す
      if (err && err.code !== 1) {
        reject(new Error(`Ollama の停止に失敗しました: ${err.message}`));
        return;
      }
      resolve(true);
    });
  });
}
