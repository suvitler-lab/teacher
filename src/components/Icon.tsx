// Tabler icons via the webfont (one small font file) instead of per-icon JS —
// keeps the bundle tiny. Sized with font-size, colored by inherited color.
export function Icon({
  name,
  size = 20,
  class: cls,
  title,
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  class?: string;
  title?: string;
  style?: string;
}) {
  return (
    <i
      class={`ti ti-${name}${cls ? " " + cls : ""}`}
      style={`font-size:${Math.round((size / 15) * 1000) / 1000}rem;line-height:1${style ? ";" + style : ""}`}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      title={title}
    />
  );
}
