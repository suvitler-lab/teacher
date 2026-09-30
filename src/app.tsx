import { useEffect } from "preact/hooks";
import "./styles/shell.css";
import { accountEmailSet, authState, loadBootstrap, loadBootstrapCached, loadSelectedTerm, settings } from "./store";
import { kvGet } from "./lib/idb";
import { pauseSync } from "./lib/outbox";
import { requestPersist } from "./lib/storage";
import { route, routeName } from "./router";
import { api, withTimeout } from "./lib/api";
import { authRequired } from "./lib/session";
import { retryUntilReachable } from "./lib/reconnect";
import { Setup } from "./pages/Setup";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { ScanPage } from "./pages/Scan";
import { GradebookPage } from "./pages/Gradebook";
import { AttendancePage } from "./pages/Attendance";
import { RandomPage } from "./pages/Random";
import { StudentsPage } from "./pages/Students";
import { SettingsPage } from "./pages/Settings";
import { ReportsPage } from "./pages/Reports";
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
  const me = await withTimeout(api.get<Me>("/api/auth/me"), REACH_TIMEOUT_MS);
  if (me.authenticated) await loadBootstrap();
  else authRequired.value = true; // the session ended while we were away: sign in again (unsent work is kept)
}

export function App() {
  const state = authState.value;

  useEffect(() => {
    (async () => {
      try {
        const me = await withTimeout(api.get<Me>("/api/auth/me"), REACH_TIMEOUT_MS);
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
          authState.value = "login";
        }
      }
    })();
  }, []);

  if (state === "loading") {
    return (
      <div class="auth-wrap">
        <Icon name="loader-2" size={28} class="spin" />
      </div>
    );
  }
  if (state === "setup") return <Setup mode="setup" />;
  if (state === "login") return <Setup mode="login" />;

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
    default: return <Home />;
  }
}
