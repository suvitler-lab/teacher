// AC-150 gradebook rows (Q-7601 / Q-7001) on two fixtures: "four" = layout fixture (math: 14 works, 4 types) ; "one" = math 20 works, all one type
const L = require("./lib.cjs");
const variant = process.argv[2] || "four";
(async () => {
  const afterSeed = variant === "one" ? async (DB) => {
    await DB.prepare("UPDATE assignments SET type_id='wt_worksheet' WHERE subject_id='sub_math'").run();
    const stmts = [];
    for (let j = 15; j <= 20; j++) {
      stmts.push(DB.prepare("INSERT OR REPLACE INTO assignments (id, term_id, subject_id, type_id, title, unit, full_score, assigned_date, due_date, note, publish_scores, status, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL,10,'2026-10-29','2026-11-03',NULL,1,'open',0,0,NULL)").bind(`asg_x_${j}`, "term_demo", "sub_math", "wt_worksheet", `ใบงานเพิ่ม ${j}`));
      stmts.push(DB.prepare("INSERT OR REPLACE INTO assignment_classes (assignment_id, class_id) VALUES (?, 'cls_61')").bind(`asg_x_${j}`));
    }
    await DB.batch(stmts);
  } : undefined;
  const server = await L.startFixtureServer({ port: 4240, assetsDir: process.env.QA_ASSETS, layout: true, afterSeed });
  const browser = await L.pw.chromium.launch(); const out = {};
  for (const dev of ["desk", "ipadL", "ipadP"]) {
    const { ctx, page } = await L.newPage(browser, server, dev);
    await L.go(page, "#/gradebook?subject=sub_math", "table.gb tbody tr");
    out[dev] = await page.evaluate(() => {
      const vh = innerHeight; const rows = [...document.querySelectorAll("table.gb tbody tr")].map((t) => t.getBoundingClientRect());
      const h = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().height ?? -1);
      const sc = document.querySelector(".gb-scroll").getBoundingClientRect();
      return { vh, cols: document.querySelectorAll("th.col-w").length, fullRows: rows.filter((b) => b.top >= 0 && b.bottom <= vh && b.bottom <= sc.bottom).length, rowH: Math.round(rows[0].height), hero: h(".gbh"), toolbar: h(".gb-toolbar"), strip: h(".gb-work"), frameBottom: Math.round(sc.bottom), pageH: document.documentElement.scrollHeight, pageScroll: document.documentElement.scrollHeight > vh + 1, hOverflow: document.documentElement.scrollWidth > innerWidth + 1, nav: !!document.querySelector(".gb-nav") };
    });
    await ctx.close();
  }
  console.log(variant, JSON.stringify(out)); await browser.close(); await server.close?.(); process.exit(0);
})();
