# ตรวจรับหน้าจอ iPad — 24 ตุลาคม 2569

คำขอ: จำลอง iPad และทดสอบงานหลักให้พร้อมส่งมอบ ต่อจากรายการแก้ F01–F12 โดยใช้ข้อมูลสมมติเท่านั้น

สภาพแวดล้อม: Chromium ใน in-app browser, viewport 768×1024 และ 1024×768; isolated fixture `localhost:18568`, in-memory D1, real application routes and built production assets. การตัดการเชื่อมต่อใช้ fixture ปิด socket ขณะที่เครื่องยังมีเครือข่าย จึงทดสอบ server unreachable ไม่ใช่การปิด Wi-Fi ของ iPad จริง

เงื่อนไขยอมรับ: สร้างงาน/กรอกคะแนน/เช็คชื่อแล้วตรวจ DB, รายงานและ Excel ตรงกับข้อมูล ณ เวลาส่งออก, คิวออฟไลน์รอดการรีโหลดและส่งกลับโดยไม่ซ้ำ, รายชื่อกับปีการศึกษาไม่ปะปน, layout ไม่ล้นหน้าทั้งสองทิศทาง และรายงานข้อจำกัดของเครื่องจำลองตามจริง

PM ทำ browser acceptance และตรวจหลักฐาน; QA ตรวจชุดทดสอบเสริมและแก้ keyboard regression; frontend developer แก้ offline metadata; QA ที่ไม่ได้เขียน offline patch ตรวจอิสระก่อนปิดงาน

ไม่รวม: Safari/WebKit บนเครื่องจริง, touch/แป้นพิมพ์จอ, กล้องจริง, Home Screen PWA ของ iPad, การพักเครื่องหลายวัน, ทดลองสอนจริง และ deploy
