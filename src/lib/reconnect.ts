/**
 * Something started from saved data because the server could not be reached. Try `probe` now and then — and the
 * moment the browser says it is online — until it succeeds once. Returns a function that stops trying.
 * (`probe` throws while the server is still out of reach.)
 */
export function retryUntilReachable(probe: () => Promise<void>, everyMs = 20_000): () => void {
  let busy = false;
  let stopped = false;
  const attempt = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      await probe();
      stop();
    } catch {
      /* still out of reach: the next tick tries again */
    }
    busy = false;
  };
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("online", attempt);
  };
  const timer = setInterval(() => void attempt(), everyMs);
  window.addEventListener("online", attempt);
  return stop;
}
