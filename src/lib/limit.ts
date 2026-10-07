// Runs at most `n` of the given tasks at once; the rest wait their turn.
// The Today weave reads one event list per conversation, and a busy day
// shouldn't open dozens of requests together (build-plan §8).
export function limiter(n: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (running >= n) return;
    const start = queue.shift();
    if (start) start();
  };
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });
  };
}
