// QA gb-1b: expected values computed BY HAND from the business rules (metrics.ts header + BR in brief), not from the code.
// Claim: hiding column types is display only. สะสม and group totals must equal the "show everything" values.
import { describe, it, expect } from "vitest";
import { studentSummary, groupScoreTotal } from "../../shared/metrics";
import { makeIsShown, displayGroups, effectiveHidden, toggleType, DEFAULT_COLUMN_PREFS, loadColumnPrefs, columnCounts, COLUMNS_STORAGE_KEY } from "../../src/lib/gbColumns";

const TODAY = "2026-10-30";
interface W { id: string; type_id: string | null; full_score: number; due_date: string | null }
// 14 works, 4 types: P(ใบงาน) 4, Q(แบบฝึกหัด) 4, R(สอบย่อย) 3, S(โครงงาน) 3
const works: W[] = [
  { id: "w01", type_id: "P", full_score: 10, due_date: "2026-10-01" },
  { id: "w02", type_id: "P", full_score: 10, due_date: "2026-10-02" },
  { id: "w03", type_id: "P", full_score: 20, due_date: "2026-10-03" },
  { id: "w04", type_id: "P", full_score: 10, due_date: "2026-10-04" },
  { id: "w05", type_id: "Q", full_score: 10, due_date: "2026-10-05" },
  { id: "w06", type_id: "Q", full_score: 5, due_date: "2026-10-06" },
  { id: "w07", type_id: "Q", full_score: 10, due_date: "2026-10-07" },
  { id: "w08", type_id: "Q", full_score: 10, due_date: "2026-12-01" },
  { id: "w09", type_id: "R", full_score: 20, due_date: "2026-10-09" },
  { id: "w10", type_id: "R", full_score: 20, due_date: "2026-10-10" },
  { id: "w11", type_id: "R", full_score: 10, due_date: null },
  { id: "w12", type_id: "S", full_score: 30, due_date: "2026-10-12" },
  { id: "w13", type_id: "S", full_score: 10, due_date: "2026-10-13" },
  { id: "w14", type_id: null, full_score: 10, due_date: "2026-10-14" },
];
type Sub = { status: string; score: number | null; late?: boolean } | undefined;
// one student: 7.5 (scored), 0 (submitted score 0), excused, empty(missing), late 10, awaiting, pending(future), ...
const subs: Record<string, Sub> = {
  w01: { status: "submitted", score: 7.5 },          // +7.5 /10
  w02: { status: "submitted", score: 0 },            // +0 /10
  w03: { status: "excused", score: null },           // excluded
  w04: undefined,                                    // past due, empty -> missing, +0 /10
  w05: { status: "submitted", score: 10, late: true }, // late counts: +10 /10
  w06: { status: "submitted", score: null },         // awaiting: excluded
  w07: { status: "void", score: null },              // past due -> missing +0 /10
  w08: undefined,                                    // due Dec -> pending, excluded
  w09: { status: "submitted", score: 12.5 },         // +12.5 /20
  w10: { status: "excused", score: null },           // excluded
  w11: undefined,                                    // no due date -> pending, excluded
  w12: { status: "submitted", score: 30 },           // +30 /30
  w13: undefined,                                    // missing +0 /10
  w14: { status: "submitted", score: 4 },            // +4 /10
};
const subFor = (list: W[]) => (i: number) => subs[list[i].id];

// Hand calculation (full list):
//  score = 7.5+0+10+12.5+30+4 = 64 ; full = w01 10 + w02 10 + w04 10 + w05 10 + w07 10 + w09 20 + w12 30 + w13 10 + w14 10 = 120
const EXPECT_ALL = { score: 64, fullScore: 120 };
// Per group (by type, hand): P: 7.5+0 /(10+10+10)=7.5/30 ; Q: 10 /(10+10)=10/20 ; R: 12.5/20 ; S: 30/(30+10)=30/40 ; none: 4/10
const EXPECT_GROUP: Record<string, { score: number; fullScore: number }> = {
  P: { score: 7.5, fullScore: 30 }, Q: { score: 10, fullScore: 20 }, R: { score: 12.5, fullScore: 20 }, S: { score: 30, fullScore: 40 }, "": { score: 4, fullScore: 10 },
};
const keyOf = (a: W) => a.type_id ?? "";
const groupsFull = () => ["P", "Q", "R", "S", ""].map((k) => ({ key: k, label: k, color: "#000", items: works.filter((w) => keyOf(w) === k) }));
const present = ["P", "Q", "R", "S", ""];

