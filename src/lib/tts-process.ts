import { spawn, exec } from 'node:child_process';

const TTS_SERVER_HOST = process.env.TTS_SERVER_HOST ?? 'http://127.0.0.1:8880';
const TTS_START_CMD = process.env.TTS_START_CMD ?? '';
const TTS_STOP_CMD = process.env.TTS_STOP_CMD ?? '';

/**
 * TTS サーバーが起動しているか確認する。
 */
export async function isTtsServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_SERVER_HOST}/health`);
    return response.ok;
  } catch {
    // /health がない場合は /v1/audio/speech への到達性を確認
    try {
      const response = await fetch(TTS_SERVER_HOST);
      return response.status < 500;
    } catch {
      return false;
    }
  }
}

/**
 * TTS サーバーをバックグラウンドで起動する。
 * TTS_START_CMD 環境変数が必要。未設定の場合はエラー。
 * @returns 起動したか（false = すでに起動済み）
 */
export async function startTtsServer(): Promise<boolean> {
  if (await isTtsServerRunning()) {
    return false;
  }

  if (!TTS_START_CMD) {
    throw new Error(
      'TTS_START_CMD 環境変数が設定されていません。\n' +
        '.env ファイルに TTS サーバーの起動コマンドを設定してください。\n' +
        '例: TTS_START_CMD=cd tts-server/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880'
    );
  }

  // detached + unref でプロセスを独立させ、Bot 終了時に巻き込まない
  const child = spawn('sh', ['-c', TTS_START_CMD], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // 起動を待つ（最大 60 秒。GPU へのモデルロードに時間がかかるため）
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isTtsServerRunning()) {
      return true;
    }
  }

  throw new Error('TTS サーバーの起動に失敗しました（60 秒以内に応答がありません）');
}

/**
 * TTS サーバーを停止する。
 * TTS_STOP_CMD が設定されていればそれを使用、なければ pkill フォールバック。
 * @returns 停止したか（false = すでに停止済み）
 */
export async function stopTtsServer(): Promise<boolean> {
  if (!(await isTtsServerRunning())) {
    return false;
  }

  const cmd = TTS_STOP_CMD || 'pkill -f "uvicorn"';

  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err && err.code !== 1) {
        reject(new Error(`TTS サーバーの停止に失敗しました: ${err.message}`));
        return;
      }
      resolve(true);
    });
  });
}
