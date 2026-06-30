/**
 * deploy-vercel.js  — v2
 * 1. Crea proyecto en Vercel (sin gitRepository)
 * 2. Configura variables de entorno
 * 3. Escribe frontend/.vercel/project.json
 * Luego el bat llama: vercel --prod --yes --token=...
 *
 * Uso: node deploy-vercel.js <VERCEL_TOKEN>
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN     = process.argv[2] || process.env.VERCEL_TOKEN;
const PROJ_NAME = 'plataforma-max10';
const TEAM_SLUG = 'futuroantioquiama10';

const ENV_VARS = [
  {
    key:    'NEXT_PUBLIC_SUPABASE_URL',
    value:  'https://fykdyalpuydkwfjqguip.supabase.co',
    type:   'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key:    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value:  'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0',
    type:   'plain',
    target: ['production', 'preview', 'development'],
  },
];

if (!TOKEN) {
  console.error('Falta el token de Vercel. Uso: node deploy-vercel.js <TOKEN>');
  process.exit(1);
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.vercel.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json',
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

async function getTeam() {
  const r = await api('GET', '/v2/teams');
  if (r.status !== 200) {
    console.log('⚠️  No se pudo obtener equipos, usando cuenta personal');
    return { teamId: null, orgId: null };
  }
  const team = r.body.teams?.find(t => t.slug === TEAM_SLUG);
  if (!team) {
    console.log('⚠️  Equipo no encontrado, usando cuenta personal');
    const me = await api('GET', '/v2/user');
    return { teamId: null, orgId: me.body?.user?.id || null };
  }
  return { teamId: team.id, orgId: team.id };
}

async function findOrCreateProject(teamId) {
  const qp = teamId ? `?teamId=${teamId}` : '';

  // Buscar existente
  const list = await api('GET', `/v10/projects${qp}`);
  if (list.status === 200) {
    const found = list.body.projects?.find(p => p.name === PROJ_NAME);
    if (found) {
      console.log(`✅ Proyecto existente: ${found.id}`);
      return found.id;
    }
  }

  // Crear nuevo (sin gitRepository para evitar errores de schema)
  console.log('📦 Creando proyecto en Vercel...');
  const createPath = teamId ? `/v10/projects?teamId=${teamId}` : '/v10/projects';
  const r = await api('POST', createPath, {
    name:      PROJ_NAME,
    framework: 'nextjs',
  });

  if (r.status === 200 || r.status === 201) {
    console.log(`✅ Proyecto creado: ${r.body.id}`);
    return r.body.id;
  }
  if (r.status === 409) {
    // Ya existe — buscar por nombre
    const r2 = await api('GET', `/v10/projects/${PROJ_NAME}${qp}`);
    if (r2.status === 200) {
      console.log(`✅ Proyecto ya existía: ${r2.body.id}`);
      return r2.body.id;
    }
  }
  throw new Error('Error creando proyecto: ' + JSON.stringify(r.body));
}

async function setEnvVars(projectId, teamId) {
  const qp = teamId ? `?teamId=${teamId}` : '';
  console.log('\n🔧 Configurando variables de entorno...');

  // Obtener env vars existentes
  const existing = await api('GET', `/v10/projects/${projectId}/env${qp}`);
  const existingKeys = existing.status === 200
    ? (existing.body.envs || []).map(e => e.key)
    : [];

  for (const env of ENV_VARS) {
    if (existingKeys.includes(env.key)) {
      console.log(`   ⏭️  ${env.key} (ya existe, OK)`);
      continue;
    }
    const r = await api('POST', `/v10/projects/${projectId}/env${qp}`, env);
    if (r.status === 200 || r.status === 201) {
      console.log(`   ✅ ${env.key}`);
    } else {
      console.log(`   ⚠️  ${env.key}: ${JSON.stringify(r.body)}`);
    }
  }
}

function writeProjectJson(orgId, projectId) {
  // Escribir en el directorio PADRE (no dentro de frontend)
  // porque el proyecto tiene rootDirectory='frontend' y el CLI se corre desde la raiz
  const dir = path.join(__dirname, '.vercel');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, 'project.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ orgId, projectId }, null, 2));
  console.log(`\n📄 .vercel/project.json creado (raiz del proyecto)`);
}

async function main() {
  console.log('\n🔑 Conectando con Vercel API...');

  const { teamId, orgId } = await getTeam();
  console.log(`👤 Team: ${teamId || 'personal'} | Org: ${orgId}`);

  const projectId = await findOrCreateProject(teamId);
  await setEnvVars(projectId, teamId);
  writeProjectJson(orgId || teamId, projectId);

  console.log('\n✅ Configuración completa!');
  console.log('   Ahora ejecutando: vercel --prod --yes --token=...');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
