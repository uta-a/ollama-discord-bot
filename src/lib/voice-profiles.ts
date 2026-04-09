import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PROFILES_DIR = process.env.TTS_PROFILES_DIR ?? './tts-server/profiles';
const DEFAULT_PROFILE = process.env.DEFAULT_VOICE_PROFILE ?? '';

export interface VoiceProfile {
  id: string;       // ディレクトリ名（例: "alice"）
  name: string;     // meta.json の name
  language?: string;
  refText?: string; // 参照音声のトランスクリプト
}

// ユーザーごとのボイスプロファイル選択（インメモリ）
// Map<userId, profileId>
const userProfiles = new Map<string, string>();

/**
 * 利用可能なボイスプロファイル一覧を返す。
 */
export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  try {
    const entries = await readdir(PROFILES_DIR, { withFileTypes: true });
    const profiles: VoiceProfile[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = join(PROFILES_DIR, entry.name, 'meta.json');
      try {
        const raw = await readFile(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as {
          name?: string;
          language?: string;
          ref_text?: string;
        };
        profiles.push({
          id: entry.name,
          name: meta.name ?? entry.name,
          language: meta.language,
          refText: meta.ref_text,
        });
      } catch {
        // meta.json が読めないエントリはスキップ
      }
    }

    return profiles;
  } catch {
    return [];
  }
}

/**
 * 指定したプロファイルが存在するか確認する。
 */
export async function profileExists(profileId: string): Promise<boolean> {
  const profiles = await listVoiceProfiles();
  return profiles.some((p) => p.id === profileId);
}

/**
 * ユーザーの現在のボイスプロファイルを返す。
 * 未設定かつ DEFAULT_VOICE_PROFILE が設定されていればそれを返す。
 * どちらもなければ null。
 */
export function getUserVoiceProfile(userId: string): string | null {
  const profile = userProfiles.get(userId) ?? DEFAULT_PROFILE;
  return profile || null;
}

/**
 * ユーザーのボイスプロファイルを設定する。
 */
export function setUserVoiceProfile(userId: string, profileId: string): void {
  userProfiles.set(userId, profileId);
}
