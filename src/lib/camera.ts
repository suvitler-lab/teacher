// Camera QR/barcode scanning. Uses the native BarcodeDetector when present
// (Android Chrome), else the zxing-wasm ponyfill with a locally-hosted wasm
// (so it works offline and under a strict connect-src CSP).
//
// Nothing here fails silently: every way the camera can not work is turned into a CameraError with a
// reason the teacher can act on (and `diagnoseCamera()` lists them all at once for the Settings test button).

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

const FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "ean_8"] as const;
const WASM_URL = "/zxing/zxing_reader.wasm";

export type CameraProblem =
  | "insecure"    // not https (or localhost): browsers hide the camera entirely
  | "unsupported" // no mediaDevices at all
  | "permission"  // the teacher (or the OS) said no
  | "no_camera"   // no camera / none matches
  | "busy"        // another app holds the camera
  | "reader"      // the QR reader itself could not start (wasm blocked / file missing)
  | "unknown";

export class CameraError extends Error {
  kind: CameraProblem;
  constructor(kind: CameraProblem, detail?: string) {
    super(detail || kind);
    this.kind = kind;
  }
}

const EXPLAIN: Record<CameraProblem, { title: string; hint: string }> = {
  insecure: { title: "เปิดกล้องไม่ได้ — หน้านี้ไม่ได้เปิดผ่าน HTTPS", hint: "เปิดแอปจากลิงก์ https:// ที่ deploy ไว้ (เปิดด้วยที่อยู่ในวงแลนจะใช้กล้องไม่ได้)" },
  unsupported: { title: "เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง", hint: "ลองใช้ Safari (iPad/iPhone) หรือ Chrome (Android) รุ่นล่าสุด — หรือใช้เครื่องยิง/พิมพ์เลขที่แทน" },
  permission: { title: "ยังไม่ได้รับอนุญาตให้ใช้กล้อง", hint: "ตั้งค่าเครื่อง › เบราว์เซอร์/แอปนี้ › กล้อง → อนุญาต แล้วกดปุ่มกล้องอีกครั้ง" },
  no_camera: { title: "ไม่พบกล้องในเครื่องนี้", hint: "ถ้าใช้คอมพิวเตอร์ ให้ต่อกล้องเว็บแคม หรือใช้เครื่องยิง/พิมพ์เลขที่แทน" },
  busy: { title: "กล้องถูกใช้อยู่โดยแอปอื่น", hint: "ปิดแอปที่ใช้กล้อง (วิดีโอคอล ฯลฯ) แล้วกดปุ่มกล้องอีกครั้ง" },
  reader: { title: "ตัวอ่าน QR โหลดไม่สำเร็จ", hint: "ต่อเน็ตแล้วโหลดหน้าใหม่ หากยังเป็นอีกให้ไปที่ ตั้งค่า › การสแกน › ทดสอบกล้อง เพื่อดูสาเหตุ" },
  unknown: { title: "เปิดกล้องไม่สำเร็จ", hint: "ลองกดปุ่มกล้องอีกครั้ง หรือดูสาเหตุที่ ตั้งค่า › การสแกน › ทดสอบกล้อง" },
};

/** Thai text for the teacher: what went wrong, and what to do about it. */
export function explainCamera(e: unknown): { kind: CameraProblem; title: string; hint: string } {
  const kind = classify(e);
  return { kind, ...EXPLAIN[kind] };
}

function classify(e: unknown): CameraProblem {
  if (e instanceof CameraError) return e.kind;
  const name = (e as any)?.name as string | undefined;
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no_camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name === "SecurityError") return "insecure";
  return "unknown";
}

// ---- the reader -----------------------------------------------------------------------------
export type ReaderKind = "native" | "wasm";
let detectorPromise: Promise<{ detector: Detector; kind: ReaderKind }> | null = null;

