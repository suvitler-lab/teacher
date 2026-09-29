import { describe, it, expect } from "vitest";
import { parseImport } from "@client/lib/importParse";

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
});
