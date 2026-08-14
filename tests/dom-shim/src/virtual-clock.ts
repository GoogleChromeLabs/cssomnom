/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

export interface ScheduledTask {
  id: number;
  type: 'timeout' | 'interval';
  time: number;
  seq: number;
  interval?: number;
  cb: Function;
  args: unknown[];
  cancelled: boolean;
}

export interface ScheduledRaf {
  id: number;
  targetFrameTime: number;
  cb: (time: number) => void;
  cancelled: boolean;
}

export interface PumpOptions {
  maxTicks?: number;
  maxVirtualDuration?: number;
}

export class VirtualClock {
  private _currentTime = 0;
  private _nextId = 1;
  private _seq = 0;
  private _tasks: ScheduledTask[] = [];
  private _taskMap: Map<number, ScheduledTask> = new Map();
  private _rafCallbacks: Map<number, ScheduledRaf> = new Map();
  private _nextRafTime: number | null = null;

  public onRafFrame?: (currentTime: number) => void;
  public onError?: (error: unknown) => void;

  get currentTime(): number {
    return this._currentTime;
  }

  get pendingTasksCount(): number {
    return this._tasks.filter(t => !t.cancelled).length + Array.from(this._rafCallbacks.values()).filter(r => !r.cancelled).length;
  }

  setTimeout(cb: Function, delay?: number, ...args: unknown[]): number {
    const delayMs = Math.max(0, typeof delay === 'number' && !isNaN(delay) ? delay : 0);
    const targetTime = this._currentTime + delayMs;
    const id = this._nextId++;
    const task: ScheduledTask = {
      id,
      type: 'timeout',
      time: targetTime,
      seq: ++this._seq,
      cb,
      args,
      cancelled: false
    };
    this._taskMap.set(id, task);
    this._insertTask(task);
    return id;
  }

  clearTimeout(id: unknown): void {
    if (typeof id !== 'number' && (typeof id !== 'object' || id === null)) return;
    const numId = typeof id === 'number' ? id : (id as { [Symbol.toPrimitive]?: () => number })?.[Symbol.toPrimitive]?.() ?? Number(id);
    const task = this._taskMap.get(numId);
    if (task) {
      task.cancelled = true;
      this._taskMap.delete(numId);
    }
  }

  setInterval(cb: Function, delay?: number, ...args: unknown[]): number {
    const delayMs = Math.max(1, typeof delay === 'number' && !isNaN(delay) ? delay : 0);
    const targetTime = this._currentTime + delayMs;
    const id = this._nextId++;
    const task: ScheduledTask = {
      id,
      type: 'interval',
      time: targetTime,
      seq: ++this._seq,
      interval: delayMs,
      cb,
      args,
      cancelled: false
    };
    this._taskMap.set(id, task);
    this._insertTask(task);
    return id;
  }

  clearInterval(id: unknown): void {
    this.clearTimeout(id);
  }

  requestAnimationFrame(cb: (time: number) => void): number {
    const id = this._nextId++;
    if (this._nextRafTime === null || this._nextRafTime < this._currentTime) {
      this._nextRafTime = this._currentTime + 16.666;
    }
    const targetFrameTime = this._nextRafTime;
    const rafEntry: ScheduledRaf = {
      id,
      targetFrameTime,
      cb,
      cancelled: false
    };
    this._rafCallbacks.set(id, rafEntry);
    return id;
  }

  cancelAnimationFrame(id: unknown): void {
    if (typeof id !== 'number' && (typeof id !== 'object' || id === null)) return;
    const numId = typeof id === 'number' ? id : (id as { [Symbol.toPrimitive]?: () => number })?.[Symbol.toPrimitive]?.() ?? Number(id);
    const rafEntry = this._rafCallbacks.get(numId);
    if (rafEntry) {
      rafEntry.cancelled = true;
      this._rafCallbacks.delete(numId);
    }
    if (this._rafCallbacks.size === 0) {
      this._nextRafTime = null;
    }
  }

  async drainMicrotasks(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  }

