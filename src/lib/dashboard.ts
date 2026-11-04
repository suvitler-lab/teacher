import { signal } from "@preact/signals";
import type { DashboardPayload } from "@shared/types";
import { api } from "./api";
import { kvGet, kvSet } from "./idb";
import { swrPeek, swrFetch, swrGeneration, SWR_FRESH_MS } from "./swr";

export const dashboard = signal<DashboardPayload | null>(null);
export const dashboardAt = signal<number | null>(null); // when the cached copy was fetched
export const dashboardStale = signal(false);            // showing cache because offline
// "error" = nothing to show for THIS term (offline with no saved copy, or the request failed)
export const dashboardStatus = signal<"loading" | "ready" | "error">("loading");

let seq = 0;
let shownIn = -1; // the swr generation the numbers on screen were read in (a write since then makes them suspect)

export interface LoadDashboardOptions {
  /** ask the network even if the numbers on screen / the saved answer are young (a retry button) */
  force?: boolean;
  /** how young the numbers on screen must be to skip the request (default: the cache's fresh window) */
  maxAgeMs?: number;
}

/**
 * Load the dashboard for a term. Falls back to a saved copy of THAT term when offline.
 * It never keeps showing another term's numbers: switching term clears the old ones
 * first, and a slow answer for a term the teacher already left is ignored.
 */
export async function loadDashboard(termId: string | null, opts: LoadDashboardOptions = {}): Promise<void> {
  const key = `dashboard:${termId ?? ""}`;
  const q = termId ? `?term=${encodeURIComponent(termId)}` : "";
  const url = `/api/dashboard${q}`;

  // numbers for THIS term are already on screen, read live and young, and nothing was written since: no request
  if (!opts.force && dashboard.value && (dashboard.value.termId ?? null) === (termId ?? null) && !dashboardStale.value
    && dashboardStatus.value === "ready" && shownIn === swrGeneration()
    && dashboardAt.value != null && Date.now() - dashboardAt.value < (opts.maxAgeMs ?? SWR_FRESH_MS)) return;

  const n = ++seq;

  if (dashboard.value && (dashboard.value.termId ?? null) !== (termId ?? null)) {
    dashboard.value = null;
    dashboardStale.value = false;
  }
  // coming back to the page: paint the last answer for this exact term at once, and only ask again when it is old
  const hit = opts.force ? null : swrPeek<DashboardPayload>(url);
  if (hit && (hit.data.termId ?? null) === (termId ?? null)) {
    dashboard.value = hit.data;
    dashboardAt.value = hit.at;
    dashboardStale.value = false;
    dashboardStatus.value = "ready";
    shownIn = swrGeneration();
    if (hit.fresh) return;
  }
  if (!dashboard.value) dashboardStatus.value = "loading";

  try {
    const gen = swrGeneration();
    const d = await swrFetch(url, () => api.get<DashboardPayload>(url));
    if (n !== seq) return;
    dashboard.value = d;
    dashboardAt.value = Date.now();
    dashboardStale.value = false;
    dashboardStatus.value = "ready";
    shownIn = gen === swrGeneration() ? gen : -1;
    await kvSet(key, { at: Date.now(), data: d });
  } catch {
    const cached = await kvGet<{ at: number; data: DashboardPayload }>(key);
    if (n !== seq) return;
    if (cached) {
      dashboard.value = cached.data;
      dashboardAt.value = cached.at;
      dashboardStale.value = true;
      dashboardStatus.value = "ready";
    } else {
      dashboard.value = null;
      dashboardStale.value = false;
      dashboardStatus.value = "error";
    }
  }
}
