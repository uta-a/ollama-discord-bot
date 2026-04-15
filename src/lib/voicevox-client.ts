import { Semaphore } from './semaphore.js';

const VOICEVOX_HOST = process.env.VOICEVOX_HOST ?? 'http://127.0.0.1:50021';

export type VoicevoxStyleInfo = { name: string; id: number };

type SpeakerEntry = { name: string; styles: VoicevoxStyleInfo[] };

/** スタイル一覧のインメモリキャッシュ（5 分 TTL）*/
let speakersCache: SpeakerEntry[] | null = null;
let speakersCacheAt = 0;
const SPEAKERS_CACHE_TTL = 5 * 60 * 1000;

async function fetchSpeakers(): Promise<SpeakerEntry[]> {
  const now = Date.now();
  if (speakersCache && now - speakersCacheAt < SPEAKERS_CACHE_TTL) {
    return speakersCache;
  }

  const response = await fetch(`${VOICEVOX_HOST}/speakers`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  speakersCache = (await response.json()) as SpeakerEntry[];
  speakersCacheAt = now;
  return speakersCache;
}

/**
 * キャラクターのノーマルスタイル ID から全スタイル一覧を返す。
 * VOICEVOX が起動していない場合やエラー時は空配列を返す。
 */
export async function fetchSpeakerStyles(normalStyleId: number): Promise<VoicevoxStyleInfo[]> {
  try {
    const speakers = await fetchSpeakers();
    const speaker = speakers.find((s) => s.styles.some((st) => st.id === normalStyleId));
    return speaker?.styles ?? [];
  } catch {
    return [];
  }
}

/**
 * スタイル ID からスタイル名を返す（表示用）。
 * 取得できなかった場合は null を返す。
 */
export async function fetchStyleName(styleId: number): Promise<string | null> {
  try {
    const speakers = await fetchSpeakers();
    for (const sp of speakers) {
      const style = sp.styles.find((s) => s.id === styleId);
      if (style) return style.name;
    }
    return null;
  } catch {
    return null;
  }
}
const TIMEOUT_MS = Number(process.env.VOICEVOX_TIMEOUT_MS) || 60_000;
const MAX_CONCURRENT = Number(process.env.VOICEVOX_MAX_CONCURRENT) || 1;
const SEMAPHORE_WAIT_MS = 30_000;

const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * VOICEVOX エンジンを使ってテキストを音声に変換し WAV バイナリを返す。
 * 2 段階 API: /audio_query → /synthesis
 */
export async function synthesizeVoicevox(text: string, speakerId: number): Promise<Buffer> {
  const acquired = await semaphore.acquire(SEMAPHORE_WAIT_MS);
  if (!acquired) {
    throw new VoicevoxError(
      '音声生成の待機がタイムアウトしました。少し待ってから再度お試しください。',
      'BUSY'
    );
  }

  try {
    // Step 1: audio_query でクエリ JSON を取得
    const queryUrl = `${VOICEVOX_HOST}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`;
    const queryFetch = fetch(queryUrl, { method: 'POST' });
    const queryTimeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new VoicevoxError('音声生成がタイムアウトしました。短いテキストを試してください。', 'TIMEOUT')),
        TIMEOUT_MS
      )
    );

    const queryResponse = await Promise.race([queryFetch, queryTimeout]);

    if (!queryResponse.ok) {
      const detail = await queryResponse.text().catch(() => '');
      throw new VoicevoxError(
        `VOICEVOX エンジンでエラーが発生しました（HTTP ${queryResponse.status}）${detail ? `: ${detail}` : ''}`,
        'SERVER_ERROR'
      );
    }

    const audioQuery = await queryResponse.json();

    // Step 2: synthesis で WAV バイナリを取得
    const synthUrl = `${VOICEVOX_HOST}/synthesis?speaker=${speakerId}`;
    const synthFetch = fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    });
    const synthTimeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new VoicevoxError('音声生成がタイムアウトしました。短いテキストを試してください。', 'TIMEOUT')),
        TIMEOUT_MS
      )
    );

    const synthResponse = await Promise.race([synthFetch, synthTimeout]);

    if (!synthResponse.ok) {
      const detail = await synthResponse.text().catch(() => '');
      throw new VoicevoxError(
        `VOICEVOX エンジンでエラーが発生しました（HTTP ${synthResponse.status}）${detail ? `: ${detail}` : ''}`,
        'SERVER_ERROR'
      );
    }

    const arrayBuffer = await synthResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof VoicevoxError) throw err;

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new VoicevoxError(
        `VOICEVOX エンジンに接続できません。エンジンを起動してください。\n(接続先: ${VOICEVOX_HOST})`,
        'CONNECTION_REFUSED'
      );
    }
    throw new VoicevoxError(`予期しないエラーが発生しました: ${message}`, 'UNKNOWN');
  } finally {
    semaphore.release();
  }
}

