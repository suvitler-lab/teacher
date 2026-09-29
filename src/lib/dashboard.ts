import { signal } from "@preact/signals";
import type { DashboardPayload } from "@shared/types";
import { api } from "./api";
import { kvGet, kvSet } from "./idb";

export const dashboard = signal<DashboardPayload | null>(null);
export const dashboardAt = signal<number | null>(null); // when the cached copy was fetched
export const dashboardStale = signal(false);            // showing cache because offline
// "error" = nothing to show for THIS term (offline with no saved copy, or the request failed)
export const dashboardStatus = signal<"loading" | "ready" | "error">("loading");

let seq = 0;

/**
 * Load the dashboard for a term. Falls back to a saved copy of THAT term when offline.
 * It never keeps showing another term's numbers: switching term clears the old ones
 * first, and a slow answer for a term the teacher already left is ignored.
 */
export async function loadDashboard(termId: string | null): Promise<void> {
  const n = ++seq;
  const key = `dashboard:${termId ?? ""}`;

  if (dashboard.value && (dashboard.value.termId ?? null) !== (termId ?? null)) {
    dashboard.value = null;
    dashboardStale.value = false;
  }
  if (!dashboard.value) dashboardStatus.value = "loading";

  try {
    const q = termId ? `?term=${encodeURIComponent(termId)}` : "";
    const d = await api.get<DashboardPayload>(`/api/dashboard${q}`);
    if (n !== seq) return;
    dashboard.value = d;
    dashboardAt.value = Date.now();
    dashboardStale.value = false;
    dashboardStatus.value = "ready";
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
