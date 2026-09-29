// How the outbox should treat a failed delivery, by HTTP status.
//   retry  — transient: keep in the queue and back off
//   auth   — session expired: keep the queue, prompt re-login, then flush
//   failed — permanent client error: move to the "failed" list, don't retry
export type FailureKind = "retry" | "auth" | "failed";

export function classifyFailure(status: number): FailureKind {
  if (status === 0) return "retry"; // network error
  if (status === 401) return "auth";
  if (status === 423 || status === 429) return "retry"; // locked / rate-limited
  if (status >= 500) return "retry";
  if (status >= 400) return "failed"; // 4xx (incl. 422 validation, 409 conflict)
  return "retry";
}
