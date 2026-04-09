import { Ollama } from 'ollama';
import type { Message } from 'ollama';
import { Semaphore } from './semaphore.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4';
const TIMEOUT_MS = 120_000;

const ollama = new Ollama({ host: OLLAMA_HOST });

// グローバルセマフォ: 同時実行数を制限する
// 注意: タイムアウト後にスロットを解放しても、Ollama 側の推論は継続する
// （ollama npm パッケージがキャンセル未対応のため）。
// そのため実効的な並列数が MAX_CONCURRENT を超える可能性がある。
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;
export const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * 起動時にモデルが利用可能か確認する。
 * 利用不可の場合は Error をスローする。
 */
export async function checkModelAvailable(): Promise<void> {
  const response = await ollama.list();
  const modelExists = response.models.some(
    (m) => m.name === DEFAULT_MODEL || m.name === `${DEFAULT_MODEL}:latest`
  );
  if (!modelExists) {
    throw new Error(
      `モデル "${DEFAULT_MODEL}" が見つかりません。\n` +
        `以下のコマンドでダウンロードしてください: ollama pull ${DEFAULT_MODEL}\n` +
        `利用可能なモデル: ${response.models.map((m) => m.name).join(', ') || '(なし)'}`
    );
  }
}

/**
 * Ollama の利用可能なモデル一覧を返す。
 */
export async function listModels() {
  return ollama.list();
}

/**
 * 指定したモデルが存在するか確認する。
 */
export async function modelExists(modelName: string): Promise<boolean> {
  const response = await ollama.list();
  return response.models.some(
    (m) => m.name === modelName || m.name === `${modelName}:latest`
  );
}

/**
 * セマフォの現在の状態を返す（/status コマンド用）。
 */
export function getOllamaStatus() {
  return {
    active: semaphore.active,
    capacity: semaphore.capacity,
    host: OLLAMA_HOST,
    defaultModel: DEFAULT_MODEL,
  };
}

/**
 * メッセージ配列を使って Ollama と通信する（マルチターン対応）。
 * グローバルセマフォで同時実行数を制御する。
 *
 * @param messages ollama の Message 型の配列（会話履歴を含む）
 * @param model 使用するモデル名（省略時はデフォルトモデル）
 * @returns アシスタントの返答メッセージ
 */
export async function chatWithHistory(
  messages: Message[],
  model: string = DEFAULT_MODEL
): Promise<Message> {
  if (!semaphore.tryAcquire()) {
    throw new OllamaError(
      `現在 ${semaphore.active} 件処理中です（上限: ${semaphore.capacity} 件）。少し待ってから再度お試しください。`,
      'BUSY'
    );
  }

  try {
    const chatPromise = ollama.chat({
      model,
      messages,
      stream: false,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new OllamaError('応答がタイムアウトしました（2分）。短いプロンプトを試してください。', 'TIMEOUT')
          ),
        TIMEOUT_MS
      )
    );

    const response = await Promise.race([chatPromise, timeoutPromise]);
    return response.message;
  } catch (err) {
    if (err instanceof OllamaError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new OllamaError(
        `Ollama に接続できません。\n\`ollama serve\` を実行して起動してください。\n(接続先: ${OLLAMA_HOST})`,
        'CONNECTION_REFUSED'
      );
    }
    if (message.toLowerCase().includes('not found') || message.includes('404')) {
      throw new OllamaError(
        `モデル "${model}" が見つかりません。\n\`ollama pull ${model}\` でダウンロードしてください。`,
        'MODEL_NOT_FOUND'
      );
    }
    throw new OllamaError(`予期しないエラーが発生しました: ${message}`, 'UNKNOWN');
  } finally {
    semaphore.release();
  }
}

/**
 * 単発プロンプトを送信する（/gemma4 コマンド用・後方互換）。
 * 内部的には chatWithHistory を呼ぶ。
 */
export async function generateResponse(
  prompt: string,
  model?: string,
  images?: string[]
): Promise<string> {
  const userMessage: Message = { role: 'user', content: prompt };
  if (images && images.length > 0) {
    userMessage.images = images;
  }
  const message = await chatWithHistory([userMessage], model);
  return message.content;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'BUSY'
      | 'TIMEOUT'
      | 'CONNECTION_REFUSED'
      | 'MODEL_NOT_FOUND'
      | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}
