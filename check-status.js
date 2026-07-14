const https = require('https');

const TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('Falta el token Vercel. Uso: node check-status.js <VERCEL_TOKEN>'); process.exit(1); }

const r = https.request({
  hostname: 'api.vercel.com',
  path: '/v6/deployments?teamId=team_0prQNtpTrByeCVB2Xi58AcKG&projectId=prj_igzwIM2OLpMSXADIIBgsMmQKOorl&limit=3',
  headers: { 'Authorization': `Bearer ${TOKEN}` }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const b = JSON.parse(d);
    if (!b.deployments?.length) { console.log('Sin deployments:', d); return; }
    b.deployments.forEach(dep => {
      console.log('---');
      console.log('Estado  :', dep.readyState);
      console.log('URL     :', dep.url);
      console.log('Creado  :', new Date(dep.createdAt).toLocaleTimeString('es-CO'));
    });
  });
});
r.end();
