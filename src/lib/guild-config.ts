/**
 * ギルドごとの設定管理（インメモリ）
 *
 * 新しい設定を追加する手順:
 * 1. GuildConfig インターフェースにプロパティ追加
 * 2. DEFAULT_CONFIG にデフォルト値追加
 * 3. CONFIG_LABELS に表示名追加
 * 4. src/commands/config.ts の addChoices に選択肢追加
 * 5. 該当コマンドにガードチェック追加
 */

export interface GuildConfig {
  tts: boolean; // TTS 有効/無効（デフォルト: true）
}

const DEFAULT_CONFIG: Readonly<GuildConfig> = {
  tts: true,
};

/** 設定キーの表示名（/config の一覧表示に使用） */
export const CONFIG_LABELS: Record<keyof GuildConfig, string> = {
  tts: '読み上げ (TTS)',
};

// Map<guildId, GuildConfig>
const guildConfigs = new Map<string, GuildConfig>();

/**
 * ギルドの設定を返す。未設定の場合はデフォルト値を返す。
 */
export function getGuildConfig(guildId: string): GuildConfig {
  return guildConfigs.get(guildId) ?? { ...DEFAULT_CONFIG };
}

/**
 * ギルドの設定を1項目更新する。
 */
export function setGuildConfigValue(
  guildId: string,
  key: keyof GuildConfig,
  value: boolean
): void {
  const current = guildConfigs.get(guildId) ?? { ...DEFAULT_CONFIG };
  guildConfigs.set(guildId, { ...current, [key]: value });
}
