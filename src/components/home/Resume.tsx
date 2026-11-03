import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { classById } from "../../store";
import { navigate } from "../../router";
import { kvGet } from "../../lib/idb";
import { dashboard } from "../../lib/dashboard";
import type { ScanMode } from "@shared/types";

interface Saved { assignmentId: string; classId: string; mode: ScanMode }
const MODE = { full: "ให้คะแนนเต็ม", type: "กรอกทีละคน", later: "รับงานก่อน" } as const;

/** "Continue the last scan round": one tap back into the round the scan page saved (it restores it by itself). */
export function ResumeScan() {
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => { kvGet<Saved>("scanSession").then((s) => setSaved(s ?? null), () => setSaved(null)); }, []);
  const a = saved && dashboard.value?.openAssignments.find((x) => x.assignment.id === saved.assignmentId);
  const cls = saved && classById(saved.classId);
  if (!saved || !a || !cls) return null; // the work was closed, or the round was ended
  return (
    <div class="hm-resume">
      <Icon name="player-play" size={20} />
      <span class="grow"><b>สแกนต่อจากรอบล่าสุด</b> · {a.assignment.title} · {cls.name} · {MODE[saved.mode] ?? ""}</span>
      <button class="primary" onClick={() => navigate("/scan")}>สแกนต่อ</button>
    </div>
  );
}
