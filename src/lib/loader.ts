import { useRef } from "preact/hooks";

export type LoadStatus = "loading" | "ready" | "error";

/**
 * Guards async page loads. Call `begin()` at the start of a load; after every await
 * ask the returned function whether this load is still the newest — if not, drop its
 * answer. Without it a slow reply for class A lands after the teacher already picked
 * class B and paints A's numbers under B's chip.
 */
export function useLoadGuard() {
  const seq = useRef(0);
  return () => {
    const n = ++seq.current;
    return () => n === seq.current;
  };
}
