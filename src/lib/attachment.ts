import type { Attachment } from 'discord.js';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB（Ollama メモリ負荷を考慮）
const MAX_TEXT_LENGTH = 50_000; // テキスト上限（文字数）
const FETCH_TIMEOUT_MS = 15_000; // ダウンロードタイムアウト
const ALLOWED_ORIGINS = ['https://cdn.discordapp.com', 'https://media.discordapp.net'];

// contentType ベースの判定を優先
const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// テキストファイルの拡張子（contentType が不明な場合のフォールバック）
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.ts', '.js', '.py',
  '.html', '.css', '.xml', '.yaml', '.yml', '.toml',
  '.sh', '.sql', '.go', '.rs', '.java', '.c', '.cpp',
  '.h', '.rb', '.php', '.swift', '.kt', '.log',
]);

export type AttachmentResult =
  | { type: 'image'; base64: string }
  | { type: 'text'; content: string; filename: string };

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const baseType = contentType.split(';')[0].trim();
  return IMAGE_CONTENT_TYPES.has(baseType);
}

function isTextContentType(contentType: string | null, filename: string): boolean {
  if (contentType) {
    const baseType = contentType.split(';')[0].trim();
    if (baseType.startsWith('text/') || baseType === 'application/json') return true;
  }
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Discord の Attachment をダウンロードし、種別に応じて変換する。
 *
 * - 画像（image/png, image/jpeg, image/gif, image/webp）→ base64 文字列
 * - テキストファイル → 文字列（50,000 文字超は先頭部分のみ）
 * - それ以外 → AttachmentError をスロー
 */
export async function processAttachment(attachment: Attachment): Promise<AttachmentResult> {
  // サイズチェック
  if (attachment.size > MAX_FILE_SIZE) {
    const mb = (attachment.size / (1024 * 1024)).toFixed(1);
    throw new AttachmentError(
      `ファイルサイズが大きすぎます（${mb}MB）。10MB 以下のファイルを添付してください。`
    );
  }

  // SSRF 対策: Discord CDN のオリジンのみ許可
  const origin = new URL(attachment.url).origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    throw new AttachmentError(`信頼できない URL からのファイルです。`);
  }

  const contentType = attachment.contentType ?? null;
  const filename = attachment.name;

  // 種別判定
  if (isImageContentType(contentType)) {
    return downloadImage(attachment.url, filename);
  }

  if (isTextContentType(contentType, filename)) {
    return downloadText(attachment.url, filename);
  }

  const ext = path.extname(filename) || '（不明）';
  throw new AttachmentError(
    `対応していないファイル形式です（${ext}）。画像（.png, .jpg, .gif, .webp）またはテキストファイル（.txt, .ts, .py 等）を添付してください。`
  );
}

async function downloadImage(url: string, filename: string): Promise<AttachmentResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch (err) {
    throw new AttachmentError(
      `画像のダウンロードに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new AttachmentError(`画像のダウンロードに失敗しました（HTTP ${response.status}）。`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { type: 'image', base64 };
}

async function downloadText(url: string, filename: string): Promise<AttachmentResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch (err) {
    throw new AttachmentError(
      `ファイルのダウンロードに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new AttachmentError(`ファイルのダウンロードに失敗しました（HTTP ${response.status}）。`);
  }

  let content = await response.text();

  if (content.length > MAX_TEXT_LENGTH) {
    content =
      content.slice(0, MAX_TEXT_LENGTH) +
      '\n\n（※ファイルが長いため先頭 50,000 文字のみ表示）';
  }

  return { type: 'text', content, filename };
}
