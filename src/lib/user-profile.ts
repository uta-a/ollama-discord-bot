import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface UserProfile {
  speakerId: number;  // スタイル ID（例: ずんだもんノーマル=3、あまあま=1）
  speakerKey: string; // SPEAKERS の key（表示用）
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const PROFILES_PATH = path.join(DATA_DIR, 'user-profiles.json');

// インメモリキャッシュ
const profiles = new Map<string, UserProfile>();

// 書き込みデバウンス用タイマー
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500;

/**
 * 起動時に JSON からプロファイルを読み込む。
 * ファイルが存在しない場合は空で開始する（エラーにしない）。
 */
export async function loadUserProfiles(): Promise<void> {
  try {
    const raw = await readFile(PROFILES_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, UserProfile>;
    for (const [userId, profile] of Object.entries(data)) {
      profiles.set(userId, profile);
    }
    console.log(`ユーザープロファイルを読み込みました（${profiles.size} 件）`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // ファイルがまだ存在しない（初回起動）は正常
    } else {
      // JSON 破損や権限エラーは error レベルで記録（プロファイルが全て失われる）
      console.error('ユーザープロファイルの読み込みに失敗しました。プロファイルが初期化されます:', err);
    }
  }
}

/**
 * ユーザーのプロファイルを返す。未登録の場合は null を返す。
 */
export function getUserProfile(userId: string): UserProfile | null {
  return profiles.get(userId) ?? null;
}

/**
 * ユーザーのプロファイルを更新し、非同期で JSON に書き込む。
 */
export async function setUserProfile(userId: string, profile: UserProfile): Promise<void> {
  profiles.set(userId, profile);
  schedulePersist();
}

function schedulePersist(): void {
  // 既存タイマーをリセットして最後の変更から 500ms 後に書き込む（デバウンス）
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persistProfiles().catch((err) => {
      console.warn('ユーザープロファイルの保存に失敗しました:', err);
    });
  }, WRITE_DEBOUNCE_MS);
}

async function persistProfiles(): Promise<void> {
  // recursive: true はディレクトリが既存でもエラーにしないので事前チェック不要
  await mkdir(DATA_DIR, { recursive: true });
  const data = Object.fromEntries(profiles);
  const tmpPath = PROFILES_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, PROFILES_PATH);
}
