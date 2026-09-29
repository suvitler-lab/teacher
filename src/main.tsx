import { render } from "preact";
import "./styles/base.css";
import { App } from "./app";

const root = document.getElementById("app");
if (root) render(<App />, root);

// register the service worker for offline app-shell (production build only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
