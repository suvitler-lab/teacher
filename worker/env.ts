export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SETUP_CODE?: string;
  SESSION_PEPPER?: string;
}

// Hono context variables
export interface Vars {
  deviceId?: string;
}
