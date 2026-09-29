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
      style={`font-size:${size}px;line-height:1${style ? ";" + style : ""}`}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      title={title}
    />
  );
}
