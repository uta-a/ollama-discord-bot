import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  type VoiceConnection,
  type AudioPlayer,
  type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { Readable } from 'node:stream';

const IDLE_TIMEOUT_MS = Number(process.env.VOICE_IDLE_TIMEOUT_MS) || 300_000; // 5分

interface QueueItem {
  buffer: Buffer;
  resolve: () => void;
  reject: (err: Error) => void;
}

interface GuildVoiceState {
  connection: VoiceConnection;
  player: AudioPlayer;
  channelId: string;
  idleTimer: NodeJS.Timeout | null;
  queue: QueueItem[];
  isPlaying: boolean;
}

// Map<guildId, GuildVoiceState>
const guildStates = new Map<string, GuildVoiceState>();

/**
 * ボイスチャンネルに参加する。
 * すでに参加している場合は接続を移動する。
 */
export function joinChannel(
  guildId: string,
  channelId: string,
  adapterCreator: DiscordGatewayAdapterCreator
): void {
  // 既存の接続があれば破棄
  const existing = guildStates.get(guildId);
  if (existing) {
    clearIdleTimer(guildId);
    existing.connection.destroy();
    guildStates.delete(guildId);
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const state: GuildVoiceState = {
    connection,
    player,
    channelId,
    idleTimer: null,
    queue: [],
    isPlaying: false,
  };
  guildStates.set(guildId, state);

  player.on(AudioPlayerStatus.Idle, () => {
    const s = guildStates.get(guildId);
    if (!s) return;

    s.isPlaying = false;

    // キューに次のアイテムがあれば再生
    const next = s.queue.shift();
    if (next) {
      playBuffer(guildId, s, next);
    } else {
      // キューが空になったらアイドルタイマーを開始
      startIdleTimer(guildId);
    }
  });

  player.on('error', (err) => {
    const s = guildStates.get(guildId);
    if (!s) return;

    // エラー時はキューの先頭アイテムを reject して次へ
    s.isPlaying = false;
    const current = s.queue.shift();
    if (current) current.reject(err);

    const next = s.queue.shift();
    if (next) {
      playBuffer(guildId, s, next);
    }
  });

  // アイドルタイマーを開始
  startIdleTimer(guildId);
}

/**
 * ボイスチャンネルから退出する。
 * @returns 退出したか（false = 接続していなかった）
 */
export function leaveChannel(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state) return false;

  clearIdleTimer(guildId);

  // キューに残ったアイテムをすべて reject
  for (const item of state.queue) {
    item.reject(new Error('ボイスチャンネルから切断されました。'));
  }
  state.queue.length = 0;

  state.player.stop();
  state.connection.destroy();
  guildStates.delete(guildId);
  return true;
}

/**
 * すべてのギルドのボイスチャンネルから退出する（shutdown 用）。
 */
export function leaveAllChannels(): void {
  for (const guildId of guildStates.keys()) {
    leaveChannel(guildId);
  }
}

/**
 * 音声バッファをキューに追加して再生する。
 * @returns 再生が開始されたとき（または既存の再生完了時）に resolve する Promise
 */
export function playAudio(guildId: string, buffer: Buffer): Promise<void> {
  const state = guildStates.get(guildId);
  if (!state) {
    return Promise.reject(new Error('ボイスチャンネルに接続していません。'));
  }

  // アイドルタイマーをキャンセル（新しい音声が来た）
  clearIdleTimer(guildId);

  return new Promise<void>((resolve, reject) => {
    const item: QueueItem = { buffer, resolve, reject };

    if (state.isPlaying) {
      // 再生中なのでキューに追加
      state.queue.push(item);
    } else {
      // 即座に再生開始
      playBuffer(guildId, state, item);
    }
  });
}

/**
 * Bot がギルドのVCに接続しているか確認する。
 */
export function isConnected(guildId: string): boolean {
  return guildStates.has(guildId);
}

/**
 * Bot が接続中のチャンネルIDを返す。
 */
export function getConnectedChannelId(guildId: string): string | null {
  return guildStates.get(guildId)?.channelId ?? null;
}

// --- 内部ユーティリティ ---

function playBuffer(guildId: string, state: GuildVoiceState, item: QueueItem): void {
  try {
    state.isPlaying = true;
    const stream = Readable.from(item.buffer);
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    state.player.play(resource);
    item.resolve();
  } catch (err) {
    state.isPlaying = false;
    item.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

function startIdleTimer(guildId: string): void {
  const state = guildStates.get(guildId);
  if (!state) return;

  clearIdleTimer(guildId);
  state.idleTimer = setTimeout(() => {
    leaveChannel(guildId);
    console.log(`VC: ギルド ${guildId} からアイドルタイムアウトで退出しました。`);
  }, IDLE_TIMEOUT_MS);
  // Bot プロセスの終了を妨げない
  state.idleTimer.unref();
}

function clearIdleTimer(guildId: string): void {
  const state = guildStates.get(guildId);
  if (state?.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}
