// S9-ก (clear the term) and S9-ค (replace the table when copying): a question that names what will happen; the dangerous
// button says it in words. "ไม่" keeps everything. While working the buttons are off; a failure keeps the box open.
import { useRef, useState } from "preact/hooks";
import { Dialog } from "../Dialog";
import { MSG } from "../../lib/timetable/messages";

export function ConfirmBox(p: { text: string; no: string; yes: string; busyText: string; run: () => Promise<{ ok: boolean; message?: string }>; onClose: (done: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const going = useRef(false);
  const go = async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    setFail(null);
    const r = await p.run();
    going.current = false;
    setBusy(false);
    if (r.ok) p.onClose(true);
    else setFail(r.message || MSG.saveFailed);
  };
  return (
    <div class="modal-overlay tts-ov tts-ov-confirm" onClick={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(false); }}>
      <Dialog role="alertdialog" label={p.text} onClose={() => { if (!busy) p.onClose(false); }} class="modal tts-confirm">
        <p class="tts-csum">{p.text}</p>
        {fail && <p class="tts-err" role="alert">{fail}</p>}
        <div class="tts-cfoot">
          <button type="button" data-autofocus disabled={busy} onClick={() => p.onClose(false)}>{p.no}</button>
          <button type="button" class="danger" disabled={busy} onClick={go}>{busy ? p.busyText : p.yes}</button>
        </div>
      </Dialog>
    </div>
  );
}
