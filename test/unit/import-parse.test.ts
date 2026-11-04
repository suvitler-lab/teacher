import { describe, it, expect } from "vitest";
import { parseImport, studentFormErrors } from "@client/lib/importParse";

describe("parseImport", () => {
  it("reads the format shown in the placeholder: code, one cell with prefix + name + surname, number", () => {
    const { rows, skipped } = parseImport("10501\tด.ช. ภูมิพัฒน์ ใจดี\t1\n10502\tด.ญ. ปุณยวีร์ แสงทอง\t2");
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { code: "10501", prefix: "ด.ช.", first_name: "ภูมิพัฒน์", last_name: "ใจดี", number: 1 },
      { code: "10502", prefix: "ด.ญ.", first_name: "ปุณยวีร์", last_name: "แสงทอง", number: 2 },
    ]);
  });

  it("reads Excel columns pasted as separate cells (tabs)", () => {
    const { rows } = parseImport("10503\tเด็กชาย\tสมชาย\tรักเรียน\t3");
    expect(rows[0]).toEqual({ code: "10503", prefix: "เด็กชาย", first_name: "สมชาย", last_name: "รักเรียน", number: 3 });
  });

  it("ignores a trailing column that repeats the student ID", () => {
    const { rows } = parseImport("13451\tเด็กชาย\tธนพัชญ์\tสมศรีแสง\t13451");
    expect(rows[0]).toEqual({ code: "13451", prefix: "เด็กชาย", first_name: "ธนพัชญ์", last_name: "สมศรีแสง", number: null });
  });

  it("reads commas, and a row with no number", () => {
    const { rows } = parseImport("10504,ด.ช.,สมศักดิ์,ดีมาก");
    expect(rows[0]).toMatchObject({ code: "10504", first_name: "สมศักดิ์", last_name: "ดีมาก", number: null });
  });

  it("reports lines it can't read instead of dropping them", () => {
    const { rows, skipped } = parseImport("10505\tด.ช. เอ บี\t5\nสวัสดี ไม่ใช่รายการ\n12 ชื่อไม่มีรหัส");
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual(["สวัสดี ไม่ใช่รายการ", "12 ชื่อไม่มีรหัส"]);
  });

  it("ignores blank lines", () => {
    expect(parseImport("\n\n  \n").rows).toEqual([]);
  });

  describe("CSV exported by Excel (RFC 4180 quoting)", () => {
    it("a quoted cell with a comma inside gives prefix, first and last name with no quote characters left", () => {
      const { rows, skipped } = parseImport('50002,"ด.ญ. สมหญิง, รักเรียน",2');
      expect(skipped).toEqual([]);
      expect(rows).toEqual([{ code: "50002", prefix: "ด.ญ.", first_name: "สมหญิง", last_name: "รักเรียน", number: 2 }]);
      expect(rows[0].first_name + rows[0].last_name + rows[0].prefix).not.toContain('"');
    });
    it("quoted cells may hold tabs and line breaks, and a doubled quote is one quote", () => {
      const { rows } = parseImport('10601,"ด.ช.\tเอก\nภพ","ใจ""ดี""",4\r\n10602,ด.ญ.,บี,ซี,5\r\n');
      expect(rows.map((r) => [r.code, r.prefix, r.first_name, r.last_name, r.number])).toEqual([
        ["10601", "ด.ช.", "เอก", 'ภพ ใจ"ดี"', 4],
        ["10602", "ด.ญ.", "บี", "ซี", 5],
      ]);
    });
    it("every cell quoted, as Excel can write them", () => {
      const { rows } = parseImport('"10501","ด.ช.","สมชาย","ใจดี","1"');
      expect(rows).toEqual([{ code: "10501", prefix: "ด.ช.", first_name: "สมชาย", last_name: "ใจดี", number: 1 }]);
    });
    it("an opening quote that never closes does not swallow the rest of the list", () => {
      const { rows } = parseImport('10501\t"ด.ช. สมชาย ใจดี\t1\n10502\tด.ญ. สมหญิง รักเรียน\t2');
      expect(rows.map((r) => r.code)).toEqual(["10501", "10502"]);
    });
    it("tab-separated and pasted text without quotes read exactly as before", () => {
      expect(parseImport("10501\tด.ช. ภูมิพัฒน์ ใจดี\t1").rows[0]).toEqual({ code: "10501", prefix: "ด.ช.", first_name: "ภูมิพัฒน์", last_name: "ใจดี", number: 1 });
      expect(parseImport("10501 ด.ช. ภูมิพัฒน์ ใจดี 1").rows[0]).toMatchObject({ first_name: "ภูมิพัฒน์", last_name: "ใจดี", number: 1 });
    });
  });

  describe("student codes (B-A3)", () => {
    it("accepts letters+digits codes, like the add form", () => {
      const { rows, skipped } = parseImport("P001\tด.ช. สมชาย ใจดี\t1\nS002,ด.ญ.,สมหญิง,รักเรียน,2");
      expect(skipped).toEqual([]);
      expect(rows.map((r) => r.code)).toEqual(["P001", "S002"]);
    });
    it("a code shorter than 3 characters is not a code; an English first name is not mistaken for one", () => {
      expect(parseImport("P1\tด.ช. สมชาย ใจดี\t1").skipped).toHaveLength(1);
      expect(parseImport("John Smith 5").rows).toHaveLength(0);
    });
    it("a repeated copy of the code in another column is ignored", () => {
      expect(parseImport("P001\tด.ช.\tสมชาย\tใจดี\tP001").rows[0]).toMatchObject({ code: "P001", last_name: "ใจดี", number: null });
    });
  });

  describe("rows that need a warning (B-A4 / B-A6)", () => {
    it("a row with no last name is not imported and is listed", () => {
      const r = parseImport("10501\tด.ช. สมชาย ใจดี\t1\n10502\tด.ช. เด็กไม่มีสกุล\t2\n10503\tด.ญ. สมหญิง");
      expect(r.rows.map((x) => x.code)).toEqual(["10501"]);
      expect(r.noLastName).toEqual(["10502\tด.ช. เด็กไม่มีสกุล\t2", "10503\tด.ญ. สมหญิง"]);
    });
    it("a negative, decimal or zero class number is flagged, kept out of the surname, and left empty", () => {
      const r = parseImport("10501\tด.ช. สมชาย ทดสอบ -3\n10502\tด.ช. สมศักดิ์ ทดสอบ 2.5\n10503\tด.ช. สมปอง ทดสอบ 0\n10504\tด.ช. สมใจ ทดสอบ 7");
      expect(r.rows.map((x) => [x.last_name, x.number])).toEqual([["ทดสอบ", null], ["ทดสอบ", null], ["ทดสอบ", null], ["ทดสอบ", 7]]);
      expect(r.badNumber).toEqual([{ code: "10501", text: "-3" }, { code: "10502", text: "2.5" }, { code: "10503", text: "0" }]);
    });
  });
});

