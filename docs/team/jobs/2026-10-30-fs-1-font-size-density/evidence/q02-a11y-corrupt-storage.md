# a11y + corrupt localStorage (final code, 390 touch)
- Settings: buttons have aria-label: "ลดขนาดตัวอักษร" (68x56), "เพิ่มขนาดตัวอักษร" (68x56), "ใช้ขนาดค่าเริ่มต้น 18" (122x56). PASS (>=56px)
- Keyboard focus (Tab): :focus-visible true, outline auto 1px rgb(229,151,0). Visible but thin (1px declared; browser draws auto ring). Programmatic focus() shows none (expected).
- ngankrob-font-size = "abc"(+density "zzz"), "99", "-1", "" -> after reload html font-size 18px (touch default), data-density normal, app rendered (body text length 866), no crash. PASS
- Not run in browser: "13","25","18.5" (covered by test/unit/qa-fs-1.test.ts).
