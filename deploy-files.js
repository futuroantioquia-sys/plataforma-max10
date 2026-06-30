/**
 * deploy-files.js
 * Sube los archivos del frontend directamente a la API de Vercel (sin CLI, sin GitHub)
 * Uso: node deploy-files.js <VERCEL_TOKEN>
 */

const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const TOKEN      = process.argv[2] || process.env.VERCEL_TOKEN;
const PROJ_NAME  = 'plataforma-max10';
const TEAM_ID    = 'team_0prQNtpTrByeCVB2Xi58AcKG';
const PROJECT_ID = 'prj_igzwIM2OLpMSXADIIBgsMmQKOorl';
const FRONTEND   = path.join(__dirname, 'frontend');

// Excluir estas rutas
const EXCLUDE = [
  'node_modules', '.next', '.vercel', '.git',
  '.env', '.env.local', '.env.production',
  'deploy-', 'push-github',
];

const ENV_VARS = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',      value: 'https://fykdyalpuydkwfjqguip.supabase.co' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0' },
];

if (!TOKEN) { console.error('Falta el token.'); process.exit(1); }

// ── Helpers ─────────────────────────────────────────────────────

function apiRaw(method, urlPath, body, binary, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = binary || (body ? JSON.stringify(body) : null);
    const headers = {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type':  binary ? 'application/octet-stream' : 'application/json',
      ...extraHeaders,
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname: 'api.vercel.com', path: urlPath, method, headers }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve({ status: res.statusCode, body: JSON.parse(raw.toString()) }); }
        catch { resolve({ status: res.statusCode, body: raw.toString() }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const QP = `?teamId=${TEAM_ID}`;

// ── Recopilar archivos ───────────────────────────────────────────

function collectFiles(dir, base) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative(base, full).replace(/\\/g, '/');
    if (EXCLUDE.some(ex => rel.startsWith(ex) || entry.name.startsWith(ex))) continue;
    if (entry.isDirectory()) {
      result.push(...collectFiles(full, base));
    } else {
      const content = fs.readFileSync(full);
      const sha1    = crypto.createHash('sha1').update(content).digest('hex');
      result.push({ file: rel, content, sha: sha1, size: content.length });
    }
  }
  return result;
}

// ── Subir archivo ────────────────────────────────────────────────

async function uploadFile(file) {
  const r = await apiRaw('POST', `/v2/files${QP}`, null, file.content, {
    'x-vercel-digest': file.sha,  // SHA1 requerido por la API
  });
  // 200 = OK nuevo, 409 = ya existe (OK)
  if (r.status !== 200 && r.status !== 409) {
    console.log(`   ⚠️  ${file.file}: status ${r.status}`);
  }
}

// ── Crear deployment ─────────────────────────────────────────────

async function createDeployment(files) {
  const fileList = files.map(f => ({ file: f.file, sha: f.sha, size: f.size }));

  const body = {
    project:   PROJECT_ID,
    target:    'production',
    files:     fileList,
    projectSettings: {
      framework:       'nextjs',
      buildCommand:    null,
      outputDirectory: null,
      installCommand:  null,
    },
  };

  const r = await apiRaw('POST', `/v13/deployments${QP}`, body);
  return r;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('\n📁 Recopilando archivos del frontend...');
  const files = collectFiles(FRONTEND, FRONTEND);
  console.log(`   ${files.length} archivos encontrados`);

  console.log('\n📤 Subiendo archivos a Vercel...');
  let count = 0;
  for (const file of files) {
    await uploadFile(file);
    count++;
    if (count % 20 === 0) process.stdout.write(`   ${count}/${files.length}\r`);
  }
  console.log(`   ✅ ${files.length}/${files.length} archivos subidos`);

  console.log('\n🚀 Creando deployment en produccion...');
  const r = await createDeployment(files);

  if (r.status === 200 || r.status === 201) {
    const url = r.body.url || r.body.alias?.[0];
    console.log('\n🎉 DEPLOYMENT INICIADO!');
    console.log(`   URL: https://${url}`);
    console.log(`   Estado: ${r.body.readyState || 'BUILDING'}`);
    console.log('\n   La app estara lista en ~3-4 minutos.');
    console.log(`   Dashboard: https://vercel.com/futuroantioquiama10/${PROJ_NAME}`);
  } else {
    console.log('\n❌ Error en deployment:', JSON.stringify(r.body, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
