export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SETUP_CODE?: string;
  SESSION_PEPPER?: string;
}

// Hono context variables
export interface Vars {
  deviceId?: string;
  /** what the session cookie resolved to, looked up ONCE per request (null = no valid session) */
  sessionDevice?: string | null;
  /** the data epoch when this write request started; a restore that lands later must not be written into */
  epoch?: number;
  /** the data epoch as the preamble read it, for every request (reads can report it without another query) */
  dataEpoch?: number;
}
