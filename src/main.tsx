import { render } from "preact";
import "./styles/base.css";
import { App } from "./app";
import { initOffline } from "./lib/offline";
import { applyStoredTheme } from "./lib/theme";
import { applyStoredDisplay } from "./lib/display";

applyStoredTheme(); // before the first paint
applyStoredDisplay(); // text size + density, also before the first paint

const root = document.getElementById("app");
if (root) render(<App />, root);

// keep the app on the device for offline use (production build only) — and show whether it worked
initOffline();
