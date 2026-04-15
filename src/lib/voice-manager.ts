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

interface QueueItem {
  buffer: Buffer;
  resolve: () => void;
  reject: (err: Error) => void;
}

interface GuildVoiceState {
  connection: VoiceConnection;
  player: AudioPlayer;
  channelId: string;
  queue: QueueItem[];
  isPlaying: boolean;
}

// Map<guildId, GuildVoiceState>
const guildStates = new Map<string, GuildVoiceState>();

type PlayStateCallback = (isPlaying: boolean) => void;
let playStateCallback: PlayStateCallback | null = null;

/**
 * 再生状態が変化したときに呼ばれるコールバックを登録する。
 * isPlaying=true: いずれかのギルドで再生中、false: 全ギルドで停止中。
 */
export function setPlayStateCallback(cb: PlayStateCallback): void {
  playStateCallback = cb;
}

/** 全ギルドの再生状態を確認してコールバックを呼ぶ */
function notifyPlayState(): void {
  if (!playStateCallback) return;
  const isPlaying = Array.from(guildStates.values()).some((s) => s.isPlaying);
  playStateCallback(isPlaying);
}

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
      notifyPlayState();
    }
  });

  player.on('error', (err) => {
    const s = guildStates.get(guildId);
    if (!s) return;

    s.isPlaying = false;
    const current = s.queue.shift();
    if (current) current.reject(err);

    const next = s.queue.shift();
    if (next) {
      playBuffer(guildId, s, next);
    } else {
      notifyPlayState();
    }
  });
}

/**
 * ボイスチャンネルから退出する。
 * @returns 退出したか（false = 接続していなかった）
 */
export function leaveChannel(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state) return false;

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

  return new Promise<void>((resolve, reject) => {
    const item: QueueItem = { buffer, resolve, reject };

    if (state.isPlaying) {
      state.queue.push(item);
    } else {
      playBuffer(guildId, state, item);
    }
  });
}

/**
 * Bot がギルドの VC に接続しているか確認する。
 */
export function isConnected(guildId: string): boolean {
  return guildStates.has(guildId);
}

/**
 * Bot が接続中のチャンネル ID を返す。
 */
export function getConnectedChannelId(guildId: string): string | null {
  return guildStates.get(guildId)?.channelId ?? null;
}

// --- 内部ユーティリティ ---

function playBuffer(guildId: string, state: GuildVoiceState, item: QueueItem): void {
  try {
    state.isPlaying = true;
    notifyPlayState();
    const stream = Readable.from(item.buffer);
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    state.player.play(resource);
    item.resolve();
  } catch (err) {
    state.isPlaying = false;
    notifyPlayState();
    item.reject(err instanceof Error ? err : new Error(String(err)));
  }
}
