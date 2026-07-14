const https = require('https');

const TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
const TEAM  = 'team_0prQNtpTrByeCVB2Xi58AcKG';

if (!TOKEN) { console.error('Falta el token Vercel. Uso: node check-build.js <VERCEL_TOKEN>'); process.exit(1); }

function api(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.vercel.com', path,
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const deps = await api(`/v6/deployments?teamId=${TEAM}&limit=8`);

  if (!deps.deployments?.length) { console.log('Sin deployments:', JSON.stringify(deps)); return; }

  console.log('\n=== Últimos deployments ===');
  deps.deployments.slice(0,5).forEach(d => {
    const icon = d.readyState === 'READY' ? '✅' : d.readyState === 'ERROR' ? '❌' : d.readyState === 'BUILDING' ? '🔨' : '⏳';
    console.log(`${icon} ${d.name} | ${d.readyState} | ${new Date(d.createdAt).toLocaleTimeString('es-CO')} | ${d.url}`);
  });

  // Mostrar logs del deployment más reciente en ERROR o BUILDING
  const interesting = deps.deployments.find(d =>
    d.name === 'plataforma-max10' && (d.readyState === 'ERROR' || d.readyState === 'BUILDING')
  );
  if (!interesting) { console.log('\nNo hay deployments en ERROR o BUILDING'); return; }

  console.log(`\n=== Logs de ${interesting.url} (${interesting.readyState}) ===`);
  const events = await api(`/v2/deployments/${interesting.uid}/events?teamId=${TEAM}&builds=1&limit=100`);
  if (Array.isArray(events)) {
    events.slice(-30).forEach(e => {
      const txt = e.payload?.text || e.text || '';
      if (txt) console.log(txt);
    });
  } else {
    console.log(JSON.stringify(events).slice(0, 2000));
  }
}

main().catch(console.error);
