import { describe, expect, it } from "vitest";
import {
  ROUND_AUTO_ADVANCE_DELAY_MS,
  RoundAutoAdvanceController,
  type AutoAdvanceTimerPort,
} from "../../src/app/round-auto-advance.js";

class FakeTimers implements AutoAdvanceTimerPort {
  public readonly delays: number[] = [];
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  public setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.delays.push(delayMs);
    this.callbacks.set(id, callback);
    return id;
  }

  public clearTimeout(timerId: number): void {
    this.callbacks.delete(timerId);
  }

  public runAll(): void {
    for (const [id, callback] of [...this.callbacks]) {
      this.callbacks.delete(id);
      callback();
    }
  }

  public pendingCount(): number {
    return this.callbacks.size;
  }
}

describe("RoundAutoAdvanceController", () => {
  it("advances after the configured delay", () => {
    const timers = new FakeTimers();
    let clicks = 0;
    const states: string[] = [];
    const controller = new RoundAutoAdvanceController(
      timers,
      ROUND_AUTO_ADVANCE_DELAY_MS,
      (state) => states.push(state),
    );

    controller.observe({ click: () => { clicks += 1; } });

    expect(timers.delays).toEqual([1200]);
    expect(timers.pendingCount()).toBe(1);
    expect(states).toEqual(["scheduled"]);

    timers.runAll();

    expect(clicks).toBe(1);
    expect(timers.pendingCount()).toBe(0);
    expect(states).toEqual(["scheduled", "idle"]);
  });

  it("uses Enter to advance immediately", () => {
    const timers = new FakeTimers();
    let clicks = 0;
    const controller = new RoundAutoAdvanceController(timers);
    controller.observe({ click: () => { clicks += 1; } });

    expect(controller.handleKey("Enter")).toBe(true);
    expect(clicks).toBe(1);
    expect(timers.pendingCount()).toBe(0);
    timers.runAll();
    expect(clicks).toBe(1);
  });

  it("uses Escape to pause on the completion summary", () => {
    const timers = new FakeTimers();
    let clicks = 0;
    const states: string[] = [];
    const controller = new RoundAutoAdvanceController(
      timers,
      ROUND_AUTO_ADVANCE_DELAY_MS,
      (state) => states.push(state),
    );
    controller.observe({ click: () => { clicks += 1; } });

    expect(controller.handleKey("Escape")).toBe(true);
    expect(timers.pendingCount()).toBe(0);
    expect(states).toEqual(["scheduled", "paused"]);
    timers.runAll();
    expect(clicks).toBe(0);

    expect(controller.handleKey("Enter")).toBe(true);
    expect(clicks).toBe(1);
  });

  it("cancels the old timer when the completion target changes", () => {
    const timers = new FakeTimers();
    let firstClicks = 0;
    let secondClicks = 0;
    const controller = new RoundAutoAdvanceController(timers);

    controller.observe({ click: () => { firstClicks += 1; } });
    controller.observe({ click: () => { secondClicks += 1; } });

    expect(timers.pendingCount()).toBe(1);
    timers.runAll();
    expect(firstClicks).toBe(0);
    expect(secondClicks).toBe(1);
  });
});
