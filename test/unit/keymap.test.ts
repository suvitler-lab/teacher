import { describe, it, expect } from "vitest";
import { charFromKey, fixThaiDigits } from "@shared/keymap";
import { qrToken, isQrToken, ulid } from "@shared/ids";

describe("HID keymap (layout-independent)", () => {
  it("decodes digits from physical codes even when key is a Thai glyph", () => {
    // On a Thai layout the '1' key emits key='ๅ' but code='Digit1'
    expect(charFromKey("Digit1", "ๅ")).toBe("1");
    expect(charFromKey("Digit5", "-")).toBe("5");
    expect(charFromKey("Minus", "-")).toBe("-");
  });
  it("decodes letters uppercased", () => {
    expect(charFromKey("KeyQ", "q")).toBe("Q");
  });
  it("handles numpad digits", () => {
    expect(charFromKey("Numpad7", "7")).toBe("7");
  });
  it("ignores modifier / unknown keys", () => {
    expect(charFromKey("ShiftLeft", "Shift")).toBeNull();
  });
});

describe("fixThaiDigits", () => {
  it("maps a Thai-typed student code back to digits", () => {
    // ค ต จ ข ช = 6 7 8 9 0
    expect(fixThaiDigits("คตจขช")).toBe("67890");
  });
});

describe("ids", () => {
  it("qrToken is uppercase Crockford, prefixed Q-", () => {
    for (let i = 0; i < 50; i++) {
      const t = qrToken();
      expect(isQrToken(t)).toBe(true);
      expect(t).toBe(t.toUpperCase());
    }
  });
  it("ulid is 26 chars and time-sortable", () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
  });
});
