/**
 * カウンティングセマフォ（即時拒否方式）
 *
 * 同時実行数の上限を制御する。スロットに空きがなければ即座に拒否し、
 * キュー待機はしない。Discord interaction のタイムアウト（15分）を
 * 安全に守るための設計。
 */
export class Semaphore {
  private current = 0;

  constructor(private readonly max: number) {}

  get active(): number {
    return this.current;
  }

  get capacity(): number {
    return this.max;
  }

  /**
   * スロットを取得する。空きがあれば true を返し、なければ false を返す。
   * false の場合、呼び出し元は即座にユーザーに拒否メッセージを返すこと。
   */
  tryAcquire(): boolean {
    if (this.current < this.max) {
      this.current++;
      return true;
    }
    return false;
  }

  /**
   * スロットを解放する。finally ブロックで必ず呼ぶこと。
   */
  release(): void {
    if (this.current > 0) {
      this.current--;
      // 待機中の resolve があれば通知する
      const resolve = this.waiters.shift();
      if (resolve) resolve();
    }
  }

  private waiters: Array<() => void> = [];

  /**
   * スロットが空くまで待機して取得する（待機方式）。
   * timeoutMs 以内に取得できなければ false を返す。
   */
  async acquire(timeoutMs: number): Promise<boolean> {
    if (this.current < this.max) {
      this.current++;
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const idx = this.waiters.indexOf(onRelease);
          if (idx !== -1) this.waiters.splice(idx, 1);
          resolve(false);
        }
      }, timeoutMs);

      const onRelease = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.current++;
          resolve(true);
        }
      };

      this.waiters.push(onRelease);
    });
  }
}
