import { signal } from "@preact/signals";

function current(): string {
  const h = location.hash.replace(/^#/, "");
  return h || "/home";
}

export const route = signal<string>(current());

let lastRoute = route.value;
let guard: ((next: string) => boolean) | null = null;

/** While set, leaving the current page asks first: return false to stay where you are. */
export function setNavGuard(fn: ((next: string) => boolean) | null) {
  guard = fn;
}

window.addEventListener("hashchange", () => {
  const next = current();
  if (guard && next !== lastRoute && !guard(next)) {
    // stay: put the address back (fires hashchange once more, now equal to lastRoute)
    location.hash = lastRoute;
    return;
  }
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