describe("gb-1b hiding columns never changes สะสม / รวมกลุ่ม (QA, hand-computed)", () => {
  it("baseline: สะสม over all work = 64/120", () => {
    const s = studentSummary(works, subFor(works), TODAY);
    expect(s.score).toBe(EXPECT_ALL.score);
    expect(s.fullScore).toBe(EXPECT_ALL.fullScore);
    expect(s.scorePercent).toBe(53); // 64*100/120 = 53.33 -> 53
  });

  const hideCases: string[][] = [["P"], ["Q"], ["R", "S"], ["P", "Q", "R"], [""], ["P", "Q", "R", "S"]];
  for (const hid of hideCases) {
    it(`hide ${JSON.stringify(hid)}: สะสม and every group total equal the show-all values`, () => {
      const prefs = { ...DEFAULT_COLUMN_PREFS, hiddenTypes: hid };
      const hidden = effectiveHidden(prefs, present);
      const isShown = makeIsShown<W>(hidden);
      const dg = displayGroups(groupsFull(), isShown);
      // the app passes full work to สะสม (visibleWork) and group.items (full) to group totals; verify full items stay intact
      for (const { group } of dg) expect(group.items.length).toBe(works.filter((w) => keyOf(w) === group.key).length);
      const s = studentSummary(works, subFor(works), TODAY);
      expect({ score: s.score, fullScore: s.fullScore }).toEqual(EXPECT_ALL);
      for (const { group } of dg) {
        const t = groupScoreTotal(group.items, subFor(group.items), TODAY);
        expect(t).toEqual(EXPECT_GROUP[group.key]);
      }
    });
  }

  it("negative control: computing สะสม from shown columns only WOULD differ (so the test can detect the bug)", () => {
    const shown = works.filter((w) => w.type_id !== "P");
    const s = studentSummary(shown, (i) => subs[shown[i].id], TODAY);
    expect(s.score).toBe(56.5); // 64 - 7.5
    expect(s.fullScore).toBe(90); // 120 - 30
    expect(s.score).not.toBe(EXPECT_ALL.score);
  });

  it("group with only excused / awaiting / pending work shows null (dash), not 0", () => {
    const g = works.filter((w) => ["w03", "w06", "w08"].includes(w.id));
    expect(groupScoreTotal(g, subFor(g), TODAY)).toBeNull();
  });

  it("n/N counts: hiding P (4 of 14) -> 10/14; hiding everything falls back to all shown", () => {
    const h = effectiveHidden({ ...DEFAULT_COLUMN_PREFS, hiddenTypes: ["P"] }, present);
    expect(columnCounts(works, makeIsShown<W>(h))).toEqual({ shown: 10, total: 14 });
    const all = effectiveHidden({ ...DEFAULT_COLUMN_PREFS, hiddenTypes: present }, present);
    expect(columnCounts(works, makeIsShown<W>(all))).toEqual({ shown: 14, total: 14 });
  });

  it("cannot hide the last remaining type", () => {
    let p = { ...DEFAULT_COLUMN_PREFS };
    for (const k of ["P", "Q", "R"]) p = toggleType(p, k, present);
    const after = toggleType(p, "S", present); // would leave "" only? S and "" remain -> allowed once
    const final = toggleType(after, "", present); // now only one type left -> refused
    expect(columnCounts(works, makeIsShown<W>(effectiveHidden(final, present))).shown).toBeGreaterThan(0);
  });

  it("corrupt saved value -> show everything", () => {
    for (const raw of ["{not json", "[]", "null", '{"hiddenTypes":"P","showTotal":true,"showBars":true}', '{"hiddenTypes":[1],"showTotal":true,"showBars":true}', '{"hiddenTypes":[],"showTotal":"x","showBars":true}']) {
      const st = { getItem: (k: string) => (k === COLUMNS_STORAGE_KEY ? raw : null), setItem() {} };
      expect(loadColumnPrefs(st)).toEqual(DEFAULT_COLUMN_PREFS);
    }
    expect(loadColumnPrefs({ getItem() { throw new Error("denied"); }, setItem() {} })).toEqual(DEFAULT_COLUMN_PREFS);
  });
});
