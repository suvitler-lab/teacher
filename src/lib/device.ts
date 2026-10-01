import { ulid } from "@shared/ids";

const ID_KEY = "gk_device_id";
const NAME_KEY = "gk_device_name";

export function deviceId(): string {
  let v = "";
  try {
    v = localStorage.getItem(ID_KEY) ?? "";
    if (!v) {
      v = "dev_" + ulid();
      localStorage.setItem(ID_KEY, v);
    }
  } catch {
    v = "dev_" + ulid();
  }
  return v;
}

export function deviceName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? defaultDeviceName();
  } catch {
    return defaultDeviceName();
  }
}

export function setDeviceName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux|CrOS/i.test(ua) ? "Linux" : "";
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || "อุปกรณ์นี้";
}

const EMAIL_KEY = "gk_email";

/** The e-mail last used to sign in on this device, to prefill the form (not a secret). */
export function savedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; }
}

export function saveEmail(email: string) {
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
}
