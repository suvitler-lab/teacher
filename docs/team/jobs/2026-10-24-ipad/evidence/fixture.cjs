// Isolated synthetic school for the iPad-size browser acceptance run. No .dev.vars or real DB.
const { startFixtureServer } = require('../../../../../scripts/fixture-server.cjs');
const readline = require('node:readline');
async function main() {
  const s = await startFixtureServer({ port: 18568 });
  console.log(JSON.stringify({ event: 'ready', url: 'http://localhost:18568', data: 'synthetic only' }));
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', async line => {
    try {
      const cmd = JSON.parse(line);
      if (cmd.command === 'network') { s.setDown(!cmd.online); console.log(JSON.stringify({ event:'network', online:cmd.online })); }
      if (cmd.command === 'state') {
        const work = await s.DB.prepare("SELECT a.id,a.title,a.full_score,a.status,t.year,t.term FROM assignments a LEFT JOIN terms t ON t.id=a.term_id WHERE a.title LIKE 'ทดสอบ iPad%' ORDER BY a.created_at").all();
        const scores = await s.DB.prepare("SELECT a.title,s.code,sub.score,sub.status,sub.method FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id JOIN students s ON s.id=sub.student_id WHERE a.title LIKE 'ทดสอบ iPad%' ORDER BY a.title,s.code").all();
        const attendance = await s.DB.prepare("SELECT sess.date,c.name,s.code,at.status FROM attendance at JOIN attendance_sessions sess ON sess.id=at.session_id JOIN classes c ON c.id=sess.class_id JOIN students s ON s.id=at.student_id WHERE sess.date='2026-10-24' AND sess.subject_id IS NULL AND s.code IN ('10501','10502') ORDER BY s.code").all();
        const terms = await s.DB.prepare('SELECT id,year,term,is_current FROM terms ORDER BY year,term').all();
        const classes = await s.DB.prepare('SELECT c.id,c.name,c.year,c.archived,COUNT(s.id) AS students FROM classes c LEFT JOIN students s ON s.class_id=c.id GROUP BY c.id ORDER BY c.year,c.name').all();
        console.log(JSON.stringify({ event:'state', work:work.results,scores:scores.results,attendance:attendance.results,terms:terms.results,classes:classes.results }));
      }
      if (cmd.command === 'close') { input.close(); await s.close(); process.exit(0); }
    } catch (e) { console.log(JSON.stringify({event:'error',message:String(e.message)})); }
  });
  for (const sig of ['SIGINT','SIGTERM']) process.on(sig,async()=>{await s.close();process.exit(0);});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
