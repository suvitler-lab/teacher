import { useRef, useState } from "preact/hooks";

/**
 * "This button is working": a second tap on the same action while the first is still on its way is ignored (an
 * impatient double tap must not send twice, or undo itself), and the screen can show the action as busy.
 * Keep the key per thing acted on (`pub:<assignment id>`), so different things can be in flight together.
 */
export function useAction() {
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  async function run(key: string, fn: () => Promise<void>): Promise<boolean> {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    try { await fn(); return true; }
    finally { inFlight.current.delete(key); setBusy(new Set(inFlight.current)); }
  }
  return { run, isBusy: (key: string) => busy.has(key), anyBusy: busy.size > 0 };
}
