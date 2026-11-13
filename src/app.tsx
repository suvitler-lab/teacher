import { useEffect, useRef } from "preact/hooks";
import "./styles/shell.css";
import { accountEmailSet, authState, classes, onboardingOn, terms, loadBootstrap, loadBootstrapCached, loadSelectedTerm, settings } from "./store";
import { kvGet } from "./lib/idb";
import { pauseSync } from "./lib/outbox";
import { requestPersist } from "./lib/storage";
import { adoptServerAppearance, deferAppearanceAdoption } from "./lib/appearance";
import { navigate, route, routeName } from "./router";
import { api } from "./lib/api";
import { authRequired } from "./lib/session";
import { retryUntilReachable } from "./lib/reconnect";
import { Setup } from "./pages/Setup";
import { Onboarding } from "./pages/Onboarding";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { ScanPage } from "./pages/Scan";
import { GradebookPage } from "./pages/Gradebook";
import { AttendancePage } from "./pages/Attendance";
import { RandomPage } from "./pages/Random";
import { StudentsPage } from "./pages/Students";
import { SettingsPage } from "./pages/Settings";
import { ReportsPage } from "./pages/Reports";
import { TimetablePage } from "./pages/Timetable";
import { Icon } from "./components/Icon";
import { startOutbox } from "./lib/outbox";
import { setSoundEnabled } from "./lib/sound";

interface Me {
  authenticated: boolean;
  isSetup: boolean;
  emailSet?: boolean;
  device?: { id: string; name: string } | null;
}

// A connected-but-dead network (stalling classroom wifi) would keep the spinner up for minutes: after this long the
// server counts as unreachable and the app starts from what this device saved.
const REACH_TIMEOUT_MS = 8000;

/** Ask the server who we are; while it can't be reached this throws. Live data replaces the saved copy on success. */
async function goLive() {
  const me = await api.get<Me>("/api/auth/me", { timeoutMs: REACH_TIMEOUT_MS });
  if (me.authenticated) { await loadBootstrap(); adoptServerAppearance(); }
  else authRequired.value = true; // the session ended while we were away: sign in again (unsent work is kept)
}

const PAGES = ["home", "timetable", "scan", "attendance", "random", "gradebook", "reports", "students", "settings"];

/** The page a signed-out visitor asked for (`#/scan`, `#/settings?section=catalog`), or null for none / the home page / unknown. */
export function deepLinkOf(path: string): string | null {
  const name = path.split("?")[0].split("/")[1] || "home";
  return name !== "home" && PAGES.includes(name) ? path : null;
}

export function App() {
  const state = authState.value;
  // A deep link opened before signing in is kept (the address itself is untouched while the sign-in page shows) and
  // opened once sign-in finishes; the sign-in page sends everyone to #/home, which would otherwise lose it.
  const wanted = useRef<string | null>(deepLinkOf(route.value));
  const was = useRef(state);
  // a link tapped while the sign-in page is already open (a hashchange, not a new start) is kept too
  useEffect(() => route.subscribe((r) => {
    if (authState.peek() === "ready") return;
    const d = deepLinkOf(r);
    if (d) wanted.current = d;
  }), []);
  useEffect(() => {
    const signedInNow = state === "ready" && (was.current === "login" || was.current === "setup");
    was.current = state;
    if (signedInNow && wanted.current) {
      const to = wanted.current;
      wanted.current = null;
      navigate(to);
    } else if (state === "ready") wanted.current = null;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<Me>("/api/auth/me", { timeoutMs: REACH_TIMEOUT_MS });
        accountEmailSet.value = me.emailSet !== false;
        if (me.authenticated && (await kvGet<boolean>("loggedOut"))) {
          // The teacher signed out on this device (perhaps offline, so the server session
          // survived). Coming back online must not quietly sign them back in: finish it.
          pauseSync();
          try { await api.post("/api/auth/logout"); } catch { /* try again next start */ }
          authState.value = "login";
        } else if (me.authenticated) {
          await loadBootstrap();
          await loadSelectedTerm();
          setSoundEnabled(settings.value?.sound_enabled ?? true);
          startOutbox();
          void requestPersist();
          authState.value = "ready";
        } else {
          authState.value = me.isSetup ? "login" : "setup";
        }
      } catch {
        // offline: if we have a cached session's data, keep working
        deferAppearanceAdoption(); // the saved copy's look may be older than what was chosen here: wait for the server's
        const cached = await loadBootstrapCached();
        if (cached) {
          await loadSelectedTerm();
          setSoundEnabled(settings.value?.sound_enabled ?? true);
          startOutbox();
          void requestPersist();
          authState.value = "ready";
          // working from saved data: keep asking, and the moment the server answers show its data instead
          retryUntilReachable(goLive);
        } else {
          adoptServerAppearance(); // nothing saved here to wait for: the next sign-in brings the server's look
          authState.value = "login";
        }
      }
    })();
  }, []);

  // first run: an empty account (no term or no class yet) gets the welcome guide once
  const firstRun = state === "ready" && !!settings.value && !settings.value.onboarding_done && (terms.value.length === 0 || classes.value.length === 0);
  useEffect(() => { if (firstRun) onboardingOn.value = true; }, [firstRun]); // latched: stays while its own steps fill in the data checked above

  if (state === "loading") {
    return (
      <div class="auth-wrap">
        <Icon name="loader-2" size={28} class="spin" />
      </div>
    );
  }
  if (state === "setup") return <Setup mode="setup" />;
  if (state === "login") return <Setup mode="login" />;

  if (onboardingOn.value || firstRun) return <Onboarding />;

  return (
    <Shell>
      <Page />
    </Shell>
  );
}

function Page() {
  void route.value;
  switch (routeName()) {
    case "scan": return <ScanPage />;
    case "gradebook": return <GradebookPage />;
    case "attendance": return <AttendancePage />;
    case "random": return <RandomPage />;
    case "reports": return <ReportsPage />;
    case "students": return <StudentsPage />;
    case "settings": return <SettingsPage />;
    case "timetable": return <TimetablePage />;
    default: return <Home />;
  }
}
