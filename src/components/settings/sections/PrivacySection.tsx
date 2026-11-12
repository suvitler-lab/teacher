// Settings > ความเป็นส่วนตัวและเสียง (T-55, AC-235, AC-236, BR-51, BR-52, D44).
// Every hide-names row reads and writes the SAME value as the switch on its page (lib/hideNames.ts); "เปิดทั้งหมด"
// changes the 7 values together. The projector screen has its own switch (lib/projector.ts) and is never changed by them.
import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { Segmented } from "../../ui";
import type { Settings } from "@shared/types";
import { HIDE_PAGES, hideSignal, setHide, setHideAll, type HidePage } from "../../../lib/hideNames";
import { pjHideNames, pjTheme, pjSize, setPjHideNames, setPjTheme, setPjSize, type PjTheme, type PjSize } from "../../../lib/projector";
import { getRandomTick, setRandomTick } from "../../../lib/sound";
import { Row, SwitchRow, NeedOnline, useOffline } from "./shared";

export const HIDE_LABEL: Record<HidePage, string> = {
  home: "หน้าหลัก", scan: "สแกน", attendance: "เช็คชื่อ", random: "สุ่มชื่อ", gradebook: "คะแนน", reports: "รายงาน", students: "นักเรียน",
};

type SaveNow = (k: "sound_enabled" | "accept_student_code_scan", v: boolean, label: string) => void;

export function PrivacySection({ cur, saveNow }: { cur: Settings; saveNow: SaveNow }) {
  const offline = useOffline();
  const [tick, setTick] = useState(getRandomTick);
  const on = HIDE_PAGES.filter((p) => hideSignal(p).value); // reading .value here makes the card follow every change
  const all = on.length === HIDE_PAGES.length;
  return (
    <>
      <section class="card" aria-labelledby="pv-h">
        <h2 id="pv-h" class="set-section-title"><Icon name="eye-off" /> ซ่อนชื่อนักเรียน</h2>
        <p class="page-sub pv-lead">ใช้เมื่อฉายหน้าจอขึ้นทีวี — หน้าที่ซ่อนจะแสดงเลขที่แทนชื่อ · แต่ละหน้าจำค่าของตัวเอง และสวิตช์บนหน้านั้นก็แก้ค่าเดียวกันนี้</p>
        <div class="set-row pv-all">
          <div class="set-l">
            <div class="set-label">ซ่อนชื่ออยู่ <span role="status" aria-live="polite">{on.length} จาก {HIDE_PAGES.length} หน้า</span></div>
            <div class="page-sub">เครื่องนี้เท่านั้น · ไม่ซิงก์ไปเครื่องอื่น · บันทึกทันที · ไม่แตะสวิตช์ของจอฉาย</div>
          </div>
          <div class="set-r">
            <button class={all ? "" : "primary"} onClick={() => setHideAll(!all)} aria-label={all ? "ปิดทั้งหมด — แสดงชื่อทั้ง 7 หน้า" : "เปิดทั้งหมด — ซ่อนชื่อทั้ง 7 หน้า"}>
              <Icon name={all ? "eye" : "eye-off"} size={20} /> {all ? "ปิดทั้งหมด" : "เปิดทั้งหมด"}
            </button>
          </div>
        </div>
        {HIDE_PAGES.map((p) => (
          <Row key={p} label={`ซ่อนชื่อ: ${HIDE_LABEL[p]}`} scope="device">
            <SwitchRow on={hideSignal(p).value} onToggle={() => setHide(p, !hideSignal(p).value)} label={`ซ่อนชื่อ: ${HIDE_LABEL[p]}`} />
          </Row>
        ))}
      </section>

      <section class="card" aria-labelledby="pv-pj">
        <h2 id="pv-pj" class="set-section-title"><Icon name="presentation" /> โหมดฉายจอ</h2>
        <p class="page-sub pv-lead">ค่านี้ใช้กับจอที่ฉายเท่านั้น — จอฉายทำตามสวิตช์นี้ ไม่ตามปุ่มซ่อนชื่อของแต่ละหน้า</p>
        <Row label="ซ่อนชื่อเด็กบนจอฉาย" hint="จอฉายแสดงเลขที่แทนชื่อ" scope="device" mode="now">
          <SwitchRow on={pjHideNames.value} onToggle={() => setPjHideNames(!pjHideNames.value)} label="ซ่อนชื่อเด็กบนจอฉาย" />
        </Row>
        <Row label="ธีมจอฉาย" scope="device" mode="now">
          <Segmented<PjTheme> label="ธีมจอฉาย" value={pjTheme.value} onChange={setPjTheme} options={[{ value: "dark", label: "เข้ม" }, { value: "light", label: "สว่าง" }]} />
        </Row>
        <Row label="ขนาดตัวอักษรจอฉาย" scope="device" mode="now">
          <Segmented<string> label="ขนาดตัวอักษรจอฉาย" value={String(pjSize.value)} onChange={(v) => setPjSize(Number(v) as PjSize)}
            options={[{ value: "1", label: "มาตรฐาน" }, { value: "2", label: "ใหญ่" }, { value: "3", label: "ใหญ่มาก" }]} />
        </Row>
      </section>

      <section class="card" aria-labelledby="pv-snd">
        <h2 id="pv-snd" class="set-section-title"><Icon name="bell-ringing" /> เสียง</h2>
        <Row label="เสียงตอบรับสแกน" hint="ติ๊ด/ตื๊ดตอนสแกน · ค่าเดียวกับหมวดการสแกน" scope="all" mode="now">
          {/* a synced value is written to the server: with no network the switch waits (D38) */}
          <fieldset class="pv-inline" disabled={offline}>
            <SwitchRow on={cur.sound_enabled} onToggle={() => saveNow("sound_enabled", !cur.sound_enabled, "เสียงตอบรับ")} label="เสียงตอบรับสแกน" />
          </fieldset>
          {offline && <NeedOnline />}
        </Row>
        <Row label={'เสียง "ติ๊ง" ตอนสุ่มได้ชื่อ'} hint="เล่นที่หน้าสุ่มชื่อ · ถ้าปิดเสียงตอบรับสแกนด้านบน จะไม่มีเสียงเลย" scope="device" mode="now">
          <SwitchRow on={tick} onToggle={() => { const v = !tick; setRandomTick(v); setTick(v); }} label={'เสียง "ติ๊ง" ตอนสุ่มได้ชื่อ'} />
        </Row>
      </section>
    </>
  );
}
