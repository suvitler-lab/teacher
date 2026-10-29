// Inspect the actual workbook downloaded through the UI, using synthetic fixture data.
const ExcelJS = require('exceljs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path.join(__dirname, 'report-before-rollover.xlsx'));
  assert.equal(book.worksheets.length, 4);
  const scores = book.getWorksheet('คะแนนรายงาน');
  assert.equal(scores.rowCount, 33); // header + 32 students
  const col = scores.getRow(1).values.findIndex(x => String(x).startsWith('ทดสอบ iPad คะแนน'));
  assert.ok(col > 0);
  assert.equal(scores.getRow(2).getCell(2).value, '10501');
  assert.equal(scores.getRow(2).getCell(col).value, 7);
  assert.equal(scores.getRow(3).getCell(2).value, '10502');
  assert.equal(scores.getRow(3).getCell(col).value, 8);
  const overview = book.getWorksheet('ภาพรวมห้อง');
  const work = overview.getRows(2, overview.rowCount - 1).find(r => r.getCell(1).value === 'ทดสอบ iPad คะแนน');
  assert.equal(work.getCell(4).value, '2/32');
  const result = { result: 'PASS', sheets: book.worksheets.map(s => ({ name: s.name, rows: s.rowCount })), scoresAtExport: { '10501': 7, '10502': 8 }, workProgress: '2/32', note: 'Export before later Enter-fix retest changed scores to 6 and 9; attendance on 24 October is outside this term ending 10 October.' };
  await fs.writeFile(path.join(__dirname, 'excel-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch(e => { console.error(e); process.exitCode = 1; });
