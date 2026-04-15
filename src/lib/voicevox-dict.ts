import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerDictWord, clearVoicevoxDict, type DictEntry } from './voicevox-client.js';

export type { DictEntry };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DICT_PATH = path.join(DATA_DIR, 'voicevox-dict.json');

/** ギルドごとの辞書エントリ（インメモリ）*/
const guildDicts = new Map<string, DictEntry[]>();

/** VOICEVOX エンジンに現在ロードされているギルド（null = 未ロードまたは別ギルド）*/
let activeGuildId: string | null = null;

/** 進行中の辞書同期 Promise（並列呼び出しの排他に使用）*/
let syncPromise: Promise<void> | null = null;

/** 辞書の最大エントリ数（超過すると add が失敗する）*/
const MAX_DICT_ENTRIES = 50;

/** 書き込みデバウンス用タイマー */
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500;

function isValidDictEntry(e: unknown): e is DictEntry {
  if (typeof e !== 'object' || e === null) return false;
  const entry = e as DictEntry;
  if (typeof entry.surface !== 'string') return false;
  if (typeof entry.pronunciation !== 'string') return false;
  if (typeof entry.accentType !== 'number') return false;
  // VOICEVOX のアクセント型は 0〜4 に制限される。範囲外のエントリは VOICEVOX に登録できないのでスキップ
  if (!Number.isInteger(entry.accentType) || entry.accentType < 0 || entry.accentType > 4) {
    return false;
  }
  return true;
}

/**
 * 起動時に JSON から辞書を読み込む。
 * ファイルが存在しない場合は空で開始する（エラーにしない）。
 */
export async function loadVoicevoxDict(): Promise<void> {
  try {
    const raw = await readFile(DICT_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    let totalSkipped = 0;
    for (const [guildId, rawEntries] of Object.entries(data)) {
      if (!Array.isArray(rawEntries)) continue;
      const valid = rawEntries.filter(isValidDictEntry);
      const skipped = rawEntries.length - valid.length;
      if (skipped > 0) {
        totalSkipped += skipped;
        console.warn(`辞書の読み込み: guildId=${guildId} に不正なエントリが ${skipped} 件含まれていたためスキップしました`);
      }
      guildDicts.set(guildId, valid);
    }
    const total = [...guildDicts.values()].reduce((sum, e) => sum + e.length, 0);
    console.log(`辞書を読み込みました（${guildDicts.size} サーバー、計 ${total} 件）`);
    // スキップがあった場合は永続化ファイルを上書きして不正データを取り除く
    if (totalSkipped > 0) {
      schedulePersist();
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // 初回起動時はファイルが存在しないのが正常
    } else {
      console.error('辞書の読み込みに失敗しました。辞書が初期化されます:', err);
    }
  }
}

/**
 * ギルドの辞書エントリ一覧を返す（読み取り専用）。
 */
export function getGuildDict(guildId: string): readonly DictEntry[] {
  return guildDicts.get(guildId) ?? [];
}

/**
 * ギルドの辞書にエントリを追加する。
 * 同じ surface が既に存在する場合は上書きする。
 * 新規追加で MAX_DICT_ENTRIES を超える場合は Error を throw する。
 * VOICEVOX への同期は次の ensureVoicevoxDictLoaded 呼び出し時に行う。
 */
export async function addDictEntry(guildId: string, entry: DictEntry): Promise<void> {
  const entries = guildDicts.get(guildId) ?? [];
  const existingIndex = entries.findIndex((e) => e.surface === entry.surface);
  if (existingIndex < 0 && entries.length >= MAX_DICT_ENTRIES) {
    throw new Error(`辞書の上限（${MAX_DICT_ENTRIES} 件）に達しています。不要な単語を削除してから追加してください。`);
  }
  const newEntries =
    existingIndex >= 0
      ? entries.map((e, i) => (i === existingIndex ? entry : e))
      : [...entries, entry];
  guildDicts.set(guildId, newEntries);
  // キャッシュ無効化（次の合成時に再同期）
  if (activeGuildId === guildId) {
    activeGuildId = null;
  }
  schedulePersist();
}

/**
 * ギルドの辞書からエントリを削除する。
 * 見つかった場合は true、見つからなかった場合は false を返す。
 * VOICEVOX への同期は次の ensureVoicevoxDictLoaded 呼び出し時に行う。
 */
export async function removeDictEntry(guildId: string, surface: string): Promise<boolean> {
  const entries = guildDicts.get(guildId) ?? [];
  const newEntries = entries.filter((e) => e.surface !== surface);
  if (newEntries.length === entries.length) {
    return false;
  }
  guildDicts.set(guildId, newEntries);
  if (activeGuildId === guildId) {
    activeGuildId = null;
  }
  schedulePersist();
  return true;
}

/**
 * 指定ギルドの辞書が VOICEVOX エンジンに反映されていることを保証する。
 * 別ギルドの辞書がロードされている場合は、一度クリアしてから再ロードする。
 *
 * 並列呼び出し対策: 進行中の同期 Promise をキャッシュし、同時に複数の呼び出しが
 * 来ても VOICEVOX への二重書き込みが発生しないようにしている。
 *
 * エラーが発生した場合は activeGuildId を null にリセットして例外を再 throw する。
 * 呼び出し側は catch して warn に落とし、合成自体は続行することを推奨する。
 */
export async function ensureVoicevoxDictLoaded(guildId: string): Promise<void> {
  if (activeGuildId === guildId) return;

  // 進行中の同期があれば完了を待ってから再チェック
  if (syncPromise !== null) {
    await syncPromise.catch(() => {
      // 先行する同期のエラーは無視して再試行する
    });
    if (activeGuildId === guildId) return;
  }

  syncPromise = (async () => {
    // clear 前に null にして「クリア後の空状態」を確実に反映する（HIGH issue 2 の修正）
    activeGuildId = null;
    await clearVoicevoxDict();
    const entries = guildDicts.get(guildId) ?? [];
    for (const entry of entries) {
      await registerDictWord(entry);
    }
    activeGuildId = guildId;
  })().finally(() => {
    syncPromise = null;
  });

  await syncPromise;
}

function schedulePersist(): void {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persistDict().catch((err) => {
      console.warn('辞書の保存に失敗しました:', err);
    });
  }, WRITE_DEBOUNCE_MS);
}

async function persistDict(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const data = Object.fromEntries(guildDicts);
  const tmpPath = DICT_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, DICT_PATH);
}
