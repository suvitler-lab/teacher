import { describe, it, expect, vi, afterEach } from "vitest";
import { explainCamera, CameraError, diagnoseCamera, startCamera } from "../../src/lib/camera";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const named = (name: string) => Object.assign(new Error(name), { name });

describe("explainCamera — every failure becomes something the teacher can act on", () => {
  it("maps the browser's errors to a plain Thai reason and a next step", () => {
    expect(explainCamera(named("NotAllowedError")).kind).toBe("permission");
    expect(explainCamera(named("NotFoundError")).kind).toBe("no_camera");
    expect(explainCamera(named("OverconstrainedError")).kind).toBe("no_camera");
    expect(explainCamera(named("NotReadableError")).kind).toBe("busy");
    expect(explainCamera(named("SecurityError")).kind).toBe("insecure");
    expect(explainCamera(new CameraError("reader")).kind).toBe("reader");
    expect(explainCamera(new Error("???")).kind).toBe("unknown");
    for (const k of ["permission", "no_camera", "busy", "insecure", "reader", "unknown"] as const) {
      const x = explainCamera(new CameraError(k));
      expect(x.title.length).toBeGreaterThan(5);
      expect(x.hint.length).toBeGreaterThan(5);
    }
  });
});

describe("startCamera refuses early, with a reason, when it can't possibly work", () => {
  it("not a secure context (plain http)", async () => {
    vi.stubGlobal("isSecureContext", false);
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    await expect(startCamera(document.createElement("video"), () => {})).rejects.toMatchObject({ kind: "insecure" });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  it("no camera API in this browser", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    await expect(startCamera(document.createElement("video"), () => {})).rejects.toMatchObject({ kind: "unsupported" });
  });
});

describe("diagnoseCamera — a device without its own reader is not a broken device", () => {
  // a fresh copy of the module each time: it remembers which reader it loaded, and that must not leak into the other tests
  const fresh = async () => { vi.resetModules(); return (await import("../../src/lib/camera")).diagnoseCamera; };

  it("reports a missing or QR-less BarcodeDetector as information (ok), because the fallback reader does the job", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    const none = (await (await fresh())()).find((r) => r.label.includes("BarcodeDetector"))!;
    expect(none.ok).toBe(true);
    expect(none.detail).toMatch(/ตัวอ่านสำรอง/);

    vi.stubGlobal("BarcodeDetector", class { static async getSupportedFormats() { return ["ean_13"]; } });
    const noQr = (await (await fresh())()).find((r) => r.label.includes("BarcodeDetector"))!;
    expect(noQr.ok).toBe(true);
    expect(noQr.detail).toMatch(/ไม่รองรับ QR/);
  });
});

describe("diagnoseCamera — what the Settings test button shows", () => {
  const row = (rows: { label: string; ok: boolean; detail: string }[], part: string) => rows.find((r) => r.label.includes(part))!;

  it("B06: a page policy that refuses WebAssembly is reported as exactly that (the iPad reader depends on it)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
    vi.spyOn(WebAssembly, "compile").mockRejectedValue(Object.assign(new Error("Refused to compile: 'unsafe-eval' or 'wasm-unsafe-eval' is not allowed"), { name: "CompileError" }));
    const rows = await diagnoseCamera();
    const wasm = row(rows, "อนุญาต WebAssembly");
    expect(wasm.ok).toBe(false);
    expect(wasm.detail).toContain("CSP");
    // and the reader can't start, which is what the teacher would otherwise experience as "the camera does nothing"
    expect(row(rows, "เริ่มตัวอ่าน QR").ok).toBe(false);
  });

  it("a failed reader load isn't remembered: once the cause is fixed, the next try works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
    const spy = vi.spyOn(WebAssembly, "compile").mockRejectedValue(new Error("blocked"));
    const bad = await diagnoseCamera();
    expect(row(bad, "เริ่มตัวอ่าน QR").ok).toBe(false);
    spy.mockRestore();
    const good = await diagnoseCamera();
    expect(row(good, "อนุญาต WebAssembly").ok).toBe(true);
    expect(row(good, "เริ่มตัวอ่าน QR").ok).toBe(true);
  });

  it("reports a missing reader file and an unavailable camera API instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const rows = await diagnoseCamera();
    expect(row(rows, "zxing_reader.wasm").ok).toBe(false);
    expect(row(rows, "zxing_reader.wasm").detail).toContain("404");
    expect(row(rows, "เบราว์เซอร์รองรับกล้อง").ok).toBe(false); // jsdom has no getUserMedia
  });
});
