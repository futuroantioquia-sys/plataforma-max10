/**
 * push-github.js
 * Sube el proyecto a GitHub usando la API REST de GitHub (sin Git instalado)
 * Uso: node push-github.js <GITHUB_TOKEN>
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const TOKEN   = process.argv[2] || process.env.GH_TOKEN;
const OWNER   = 'futuroantioquia-sys';
const REPO    = 'plataforma-max10';
const BRANCH  = 'main';
// Ramas adicionales que también se actualizan con el mismo commit (para Vercel)
const RAMAS_EXTRA = ['principal'];
const ROOT    = __dirname;

// Archivos/carpetas a excluir
const EXCLUIR = [
  'node_modules', '.next', '.git', 'dist', 'build',
  '.env', '.env.local', '.env.*.local',
  'push-github.js', 'DESPLEGAR.bat',
  '.DS_Store', 'Thumbs.db',
];

if (!TOKEN) {
  console.error('\n❌ Falta el token de GitHub.');
  console.error('   Uso: node push-github.js <TU_TOKEN>\n');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────

function apiCall(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: 'api.github.com',
      path:     `/repos/${OWNER}/${REPO}${endpoint}`,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent':    'FuturoAntioquia-Deploy',
        'Content-Type':  'application/json',
        'Accept':        'application/vnd.github.v3+json',
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

function debeExcluir(filePath) {
  const partes = filePath.replace(/\\/g, '/').split('/');
  return partes.some(p =>
    EXCLUIR.some(ex => {
      if (ex.includes('*')) {
        const regex = new RegExp('^' + ex.replace(/\./g,'[.]').replace(/\*/g,'.*') + '$');
        return regex.test(p);
      }
      return p === ex;
    })
  );
}

