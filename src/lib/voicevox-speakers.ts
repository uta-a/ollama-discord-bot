/**
 * VOICEVOX スピーカー定義（すべてノーマルスタイルの ID を基準に）。
 * ID は VOICEVOX エンジンの GET /speakers で確認可能。
 * 追加する場合は addChoices の最大 25 件に注意。
 */
export const SPEAKERS = {
  metan: { id: 2, label: '四国めたん' },
  zundamon: { id: 3, label: 'ずんだもん' },
  tsumugi: { id: 8, label: '春日部つむぎ' },
  ritsu: { id: 9, label: '波音リツ' },
  hau: { id: 10, label: '雨晴はう' },
  takehiro: { id: 11, label: '玄野武宏' },
  kotaro: { id: 12, label: '白上虎太郎' },
  ryusei: { id: 13, label: '青山龍星' },
  himari: { id: 14, label: '冥鳴ひまり' },
  sora: { id: 16, label: '九州そら' },
  mochiko: { id: 20, label: 'もち子さん' },
  mesuo: { id: 21, label: '剣崎雌雄' },
} as const satisfies Record<string, { id: number; label: string }>;

export type SpeakerKey = keyof typeof SPEAKERS;

export const SPEAKER_CHOICES = (
  Object.entries(SPEAKERS) as Array<[SpeakerKey, (typeof SPEAKERS)[SpeakerKey]]>
).map(([value, { label }]) => ({ name: label, value }));
