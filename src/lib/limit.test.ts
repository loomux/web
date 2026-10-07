import { describe, expect, it } from "vitest";
import { limiter } from "./limit";

describe("limiter", () => {
  it("never runs more than n at once, and runs them all", async () => {
    const run = limiter(2);
    let active = 0;
    let peak = 0;
    const task = (v: number) => () =>
      new Promise<number>((resolve) => {
        active++;
        peak = Math.max(peak, active);
        setTimeout(() => {
          active--;
          resolve(v);
        }, 5);
      });
    const results = await Promise.all([1, 2, 3, 4, 5].map((v) => run(task(v))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("keeps going after a task fails", async () => {
    const run = limiter(1);
    await expect(run(() => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(run(() => Promise.resolve("yes"))).resolves.toBe("yes");
  });
});