function leerArchivos(dir, base = '') {
  const resultado = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const rel  = base ? `${base}/${item}` : item;
    const full = path.join(dir, item);
    if (debeExcluir(rel)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      resultado.push(...leerArchivos(full, rel));
    } else {
      resultado.push({ path: rel, fullPath: full });
    }
  }
  return resultado;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Subiendo Plataforma MAX 10 SPORT a GitHub...\n');

  // 1. Obtener SHA del último commit de main
  let baseSha = null;
  let baseTreeSha = null;
  const refRes = await apiCall('GET', `/git/refs/heads/${BRANCH}`);
  if (refRes.status === 200) {
    baseSha     = refRes.body.object.sha;
    const commit = await apiCall('GET', `/git/commits/${baseSha}`);
    baseTreeSha  = commit.body.tree.sha;
    console.log(`✅ Rama ${BRANCH} encontrada. Commit base: ${baseSha.slice(0,7)}`);
  } else {
    // Repo vacío — inicializar con un commit vacío via Contents API
    console.log(`ℹ️  Repo vacío — inicializando...`);
    const initRes = await apiCall('PUT', '/contents/.gitkeep', {
      message: 'init',
      content: '',   // archivo vacío en base64
    });
    if (initRes.status === 201) {
      baseSha     = initRes.body.commit.sha;
      baseTreeSha = initRes.body.commit.tree.sha;
      console.log(`✅ Repo inicializado: ${baseSha.slice(0,7)}`);
    } else {
      console.log(`ℹ️  Primera subida — creando rama ${BRANCH}`, initRes.body?.message || '');
    }
  }

  // 2. Leer todos los archivos
  const archivos = leerArchivos(ROOT);
  console.log(`📁 Archivos a subir: ${archivos.length}\n`);

  // 3. Crear blobs para cada archivo
  const treeItems = [];
  for (let i = 0; i < archivos.length; i++) {
    const { path: rel, fullPath } = archivos[i];
    process.stdout.write(`   [${i+1}/${archivos.length}] ${rel}...\r`);
    const content = fs.readFileSync(fullPath);
    const base64  = content.toString('base64');
    const blob    = await apiCall('POST', '/git/blobs', {
      content:  base64,   // ← string base64, no el Buffer
      encoding: 'base64',
    });
    if (blob.status !== 201) {
      // Intentar como UTF-8 si falla base64
      const blob2 = await apiCall('POST', '/git/blobs', {
        content:  content.toString('utf8'),
        encoding: 'utf-8',
      });
      if (blob2.status !== 201) {
        console.log(`\n⚠️  Error en ${rel}: ${JSON.stringify(blob2.body)}`);
        continue;
      }
      treeItems.push({ path: rel, mode: '100644', type: 'blob', sha: blob2.body.sha });
    } else {
      treeItems.push({ path: rel, mode: '100644', type: 'blob', sha: blob.body.sha });
    }
  }
  console.log(`\n✅ ${treeItems.length} archivos procesados\n`);

  // 4. Crear tree
  const treeBody = { tree: treeItems };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const treeRes = await apiCall('POST', '/git/trees', treeBody);
  if (treeRes.status !== 201) {
    console.error('❌ Error creando tree:', treeRes.body);
    process.exit(1);
  }
  const newTreeSha = treeRes.body.sha;
  console.log(`✅ Tree creado: ${newTreeSha.slice(0,7)}`);

  // 5. Crear commit
  const commitBody = {
    message: `Plataforma MAX 10 SPORT - ${new Date().toLocaleDateString('es-CO')}`,
    tree:    newTreeSha,
    ...(baseSha ? { parents: [baseSha] } : {}),
  };
  const commitRes = await apiCall('POST', '/git/commits', commitBody);
  if (commitRes.status !== 201) {
    console.error('❌ Error creando commit:', commitRes.body);
    process.exit(1);
  }
  const newCommitSha = commitRes.body.sha;
  console.log(`✅ Commit creado: ${newCommitSha.slice(0,7)}`);

  // 6. Actualizar referencia (o crear rama)
  let refUpdateRes;
  if (baseSha) {
    refUpdateRes = await apiCall('PATCH', `/git/refs/heads/${BRANCH}`, {
      sha:   newCommitSha,
      force: true,
    });
  } else {
    refUpdateRes = await apiCall('POST', '/git/refs', {
      ref: `refs/heads/${BRANCH}`,
      sha: newCommitSha,
    });
  }

  if (refUpdateRes.status === 200 || refUpdateRes.status === 201) {
    console.log(`✅ Rama ${BRANCH} actualizada: ${newCommitSha.slice(0,7)}`);
  } else {
    console.error('❌ Error actualizando rama:', refUpdateRes.body);
    process.exit(1);
  }

  // 7. Sincronizar ramas extra (principal, etc.) con el mismo commit
  for (const rama of RAMAS_EXTRA) {
    // Verificar si la rama existe
    const ramRef = await apiCall('GET', `/git/refs/heads/${rama}`);
    let syncRes;
    if (ramRef.status === 200) {
      // Actualizar rama existente
      syncRes = await apiCall('PATCH', `/git/refs/heads/${rama}`, {
        sha:   newCommitSha,
        force: true,
      });
    } else {
      // Crear rama nueva
      syncRes = await apiCall('POST', '/git/refs', {
        ref: `refs/heads/${rama}`,
        sha: newCommitSha,
      });
    }
    if (syncRes.status === 200 || syncRes.status === 201) {
      console.log(`✅ Rama '${rama}' sincronizada → ${newCommitSha.slice(0,7)}`);
    } else {
      console.warn(`⚠️  No se pudo sincronizar '${rama}':`, syncRes.body?.message ?? '');
    }
  }

  console.log(`\n🎉 CÓDIGO SUBIDO EXITOSAMENTE A GITHUB!`);
  console.log(`   https://github.com/${OWNER}/${REPO}`);
  console.log(`   Vercel detectará el push y redesplegará en ~1 min.\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
