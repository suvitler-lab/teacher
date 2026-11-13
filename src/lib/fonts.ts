// Fonts and the icon font of each skin (D45). The files live in the app (so they work offline) but a page only asks
// for the ones of the skin on screen: each skin's CSS is its own chunk, fetched by a dynamic import on first use.
// (The service worker still keeps every skin's files for offline use — that is not a page request.)
import type { Skin } from "./appearance";

const LOADERS: Record<Skin, () => Promise<unknown>> = {
  pro: () => import("../styles/skins/pro.css"),
  warm: () => import("../styles/skins/warm.css"),
  playful: () => import("../styles/skins/playful.css"),
};

const started = new Map<Skin, Promise<void>>();

/** Load the fonts + icon weight of a skin once. Never rejects: a failure leaves the system font fallback in place. */
export function loadSkinAssets(skin: Skin): Promise<void> {
  let p = started.get(skin);
  if (!p) {
    p = LOADERS[skin]().then(() => undefined, () => { started.delete(skin); });
    started.set(skin, p);
  }
  return p;
}

/** The Phosphor weight class of a skin: pro = bold, warm = duotone, playful = fill. */
export const ICON_WEIGHT: Record<Skin, "bold" | "duotone" | "fill"> = { pro: "bold", warm: "duotone", playful: "fill" };