async function getDetector(): Promise<{ detector: Detector; kind: ReaderKind }> {
  if (detectorPromise) return detectorPromise;
  const p = (async () => {
    const Native = (globalThis as any).BarcodeDetector;
    if (Native) {
      try {
        const supported: string[] = await Native.getSupportedFormats();
        const fmts = FORMATS.filter((f) => supported.includes(f));
        if (fmts.length) return { detector: new Native({ formats: fmts }) as Detector, kind: "native" as const };
      } catch {
        /* fall through to ponyfill */
      }
    }
    try {
      // a strict Content-Security-Policy refuses WebAssembly unless it says 'wasm-unsafe-eval' — say so plainly
      await assertWasmAllowed();
      const mod = await import("barcode-detector/pure");
      mod.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_URL : prefix + path),
      });
      return { detector: new mod.BarcodeDetector({ formats: [...FORMATS] }) as Detector, kind: "wasm" as const };
    } catch (e) {
      throw new CameraError("reader", (e as Error)?.message);
    }
  })();
  detectorPromise = p;
  // a failure must not be remembered: fixing the network and pressing the button again has to be able to work
  p.catch(() => { if (detectorPromise === p) detectorPromise = null; });
  return p;
}

/** Throws if this page's security policy forbids compiling WebAssembly (the smallest valid module). */
async function assertWasmAllowed() {
  if (typeof WebAssembly === "undefined") throw new Error("WebAssembly ไม่มีในเบราว์เซอร์นี้");
  await WebAssembly.compile(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
}

// ---- camera ---------------------------------------------------------------------------------
export interface CameraController {
  stop(): void;
  toggleTorch(): Promise<boolean>;
  switchCamera(): Promise<void>;
  hasTorch(): boolean;
}

export async function startCamera(
  video: HTMLVideoElement,
  onDetect: (raw: string) => void,
  opts: { dedupeMs?: number; onError?: (e: CameraError) => void } = {},
): Promise<CameraController> {
  const dedupeMs = opts.dedupeMs ?? 2500;
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new CameraError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
  const { detector } = await getDetector();

  let devices: MediaDeviceInfo[] = [];
  let deviceIndex = 0;
  let stream: MediaStream | null = null;
  let raf = 0;
  let stopped = false;
  let lastRaw = "";
  let lastTime = 0;
  let torchOn = false;
  let failures = 0;

  async function openStream(constraints: MediaStreamConstraints) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      throw new CameraError(classify(e), (e as Error)?.message);
    }
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play().catch(() => {});
  }

  await openStream({ video: { facingMode: { ideal: "environment" } }, audio: false });
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch {
    devices = [];
  }

  function track(): MediaStreamTrack | null {
    return stream?.getVideoTracks()[0] ?? null;
  }

  function loop() {
    if (stopped) return;
    if (video.readyState >= 2) {
      detector
        .detect(video)
        .then((codes) => {
          failures = 0;
          if (stopped || !codes.length) return;
          const raw = codes[0].rawValue;
          const now = performance.now();
          if (raw === lastRaw && now - lastTime < dedupeMs) return;
          lastRaw = raw;
          lastTime = now;
          onDetect(raw);
        })
        .catch((e) => {
          // one bad frame is normal; a reader that fails every frame is not — say so once instead of looking "on" but blind
          if (++failures === 30 && !stopped) opts.onError?.(new CameraError("reader", (e as Error)?.message));
        });
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    },
    hasTorch() {
      const t = track();
      return !!(t && (t.getCapabilities?.() as any)?.torch);
    },
    async toggleTorch() {
      const t = track();
      if (!t) return false;
      try {
        torchOn = !torchOn;
        await t.applyConstraints({ advanced: [{ torch: torchOn } as any] });
        return torchOn;
      } catch {
        return false;
      }
    },
    async switchCamera() {
      if (devices.length < 2) return;
      deviceIndex = (deviceIndex + 1) % devices.length;
      lastRaw = "";
      await openStream({ video: { deviceId: { exact: devices[deviceIndex].deviceId } }, audio: false });
    },
  };
}

// ---- the Settings "test the camera" button --------------------------------------------------
export interface CameraCheck { label: string; ok: boolean; detail: string }

/**
 * Walks every step the scanner needs and reports each one — so a teacher can open this on the iPad and read
 * out what is wrong instead of us guessing. Opens the camera for an instant (to prove it works) and stops it.
 */