describe("studentFormErrors (B-A1)", () => {
  const ok = { code: "10501", first_name: "สมชาย", last_name: "ใจดี", number: 1 as number | "" };
  it("passes a complete form, with an empty number", () => {
    expect(studentFormErrors(ok)).toEqual({});
    expect(studentFormErrors({ ...ok, number: "" })).toEqual({});
  });
  it("requires name, last name and code, trimmed", () => {
    const e = studentFormErrors({ code: "  ", first_name: " ", last_name: "\t", number: "" });
    expect(Object.keys(e).sort()).toEqual(["code", "first_name", "last_name"]);
    expect(e.last_name).toBe("กรอกสกุล");
  });
  it("the number must be a whole number from 1", () => {
    for (const n of [0, -5, 2.5]) expect(studentFormErrors({ ...ok, number: n }).number).toMatch(/จำนวนเต็ม/);
  });
  it("a new code follows the import rule; an old code left alone is not re-judged", () => {
    expect(studentFormErrors({ ...ok, code: "P001" })).toEqual({});
    expect(studentFormErrors({ ...ok, code: "12" }).code).toMatch(/3 ตัว/);
    expect(studentFormErrors({ ...ok, code: "12" }, "12")).toEqual({});
    expect(studentFormErrors({ ...ok, code: "12" }, "99").code).toBeTruthy();
  });
});
