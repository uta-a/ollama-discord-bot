import type { Message } from 'ollama';
import { DEFAULT_MODEL } from './ollama.js';

const MAX_HISTORY_LENGTH = Number(process.env.MAX_HISTORY_LENGTH) || 20;
const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

interface ConversationSession {
  messages: Message[];
  model: string;
  lastActivity: number;
  // 同一ユーザーの並行 /chat 実行を防ぐフラグ
  isProcessing: boolean;
}

// セッションキー: `${channelId}:${userId}` でチャンネルごとに管理
const sessions = new Map<string, ConversationSession>();

function makeKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

/**
 * セッションを取得する。存在しない場合は新規作成する。
 * 有効期限切れの場合はリセットして返す。
 */
function getSession(key: string): ConversationSession {
  const existing = sessions.get(key);
  if (existing) {
    if (Date.now() - existing.lastActivity > SESSION_TIMEOUT_MS) {
      // 有効期限切れのためリセット
      const fresh: ConversationSession = {
        messages: [],
        model: existing.model, // モデル選択は引き継ぐ
        lastActivity: Date.now(),
        isProcessing: false,
      };
      sessions.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  const fresh: ConversationSession = {
    messages: [],
    model: DEFAULT_MODEL,
    lastActivity: Date.now(),
    isProcessing: false,
  };
  sessions.set(key, fresh);
  return fresh;
}

/**
 * 現在のセッションのメッセージ配列のコピーを返す。
 */
export function getMessages(channelId: string, userId: string): Message[] {
  const key = makeKey(channelId, userId);
  return [...getSession(key).messages];
}

/**
 * メッセージを履歴に追加する。
 * MAX_HISTORY_LENGTH を超えた場合は最古の user+assistant ペアを削除する。
 */
export function addMessage(channelId: string, userId: string, message: Message): void {
  const key = makeKey(channelId, userId);
  const session = getSession(key);

  session.messages.push(message);
  session.lastActivity = Date.now();

  // 上限超過時: system メッセージを除いた最古の2件（user+assistant）を削除
  while (session.messages.length > MAX_HISTORY_LENGTH) {
    const idx = session.messages.findIndex((m) => m.role !== 'system');
    if (idx !== -1) {
      session.messages.splice(idx, 2);
    } else {
      break;
    }
  }
}

/**
 * セッションの会話履歴をクリアする。モデル選択は維持する。
 */
export function clearSession(channelId: string, userId: string): void {
  const key = makeKey(channelId, userId);
  const existing = sessions.get(key);
  if (existing) {
    existing.messages = [];
    existing.lastActivity = Date.now();
    existing.isProcessing = false;
  }
}

/**
 * ユーザーが選択しているモデル名を返す。
 */
export function getUserModel(channelId: string, userId: string): string {
  return getSession(makeKey(channelId, userId)).model;
}

/**
 * ユーザーのモデルを変更し、会話履歴をクリアする。
 * モデルを変えたので古い履歴はリセットする。
 */
export function setUserModel(channelId: string, userId: string, model: string): void {
  const key = makeKey(channelId, userId);
  const session = getSession(key);
  session.model = model;
  session.messages = [];
  session.lastActivity = Date.now();
}

/**
 * 同一チャンネル・同一ユーザーの並行 /chat を防ぐロック。
 * @returns ロック取得成功なら true
 */
export function tryLockSession(channelId: string, userId: string): boolean {
  const key = makeKey(channelId, userId);
  const session = getSession(key);
  if (session.isProcessing) return false;
  session.isProcessing = true;
  return true;
}

/**
 * セッションのロックを解放する。finally ブロックで必ず呼ぶこと。
 */
export function unlockSession(channelId: string, userId: string): void {
  const key = makeKey(channelId, userId);
  const session = sessions.get(key);
  if (session) session.isProcessing = false;
}

/**
 * 現在のアクティブなセッション数を返す。
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * 有効期限切れのセッションを削除する定期クリーンアップを開始する。
 * timer.unref() で tsx watch の再起動を妨げない。
 */
export function startCleanupTimer(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        sessions.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Node.js のイベントループをブロックしないようにする
  timer.unref();
}
