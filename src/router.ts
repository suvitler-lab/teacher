import { signal } from "@preact/signals";

function current(): string {
  const h = location.hash.replace(/^#/, "");
  return h || "/home";
}

export const route = signal<string>(current());

let lastRoute = route.value;
export type NavGuard = (next: string) => boolean | Promise<boolean>;
let guard: NavGuard | null = null;
let skipGuard = false;

/**
 * While set, leaving the current page asks first: return false to stay where you are. A guard may answer later
 * (a dialog instead of confirm()): the page stays put meanwhile, and goes on to the wanted address if the answer is true.
 */
export function setNavGuard(fn: NavGuard | null) {
  guard = fn;
}

window.addEventListener("hashchange", () => {
  const next = current();
  if (guard && next !== lastRoute && !skipGuard) {
    const answer = guard(next);
    if (answer !== true) {
      // stay: put the address back (fires hashchange once more, now equal to lastRoute)
      location.hash = lastRoute;
      if (answer !== false) answer.then((go) => { if (go) { skipGuard = true; location.hash = next; } });
      return;
    }
  }
  skipGuard = false;
  lastRoute = next;
  route.value = next;
});

/** Navigate to a path, optionally with query params (`#/scan?asg=..&class=..`). */
export function navigate(path: string, params?: Record<string, string | number | null | undefined>) {
  let full = path;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, String(v));
    const s = q.toString();
    if (s) full += (path.includes("?") ? "&" : "?") + s;
  }
  if (location.hash !== "#" + full) location.hash = full;
  else route.value = full;
}

/** The page segment, without any query string (`/scan?x=1` -> `scan`). */
export function routeName(): string {
  return route.value.split("?")[0].split("/")[1] || "home";
}

/** Query params on the current route, as a plain object. */
export function routeParams(): Record<string, string> {
  const qi = route.value.indexOf("?");
  if (qi < 0) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(route.value.slice(qi + 1))) out[k] = v;
  return out;
}
