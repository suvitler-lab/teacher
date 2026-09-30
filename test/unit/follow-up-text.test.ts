import { describe, it, expect } from "vitest";
import { followUpText } from "@client/lib/report";

describe("followUpText (the LINE message)", () => {
  it("names each piece of work a child still owes, including when there are two", () => {
    const text = followUpText(
      [
        { student: { number: 4, first_name: "กันตพงศ์" }, missing: ["เศษส่วน"] },
        { student: { number: 5, first_name: "ธนิษฐา" }, missing: ["เศษส่วน", "ร้อยละ"] },
      ],
      "ป.6/1 ",
      "1 ต.ค. 2569",
    );
    expect(text).toBe(
      ["รายชื่อนักเรียนค้างส่งงาน ป.6/1", "(ข้อมูล ณ 1 ต.ค. 2569)", "4. กันตพงศ์: ค้าง 1 งาน (เศษส่วน)", "5. ธนิษฐา: ค้าง 2 งาน (เศษส่วน, ร้อยละ)"].join("\n"),
    );
  });
});
