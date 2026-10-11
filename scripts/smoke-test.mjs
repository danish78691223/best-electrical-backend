const base = process.env.API_URL || 'http://localhost:5000/api';
for (const p of ['/health','/products','/offers','/reviews']) {
  try { const r = await fetch(base+p); console.log(r.status, p, await r.text()); }
  catch (e) { console.error('FAILED',p,e.message); process.exitCode=1; }
}
