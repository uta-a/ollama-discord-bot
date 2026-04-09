import { Semaphore } from './semaphore.js';

const TTS_SERVER_HOST = process.env.TTS_SERVER_HOST ?? 'http://127.0.0.1:8880';
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS) || 60_000;
const MAX_CONCURRENT = Number(process.env.TTS_MAX_CONCURRENT) || 1;
const SEMAPHORE_WAIT_MS = Number(process.env.TTS_SEMAPHORE_WAIT_MS) || 30_000;

// 待機方式セマフォ: TTS は数秒〜十数秒で完了するため、短時間待機が現実的
const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * テキストを音声に変換して WAV バイナリを返す。
 * ゼロショットボイスクローン: voiceProfileName で参照音声を指定する。
 */
export async function synthesizeSpeech(
  text: string,
  voiceProfileName: string
): Promise<Buffer> {
  // セマフォ取得（最大 SEMAPHORE_WAIT_MS 待機）
  const acquired = await semaphore.acquire(SEMAPHORE_WAIT_MS);
  if (!acquired) {
    throw new TtsError(
      '音声生成の待機がタイムアウトしました。少し待ってから再度お試しください。',
      'BUSY'
    );
  }

  try {
    const fetchPromise = fetch(`${TTS_SERVER_HOST}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: `clone:${voiceProfileName}`,
        response_format: 'wav',
      }),
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new TtsError('音声生成がタイムアウトしました。短いテキストを試してください。', 'TIMEOUT')),
        TIMEOUT_MS
      )
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new TtsError(
        `TTS サーバーでエラーが発生しました（HTTP ${response.status}）${detail ? `: ${detail}` : ''}`,
        'SERVER_ERROR'
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof TtsError) throw err;

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new TtsError(
        `TTS サーバーに接続できません。\n/tts-server start で起動してください。\n(接続先: ${TTS_SERVER_HOST})`,
        'CONNECTION_REFUSED'
      );
    }
    throw new TtsError(`予期しないエラーが発生しました: ${message}`, 'UNKNOWN');
  } finally {
    semaphore.release();
  }
}

/**
 * TTS サーバーのヘルスチェック。
 */
export async function checkTtsHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_SERVER_HOST}/health`);
    if (response.ok) return true;
    // /health がない場合のフォールバック
    const response2 = await fetch(TTS_SERVER_HOST);
    return response2.status < 500;
  } catch {
    return false;
  }
}

export class TtsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'BUSY'
      | 'TIMEOUT'
      | 'CONNECTION_REFUSED'
      | 'SERVER_ERROR'
      | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
