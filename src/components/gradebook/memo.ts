import { Component, h, type ComponentChildren, type FunctionComponent } from "preact";

function shallowSame(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

/**
 * Skip drawing a component again while none of its props changed (shallow, by identity). Same idea as React.memo,
 * without pulling in preact/compat (which also patches how every other component behaves).
 */
export function memoShallow<P extends object>(Inner: FunctionComponent<P>): FunctionComponent<P> {
  class Memo extends Component<P> {
    shouldComponentUpdate(next: P) { return !shallowSame(this.props as Record<string, unknown>, next as Record<string, unknown>); }
    render(props: P & { children?: ComponentChildren }) { return h(Inner as FunctionComponent<any>, props); }
  }
  (Memo as unknown as { displayName: string }).displayName = `Memo(${Inner.displayName || Inner.name || "Component"})`;
  return Memo as unknown as FunctionComponent<P>;
}
