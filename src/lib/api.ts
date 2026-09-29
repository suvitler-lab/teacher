export class ApiError extends Error {
  status: number;
  code: string;
  data: any;
  constructor(status: number, code: string, message: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Writes say which data epoch they were made against; after a restore elsewhere the server refuses them.
  const { dataEpoch } = await import("./session");
  if (method !== "GET" && dataEpoch.value != null) headers["X-Data-Epoch"] = String(dataEpoch.value);
  const init: RequestInit = {
    method,
    headers,
    credentials: "same-origin",
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network", "ต่ออินเทอร์เน็ตไม่ได้");
  }
  const isJson = (res.headers.get("Content-Type") || "").includes("application/json");
  const payload: any = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    // a 401 anywhere means the session expired — prompt re-login globally
    if (res.status === 401 && path !== "/api/auth/me" && path !== "/api/auth/login") {
      const { authRequired } = await import("./session");
      authRequired.value = true;
    }
    if (res.status === 409 && payload.error === "epoch_changed" && !path.startsWith("/api/restore/")) {
      const { epochStale } = await import("./session");
      epochStale.value = true;
    }
    throw new ApiError(res.status, payload.error ?? "error", payload.message ?? payload.error ?? "เกิดข้อผิดพลาด", payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
};
