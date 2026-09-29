import { serverSkewMs } from "./session";

let last = 0;

/** Now on the SERVER's clock: this device's clock plus the skew measured at the last live bootstrap. */
export function serverNow(): number {
  return Date.now() + serverSkewMs.value;
}

/**
 * The time to stamp on something the teacher just DID. Two devices — or a queued edit and a
 * whole-class clear — are ordered by these stamps (not by which request happens to arrive first),
 * so they are on the server's clock, and strictly increasing here: two actions never share a
 * millisecond, and the later one always wins.
 */
export function actionTime(): number {
  last = Math.max(serverNow(), last + 1);
  return last;
}
