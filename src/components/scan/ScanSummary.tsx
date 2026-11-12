import { Icon } from "../../components/Icon";
import { activeClasses, studentsById } from "../../store";
import type { Student } from "@shared/types";
import { failedCount } from "../../lib/outbox";
import { ProjectorShell } from "../../components/Projector";
import { pjHideNames, pjSize } from "../../lib/projector";
import { shortName } from "../../lib/names";
import { recent, feedback, activeAssignment, effSub, Session } from "./state";

export function ScanProjector({ s, classStudents, known }: { s: Session; classStudents: Student[]; known: boolean }) {
  const asg = activeAssignment.value;
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const last = recent.value[0] ? studentsById.value.get(recent.value[0].studentId) : null;
  const states = classStudents.map((st) => ({ st, sub: effSub(st.id) }));
  const done = states.filter((x) => x.sub?.status === "submitted").length;
  const excused = states.filter((x) => x.sub?.status === "excused").length;
  const total = classStudents.length - excused;
  // only "no student has this code" is said on the TV; a closed work, another room or a refused send is for the teacher's screen
  const unknown = feedback.value?.code === "unknown";
  const failed = failedCount.value;
  // 33+ children at the largest text: the second line of the card gives way so the whole class still fits one screen
  const compact = pjSize.value === 3 && total > 32;
  const nameOn = !pjHideNames.value;
  return (
    <ProjectorShell page="scan">
      <div class="pj-top">
        <div class={"pj-last" + (unknown ? " bad" : last ? " ok" : "")}>
          {unknown ? <><Icon name="alert-circle" size={72} /><div class="pj-lname">ไม่รู้จักรหัสนี้</div></>
            : last ? (
              <>
                <Icon name="check" size={72} />
                <div style="min-width:0">
                  <div class="pj-lname">{nameOn ? `น้อง${shortName(last)}` : `เลขที่ ${last.number ?? "-"}`}</div>
                  {!compact && <div class="s2">{nameOn ? `เลขที่ ${last.number ?? "-"} · ส่งแล้ว` : "ส่งแล้ว"}</div>}
                </div>
              </>
            )
            : <><Icon name="scan" size={72} /><div class="pj-lname dim">รอสแกน…</div></>}
        </div>
        <div class="pj-side">
          <div class="s2">{cls?.name} · {asg?.title}</div>
          <div class="stat">{known ? `ส่งแล้ว ${done} จาก ${total} คน` : "กำลังโหลด…"}</div>
          <div class="pbar"><div style={`width:${total ? Math.min(100, (done * 100) / total) : 0}%`} /></div>
          {failed > 0 && <div class="pj-fail"><Icon name="cloud-x" size={40} /><span>{failed}</span></div>}
        </div>
      </div>
      <div class="seatp" role="group" aria-label="ผังเลขที่">
        {states.map(({ st, sub }) => {
          const d = sub?.status === "submitted";
          return <div class={d ? "d" : ""}>{d && <Icon name="check" size={40} />}{st.number ?? "-"}</div>;
        })}
      </div>
    </ProjectorShell>
  );
}

/** Projector mode switched on from the picker, before a round exists: a calm waiting screen. */
export function ScanProjectorIdle() {
  return (
    <ProjectorShell page="scan">
      <div class="empty"><Icon name="scan" size={72} /><div>ยังไม่เริ่มรอบสแกน</div></div>
    </ProjectorShell>
  );
}