export class VoicevoxError extends Error {
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
    this.name = 'VoicevoxError';
  }
}

// --- ユーザー辞書 API ---

export interface DictEntry {
  surface: string;       // 表記（読み上げ対象の語）
  pronunciation: string; // 読み（カタカナ）
  accentType: number;    // アクセント核位置（0 = 平板）
}

/**
 * VOICEVOX ユーザー辞書に単語を登録する。
 * POST /user_dict_word にクエリパラメータで送信する。
 */
export async function registerDictWord(entry: DictEntry): Promise<void> {
  const params = new URLSearchParams({
    surface: entry.surface,
    pronunciation: entry.pronunciation,
    accent_type: String(entry.accentType),
    word_type: 'PROPER_NOUN',
  });

  try {
    const response = await fetch(`${VOICEVOX_HOST}/user_dict_word?${params}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new VoicevoxError(
        `辞書への単語登録に失敗しました（HTTP ${response.status}）${detail ? `: ${detail}` : ''}`,
        'SERVER_ERROR'
      );
    }
  } catch (err) {
    if (err instanceof VoicevoxError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new VoicevoxError(
        `VOICEVOX エンジンに接続できません。エンジンを起動してください。\n(接続先: ${VOICEVOX_HOST})`,
        'CONNECTION_REFUSED'
      );
    }
    throw new VoicevoxError(`辞書登録中に予期しないエラーが発生しました: ${message}`, 'UNKNOWN');
  }
}

/**
 * VOICEVOX ユーザー辞書を全消去する。
 * GET /user_dict で UUID 一覧を取得し、DELETE /user_dict_word/:uuid で個別削除する。
 * （POST /import_user_dict?override=true に空オブジェクトを送っても実際にはクリアされないため）
 */
export async function clearVoicevoxDict(): Promise<void> {
  try {
    // 1. 現在の辞書エントリ一覧を取得
    const listResponse = await fetch(`${VOICEVOX_HOST}/user_dict`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!listResponse.ok) {
      const detail = await listResponse.text().catch(() => '');
      throw new VoicevoxError(
        `辞書の取得に失敗しました（HTTP ${listResponse.status}）${detail ? `: ${detail}` : ''}`,
        'SERVER_ERROR'
      );
    }
    const raw: unknown = await listResponse.json();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new VoicevoxError('GET /user_dict のレスポンス形式が不正です', 'SERVER_ERROR');
    }
    const uuids = Object.keys(raw as Record<string, unknown>);

    // 2. 各エントリを個別削除。失敗した UUID を収集し、すべて試みた後にまとめて throw する
    const failed: string[] = [];
    for (const uuid of uuids) {
      const delResponse = await fetch(
        `${VOICEVOX_HOST}/user_dict_word/${encodeURIComponent(uuid)}`,
        { method: 'DELETE', signal: AbortSignal.timeout(5_000) }
      );
      if (!delResponse.ok) {
        failed.push(uuid);
        console.warn(`辞書エントリ ${uuid} の削除に失敗しました（HTTP ${delResponse.status}）`);
      }
    }
    if (failed.length > 0) {
      // 呼び出し元（ensureVoicevoxDictLoaded）が activeGuildId をリセットして再同期を促せるよう throw する
      throw new VoicevoxError(
        `辞書の全消去に失敗しました（削除できなかったエントリ: ${failed.length} 件）`,
        'SERVER_ERROR'
      );
    }
  } catch (err) {
    if (err instanceof VoicevoxError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      throw new VoicevoxError(
        `VOICEVOX エンジンに接続できません。エンジンを起動してください。\n(接続先: ${VOICEVOX_HOST})`,
        'CONNECTION_REFUSED'
      );
    }
    throw new VoicevoxError(`辞書クリア中に予期しないエラーが発生しました: ${message}`, 'UNKNOWN');
  }
}
