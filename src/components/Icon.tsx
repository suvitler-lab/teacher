// Phosphor icons via the webfont (one small font file per weight) instead of per-icon JS — keeps the bundle tiny.
// The weight follows the skin on screen (pro = bold, warm = duotone, playful = fill); the font itself is loaded with the
// skin (lib/fonts.ts). Sized with font-size, coloured by inherited colour. Callers keep using the app's icon names;
// iconMap.ts turns them into Phosphor names and `data-icon` keeps the app name so tests can find an icon by it (D45).
import { appearance, iconSkin } from "../lib/appearance";
import { ICON_WEIGHT } from "../lib/fonts";
import { phosphorName } from "../lib/iconMap";

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
  // while a new skin's icon font is still arriving, keep the weight whose font is already here (no blank icons, R-04)
  const weight = ICON_WEIGHT[iconSkin.value ?? appearance.value.skin];
  return (
    // `ti` is only a layout hook for a few older stylesheets (it no longer names a font)
    <i
      class={`ti ph-${weight} ph-${phosphorName(name)}${cls ? " " + cls : ""}`}
      data-icon={name}
      style={`font-size:${Math.round((size / 15) * 1000) / 1000}rem;line-height:1${style ? ";" + style : ""}`}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      title={title}
    />
  );
}
