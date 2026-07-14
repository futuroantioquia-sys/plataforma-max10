/**
 * conectar-y-desplegar.js — v3
 * Usa el repoId numérico de GitHub y busca el proyecto por nombre
 */

const https = require('https');

const VERCEL_TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
const GH_TOKEN     = process.argv[3] || process.env.GH_TOKEN;
const TEAM_ID      = 'team_0prQNtpTrByeCVB2Xi58AcKG';
const PROJ_NAME    = 'plataforma-max10';
const GH_OWNER     = 'futuroantioquia-sys';
const GH_REPO_NAME = 'plataforma-max10';
const QP           = `?teamId=${TEAM_ID}`;

if (!VERCEL_TOKEN) { console.error('Falta el token Vercel. Uso: node conectar-y-desplegar.js <VERCEL_TOKEN> [GH_TOKEN]'); process.exit(1); }
if (!GH_TOKEN) { console.error('Falta el token de GitHub. Define GH_TOKEN o pasalo como segundo argumento.'); process.exit(1); }

function request(hostname, method, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const vercel = (method, path, body) => request(
  'api.vercel.com', method, path, body,
  { Authorization: `Bearer ${VERCEL_TOKEN}` }
);
const github = (method, path, body) => request(
  'api.github.com', method, path, body,
  { Authorization: `token ${GH_TOKEN}`, 'User-Agent': 'FuturoAntioquia', Accept: 'application/vnd.github.v3+json' }
);

async function main() {
  // ── 1. Obtener repoId numérico de GitHub ─────────────────────
  console.log('\n🔍 Obteniendo ID numérico del repo de GitHub...');
  const ghRepo = await github('GET', `/repos/${GH_OWNER}/${GH_REPO_NAME}`);
  if (ghRepo.status !== 200) throw new Error('No se pudo obtener el repo: ' + JSON.stringify(ghRepo.body));
  const repoId = ghRepo.body.id;
  console.log(`   ✅ repoId: ${repoId}`);

  // ── 2. Buscar proyecto Vercel por nombre ──────────────────────
  console.log('\n🔍 Buscando proyecto en Vercel...');
  const projects = await vercel('GET', `/v10/projects${QP}`);
  let project = projects.body.projects?.find(p => p.name === PROJ_NAME);

  if (!project) {
    // Crear proyecto si no existe
    console.log('   📦 Creando proyecto...');
    const created = await vercel('POST', `/v10/projects${QP}`, {
      name:          PROJ_NAME,
      framework:     'nextjs',
      rootDirectory: 'frontend',
    });
    if (created.status !== 200 && created.status !== 201) throw new Error('Error creando: ' + JSON.stringify(created.body));
    project = created.body;
    console.log(`   ✅ Proyecto creado: ${project.id}`);
  } else {
    console.log(`   ✅ Proyecto encontrado: ${project.id}`);
    // Actualizar configuración
    await vercel('PATCH', `/v10/projects/${project.id}${QP}`, {
      framework:     'nextjs',
      rootDirectory: 'frontend',
    });
    console.log(`   ✅ Configuración actualizada: framework=nextjs, rootDirectory=frontend`);
  }

  // ── 3. Configurar env vars ────────────────────────────────────
  console.log('\n🔧 Verificando variables de entorno...');
  const envRes = await vercel('GET', `/v10/projects/${project.id}/env${QP}`);
  const existingKeys = envRes.status === 200 ? (envRes.body.envs || []).map(e => e.key) : [];

  const envVars = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL',      value: 'https://fykdyalpuydkwfjqguip.supabase.co', type: 'plain', target: ['production','preview','development'] },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0', type: 'plain', target: ['production','preview','development'] },
  ];
  for (const env of envVars) {
    if (existingKeys.includes(env.key)) { console.log(`   ⏭️  ${env.key} (ya existe)`); continue; }
    await vercel('POST', `/v10/projects/${project.id}/env${QP}`, env);
    console.log(`   ✅ ${env.key}`);
  }

  // ── 4. Conectar repo GitHub al proyecto ───────────────────────
  console.log('\n🔗 Conectando GitHub al proyecto...');
  const link = await vercel('POST', `/v10/projects/${project.id}/link${QP}`, {
    type:   'github',
    repo:   `${GH_OWNER}/${GH_REPO_NAME}`,
    repoId: String(repoId),
  });
  if (link.status === 200 || link.status === 204 || link.status === 201) {
    console.log(`   ✅ GitHub conectado`);
  } else {
    console.log(`   ℹ️  Link: ${JSON.stringify(link.body)}`);
  }

  // ── 5. Disparar deployment desde GitHub ──────────────────────
  console.log('\n🚀 Disparando deployment de producción desde GitHub...');
  const deploy = await vercel('POST', `/v13/deployments${QP}`, {
    name:      PROJ_NAME,
    target:    'production',
    gitSource: {
      type:   'github',
      repoId: String(repoId),
      ref:    'main',
    },
  });

  if (deploy.status === 200 || deploy.status === 201) {
    const url = deploy.body.url || deploy.body.alias?.[0] || `${PROJ_NAME}.vercel.app`;
    console.log(`\n🎉 DEPLOYMENT INICIADO!`);
    console.log(`   URL: https://${url}`);
    console.log(`   Estado: ${deploy.body.readyState || 'QUEUED'}`);
    console.log(`\n   La app estará lista en ~4 minutos.`);
    console.log(`   Dashboard: https://vercel.com/futuroantioquiama10/${PROJ_NAME}`);
  } else {
    console.log(`\n❌ Error en deployment: ${JSON.stringify(deploy.body)}`);
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
