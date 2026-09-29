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
  if (/Android/i.test(ua)) return "มือถือ Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "มือถือ iOS";
  if (/Windows/i.test(ua)) return "คอมพิวเตอร์";
  return "อุปกรณ์นี้";
}
