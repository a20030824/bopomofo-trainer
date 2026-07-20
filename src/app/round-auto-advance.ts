export const ROUND_AUTO_ADVANCE_DELAY_MS = 1200;

export interface AutoAdvanceTarget {
  click(): void;
}

export interface AutoAdvanceTimerPort {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

export type AutoAdvanceState = "idle" | "scheduled" | "paused";

export class RoundAutoAdvanceController {
  private target: AutoAdvanceTarget | null = null;
  private timerId: number | null = null;
  private state: AutoAdvanceState = "idle";

  public constructor(
    private readonly timers: AutoAdvanceTimerPort,
    private readonly delayMs = ROUND_AUTO_ADVANCE_DELAY_MS,
    private readonly onStateChange: (state: AutoAdvanceState) => void = () => undefined,
  ) {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("auto-advance delay must be finite and non-negative");
    }
  }

  public observe(target: AutoAdvanceTarget | null): void {
    if (target === this.target) return;
    this.clearTimer();
    this.target = target;
    if (target === null) {
      this.setState("idle");
      return;
    }
    this.schedule();
  }

  public handleKey(code: string): boolean {
    if (this.target === null) return false;
    if (code === "Enter") {
      this.advanceNow();
      return true;
    }
    if (code === "Escape") {
      this.pause();
      return true;
    }
    return false;
  }

  public advanceNow(): void {
    const target = this.target;
    if (target === null) return;
    this.clearTimer();
    this.target = null;
    this.setState("idle");
    target.click();
  }

  public pause(): void {
    if (this.target === null) return;
    this.clearTimer();
    this.setState("paused");
  }

  public dispose(): void {
    this.clearTimer();
    this.target = null;
    this.setState("idle");
  }

  private schedule(): void {
    this.clearTimer();
    this.setState("scheduled");
    this.timerId = this.timers.setTimeout(() => {
      this.timerId = null;
      this.advanceNow();
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    this.timers.clearTimeout(this.timerId);
    this.timerId = null;
  }

  private setState(state: AutoAdvanceState): void {
    if (state === this.state) return;
    this.state = state;
    this.onStateChange(state);
  }
}
