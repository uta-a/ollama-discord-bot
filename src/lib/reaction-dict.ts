import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ReactionEntry {
  trigger: string;   // 1..64 文字
  response: string;  // 1..500 文字
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const REACTION_PATH = path.join(DATA_DIR, 'reaction-dict.json');

/** ギルドごとの反応辞書エントリ（インメモリ）*/
const guildReactions = new Map<string, ReactionEntry[]>();

/** 反応辞書の最大エントリ数（超過すると add が失敗する）*/
export const MAX_REACTION_ENTRIES = 50;

/** trigger の最大文字数 */
const MAX_TRIGGER_LENGTH = 64;

/** response の最大文字数 */
const MAX_RESPONSE_LENGTH = 500;

/** 書き込みデバウンス用タイマー */
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500;

function isValidReactionEntry(e: unknown): e is ReactionEntry {
  if (typeof e !== 'object' || e === null) return false;
  const entry = e as ReactionEntry;
  if (typeof entry.trigger !== 'string') return false;
  if (typeof entry.response !== 'string') return false;
  const trimmedTrigger = entry.trigger.trim();
  const trimmedResponse = entry.response.trim();
  if (trimmedTrigger.length < 1 || trimmedTrigger.length > MAX_TRIGGER_LENGTH) return false;
  if (trimmedResponse.length < 1 || trimmedResponse.length > MAX_RESPONSE_LENGTH) return false;
  return true;
}

/**
 * 起動時に JSON から反応辞書を読み込む。
 * ファイルが存在しない場合は空で開始する（エラーにしない）。
 */
export async function loadReactionDict(): Promise<void> {
  try {
    const raw = await readFile(REACTION_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    let totalSkipped = 0;
    for (const [guildId, rawEntries] of Object.entries(data)) {
      if (!Array.isArray(rawEntries)) continue;
      const valid = rawEntries.filter(isValidReactionEntry);
      const skipped = rawEntries.length - valid.length;
      if (skipped > 0) {
        totalSkipped += skipped;
        console.warn(
          `反応辞書の読み込み: guildId=${guildId} に不正なエントリが ${skipped} 件含まれていたためスキップしました`
        );
      }
      // ロード時に trim 正規化して保存済みの揺れを吸収する
      const normalized = valid.map((e) => ({
        trigger: e.trigger.trim(),
        response: e.response.trim(),
      }));
      guildReactions.set(guildId, normalized);
    }
    const total = [...guildReactions.values()].reduce((sum, e) => sum + e.length, 0);
    console.log(`反応辞書を読み込みました（${guildReactions.size} サーバー、計 ${total} 件）`);
    if (totalSkipped > 0) {
      schedulePersist();
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // 初回起動時はファイルが存在しないのが正常
    } else {
      console.error('反応辞書の読み込みに失敗しました。辞書が初期化されます:', err);
    }
  }
}

/**
 * ギルドの反応辞書エントリ一覧を返す（読み取り専用）。
 */
export function getGuildReactions(guildId: string): readonly ReactionEntry[] {
  return guildReactions.get(guildId) ?? [];
}

/**
 * ギルドの反応辞書にエントリを追加する。
 * 同じ trigger が既に存在する場合は上書きする。
 * 新規追加で MAX_REACTION_ENTRIES を超える場合は Error を throw する。
 */
export async function addReaction(
  guildId: string,
  entry: ReactionEntry
): Promise<'added' | 'updated'> {
  const normalizedEntry: ReactionEntry = {
    trigger: entry.trigger.trim(),
    response: entry.response.trim(),
  };
  const entries = guildReactions.get(guildId) ?? [];
  const existingIndex = entries.findIndex((e) => e.trigger === normalizedEntry.trigger);
  if (existingIndex < 0 && entries.length >= MAX_REACTION_ENTRIES) {
    throw new Error(
      `反応辞書の上限（${MAX_REACTION_ENTRIES} 件）に達しています。不要なエントリを削除してから追加してください。`
    );
  }
  if (existingIndex >= 0) {
    const newEntries = entries.map((e, i) => (i === existingIndex ? normalizedEntry : e));
    guildReactions.set(guildId, newEntries);
    schedulePersist();
    return 'updated';
  } else {
    guildReactions.set(guildId, [...entries, normalizedEntry]);
    schedulePersist();
    return 'added';
  }
}

/**
 * ギルドの反応辞書からエントリを削除する。
 * 見つかった場合は true、見つからなかった場合は false を返す。
 */
export async function removeReaction(guildId: string, trigger: string): Promise<boolean> {
  const normalizedTrigger = trigger.trim();
  const entries = guildReactions.get(guildId) ?? [];
  const newEntries = entries.filter((e) => e.trigger !== normalizedTrigger);
  if (newEntries.length === entries.length) {
    return false;
  }
  guildReactions.set(guildId, newEntries);
  schedulePersist();
  return true;
}

/**
 * メッセージテキストに対してギルドの反応辞書を走査し、
 * 最初にヒットしたエントリを返す（大文字小文字無視の部分一致）。
 * ヒットしない場合は null を返す。
 */
export function findMatchingReaction(guildId: string, text: string): ReactionEntry | null {
  if (text.trim() === '') return null;
  const entries = guildReactions.get(guildId);
  if (!entries || entries.length === 0) return null;
  const lowerText = text.toLowerCase();
  for (const entry of entries) {
    if (lowerText.includes(entry.trigger.toLowerCase())) {
      return entry;
    }
  }
  return null;
}

function schedulePersist(): void {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persistReactionDict().catch((err) => {
      console.warn('反応辞書の保存に失敗しました:', err);
    });
  }, WRITE_DEBOUNCE_MS);
}

async function persistReactionDict(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const data = Object.fromEntries(guildReactions);
  const tmpPath = REACTION_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, REACTION_PATH);
}
