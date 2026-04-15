/**
 * 自動読み上げトグル管理と TTS 用テキスト前処理。
 *
 * 2 つのスコープをサポート：
 * - 個人モード: チャンネル × ユーザー単位で ON/OFF（本人のメッセージだけ読み上げ）
 * - 全員モード: チャンネル単位で ON/OFF（そのチャンネルの全員を読み上げ、未登録ユーザーはフォールバック声）
 *
 * トグル状態はインメモリのみ（再起動でリセットする設計）。
 */

export interface ChannelAutoReadConfig {
  fallbackSpeakerId: number;
  fallbackSpeakerKey: string;
}

// --- 個人モード ---
// key = `${channelId}:${userId}`
const activeReaders = new Set<string>();

function makeKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export function enableAutoRead(channelId: string, userId: string): void {
  activeReaders.add(makeKey(channelId, userId));
}

export function disableAutoRead(channelId: string, userId: string): void {
  activeReaders.delete(makeKey(channelId, userId));
}

export function isAutoReadEnabled(channelId: string, userId: string): boolean {
  return activeReaders.has(makeKey(channelId, userId));
}

// --- 全員モード ---
// Map<channelId, ChannelAutoReadConfig>
const activeChannels = new Map<string, ChannelAutoReadConfig>();

export function enableAutoReadChannel(channelId: string, config: ChannelAutoReadConfig): void {
  activeChannels.set(channelId, config);
}

export function disableAutoReadChannel(channelId: string): boolean {
  return activeChannels.delete(channelId);
}

export function getAutoReadChannelConfig(channelId: string): ChannelAutoReadConfig | null {
  return activeChannels.get(channelId) ?? null;
}

/**
 * Discord メッセージの内容を TTS 用に前処理する。
 *
 * 以下の場合は null を返し、呼び出し側は読み上げをスキップする：
 * - URL（https?://）を含む
 * - 残りが空白のみ
 *
 * コードブロック（```～```）、インラインコード（`～`）、Discord の特殊フォーマット（メンション・カスタム絵文字）を除去する。
 * 200 文字を超える部分は切り詰める。
 */
export function sanitizeForTTS(content: string): string | null {
  // URL を含むメッセージはスキップ
  if (/https?:\/\//i.test(content)) return null;

  // コードブロック（複数行対応）を除去
  let sanitized = content.replace(/```[\s\S]*?```/g, '');

  // インラインコードを除去
  sanitized = sanitized.replace(/`[^`]*`/g, '');

  // Discord メンション（<@id>, <@!id>, <#id>, <@&id>）を除去
  sanitized = sanitized.replace(/<[@#][!&]?\d+>/g, '');

  // Discord カスタム絵文字（<:name:id>, <a:name:id>）を除去
  sanitized = sanitized.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '');

  // 前後の空白を除去して空なら skip
  sanitized = sanitized.trim();
  if (sanitized.length === 0) return null;

  // 200 文字に切り詰め
  return sanitized.slice(0, 200);
}
