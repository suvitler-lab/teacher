# dev-notes T-02/T-03 (CSS เท่านั้น)

- src/styles/grade.css: table.gb ได้ min-width:100%; คอลัมน์งาน/สะสมกลุ่ม ไม่มี width/max-width (เหลือ min-width 7.6rem) และเนื้อหาหัวคอลัมน์ไม่ดันความกว้าง (th.col-w > * {width:0;min-width:100%}) -> คอลัมน์งานเท่ากันและแบ่งที่ว่างเท่าๆ กัน; ชื่อคงตาม clamp; สะสมคง 5.2rem (max-width)
- src/styles/scan.css: ลบ breakpoint 721-999px (2 คอลัมน์); ต่ำกว่า 1000px เป็นคอลัมน์เดียว ลำดับ ช่องสแกน > การ์ดคะแนน > สถิติ+ผัง > สแกนล่าสุด; >=1000px ไม่แตะ
- ภาพหลังแก้: scratchpad/shots-after (9 ภาพ) เทียบ shots-before
- typecheck ผ่าน, vitest 85 ไฟล์ / 1017 ผ่าน, build ผ่าน, ไม่ได้รัน lint (ไม่มีสคริปต์)
