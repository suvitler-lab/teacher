import { signal } from "@preact/signals";

// true when a request got 401 and we need the teacher to sign in again.
// Kept in its own module so both the api client and the outbox can use it
// without an import cycle.
export const authRequired = signal(false);

// true between "sign out" and the next sign-in: every background sender
// (submission outbox, attendance drafts) must stay quiet, and coming back
// online must not wake them.
export const syncPaused = signal(false);

// server time minus this device's clock, measured at the last LIVE bootstrap (kept in kv for offline starts)
export const serverSkewMs = signal(0);

// The data epoch this screen is looking at (bumped by every restore). Writes carry it, so a screen
// that has not heard about a restore cannot pour its stale edits into the restored data.
export const dataEpoch = signal<number | null>(null);
// set when the server said "the data was restored — you are out of date"
export const epochStale = signal(false);

// Can this device actually reach the server right now? The browser's own "online" only says there is a network
// (a classroom wifi can be up while the server cannot be reached). Set by every API call: a network failure or a
// timeout means no, any answer at all (even an error) means yes.
export const serverReachable = signal(true);
