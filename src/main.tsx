import { render } from "preact";
import "./styles/base.css";
import { App } from "./app";
import { initOffline } from "./lib/offline";

const root = document.getElementById("app");
if (root) render(<App />, root);

// keep the app on the device for offline use (production build only) — and show whether it worked
initOffline();