  async step(): Promise<boolean> {
    await this.drainMicrotasks();

    // Clean up leading cancelled tasks
    while (this._tasks.length > 0 && this._tasks[0].cancelled) {
      this._tasks.shift();
    }

    const hasRaf = this._rafCallbacks.size > 0 && this._nextRafTime !== null;
    const nextTask = this._tasks.length > 0 ? this._tasks[0] : null;

    if (!hasRaf && !nextTask) {
      return false;
    }

    // Determine whether next event is rAF or macrotask
    const isRafNext = hasRaf && (!nextTask || this._nextRafTime! <= nextTask.time);

    if (isRafNext) {
      const frameTime = this._nextRafTime!;
      this._nextRafTime = null;

      // Snapshot callbacks scheduled for this frame
      const frameCallbacks: ScheduledRaf[] = [];
      for (const [id, entry] of this._rafCallbacks) {
        if (entry.targetFrameTime <= frameTime) {
          frameCallbacks.push(entry);
          this._rafCallbacks.delete(id);
        }
      }

      this._currentTime = frameTime;
      await this.drainMicrotasks();

      try {
        this.onRafFrame?.(this._currentTime);
      } catch (err) {
        this.onError?.(err);
      }

      for (const entry of frameCallbacks) {
        if (!entry.cancelled) {
          try {
            entry.cb(this._currentTime);
          } catch (err) {
            this.onError?.(err);
          }
        }
      }

      await this.drainMicrotasks();
      return true;
    } else if (nextTask) {
      this._tasks.shift();
      this._taskMap.delete(nextTask.id);

      this._currentTime = nextTask.time;
      await this.drainMicrotasks();

      if (!nextTask.cancelled) {
        try {
          nextTask.cb(...nextTask.args);
        } catch (err) {
          this.onError?.(err);
        }

        if (nextTask.type === 'interval' && !nextTask.cancelled) {
          const nextIntervalTask: ScheduledTask = {
            id: nextTask.id,
            type: 'interval',
            time: this._currentTime + nextTask.interval!,
            seq: ++this._seq,
            interval: nextTask.interval,
            cb: nextTask.cb,
            args: nextTask.args,
            cancelled: false
          };
          this._taskMap.set(nextTask.id, nextIntervalTask);
          this._insertTask(nextIntervalTask);
        }
      }

      await this.drainMicrotasks();
      return true;
    }

    return false;
  }

  async pumpUntil(
    isDone: () => boolean,
    options?: PumpOptions
  ): Promise<boolean> {
    const maxTicks = options?.maxTicks ?? 10000;
    const maxVirtualDuration = options?.maxVirtualDuration ?? 60000;
    const startTime = this._currentTime;

    await this.drainMicrotasks();
    if (isDone()) {
      return true;
    }

    let ticks = 0;
    let emptyStreak = 0;
    while (ticks < maxTicks && (this._currentTime - startTime) <= maxVirtualDuration) {
      if (isDone()) {
        return true;
      }
      const hasMore = await this.step();
      ticks++;
      if (isDone()) {
        return true;
      }
      if (!hasMore) {
        emptyStreak++;
        await this.drainMicrotasks();
        if (isDone()) return true;
        // Yield to Node event loop so subresource loads and file/network I/O progress
        await new Promise(resolve => setTimeout(resolve, 5));
        await this.drainMicrotasks();
        if (isDone()) return true;
        if (emptyStreak > 10 && this.pendingTasksCount === 0 && this._rafCallbacks.size === 0) {
          return isDone();
        }
      } else {
        emptyStreak = 0;
      }
    }

    return isDone();
  }

  reset(): void {
    this._currentTime = 0;
    this._nextId = 1;
    this._seq = 0;
    this._tasks = [];
    this._taskMap.clear();
    this._rafCallbacks.clear();
    this._nextRafTime = null;
  }

  private _insertTask(task: ScheduledTask): void {
    let low = 0;
    let high = this._tasks.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const item = this._tasks[mid];
      if (item.time < task.time || (item.time === task.time && item.seq <= task.seq)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this._tasks.splice(low, 0, task);
  }
}