export async function diagnoseCamera(): Promise<CameraCheck[]> {
  const out: CameraCheck[] = [];
  const add = (label: string, ok: boolean, detail: string) => out.push({ label, ok, detail });

  add("เปิดผ่าน HTTPS", window.isSecureContext !== false, window.isSecureContext !== false ? location.protocol + "//" + location.host : "ไม่ใช่ HTTPS — เบราว์เซอร์จะซ่อนกล้อง");
  const hasMedia = !!navigator.mediaDevices?.getUserMedia;
  add("เบราว์เซอร์รองรับกล้อง", hasMedia, hasMedia ? "มี getUserMedia" : "ไม่มี — ใช้กล้องในเบราว์เซอร์นี้ไม่ได้");

  try {
    const st = await (navigator as any).permissions?.query?.({ name: "camera" });
    if (st) add("สิทธิ์ใช้กล้อง", st.state !== "denied", st.state === "granted" ? "อนุญาตแล้ว" : st.state === "prompt" ? "ยังไม่ได้ถาม (จะถามตอนเปิดกล้อง)" : "ถูกปฏิเสธ — ต้องอนุญาตในตั้งค่าเครื่อง");
  } catch { /* Safari does not expose this: the open-camera step below tells the truth */ }

  // The device's own reader is a bonus, never a requirement: iPad/iPhone Safari does not have one and everything works through
  // the fallback below. So its absence is reported as information, not as a failed step (a red ✘ here made a working iPad look broken).
  const native = (globalThis as any).BarcodeDetector;
  let nativeOk = false;
  if (native) {
    try {
      const f: string[] = await native.getSupportedFormats();
      nativeOk = f.includes("qr_code");
      add("ตัวอ่านของเครื่อง (BarcodeDetector)", true, nativeOk ? "ใช้ได้ — อ่าน QR: " + f.filter((x) => (FORMATS as readonly string[]).includes(x)).join(", ") : "มี แต่ไม่รองรับ QR — ใช้ตัวอ่านสำรอง (WASM) แทน (ไม่ใช่ปัญหา)");
    } catch (e) { add("ตัวอ่านของเครื่อง (BarcodeDetector)", true, "ตรวจไม่ได้ (" + (e as Error).message + ") — ใช้ตัวอ่านสำรอง (WASM) แทน (ไม่ใช่ปัญหา)"); }
  } else {
    add("ตัวอ่านของเครื่อง (BarcodeDetector)", true, "เครื่องนี้ไม่มี (Safari/iPad ปกติไม่มี) — ใช้ตัวอ่านสำรอง (WASM) แทน ซึ่งเป็นเรื่องปกติ");
  }

  // the fallback reader is what iPad depends on: prove each part of it
  try { await assertWasmAllowed(); add("ตัวอ่านสำรอง: อนุญาต WebAssembly", true, "ผ่านนโยบายความปลอดภัยของหน้านี้"); }
  catch (e) { add("ตัวอ่านสำรอง: อนุญาต WebAssembly", false, "ถูกนโยบายความปลอดภัย (CSP) บล็อก — " + (e as Error).message); }
  try {
    const r = await fetch(WASM_URL, { method: "HEAD", cache: "no-store" });
    add("ตัวอ่านสำรอง: ไฟล์ zxing_reader.wasm", r.ok, r.ok ? "พร้อมใช้ (โหลดจากเซิร์ฟเวอร์ตัวเอง)" : "โหลดไม่ได้ (HTTP " + r.status + ")");
  } catch (e) { add("ตัวอ่านสำรอง: ไฟล์ zxing_reader.wasm", false, "ออฟไลน์หรือเข้าไม่ถึง — " + (e as Error).message); }
  if (!nativeOk) {
    try { const { kind } = await getDetector(); add("เริ่มตัวอ่าน QR", true, kind === "wasm" ? "ตัวอ่านสำรอง (WASM) พร้อมใช้งาน" : "ตัวอ่านของเครื่องพร้อมใช้งาน"); }
    catch (e) { add("เริ่มตัวอ่าน QR", false, (e as Error).message); }
  }

  if (hasMedia && window.isSecureContext !== false) {
    let s: MediaStream | null = null;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const t = s.getVideoTracks()[0];
      const set = t?.getSettings?.() ?? {};
      add("เปิดกล้อง", true, `${t?.label || "กล้อง"}${set.width ? ` · ${set.width}×${set.height}` : ""}`);
    } catch (e) {
      const x = explainCamera(e);
      add("เปิดกล้อง", false, `${x.title} — ${x.hint}`);
    } finally { s?.getTracks().forEach((t) => t.stop()); }
  }
  return out;
}
