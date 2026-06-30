/**
 * fix-imports.js
 * Mueve las importaciones de DEPORTISTAS_KEY y Deportista
 * desde '@/app/alumnos/importar/page' a '@/lib/deportistas'
 */

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'frontend', 'src');

function walk(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith('.tsx') || item.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let fixed = 0;

for (const file of walk(SRC)) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes("from '@/app/alumnos/importar/page'")) continue;

  // Caso 1: ambas importaciones en líneas separadas
  // import type { Deportista } from '@/app/alumnos/importar/page';
  // import { DEPORTISTAS_KEY } from '@/app/alumnos/importar/page';
  // → una sola línea combinada

  // Reemplazar cualquier import de esa página por la nueva ruta
  content = content
    .replace(/import\s+type\s+\{([^}]+)\}\s+from\s+'@\/app\/alumnos\/importar\/page';?\n?/g,
             (_, names) => `import type {${names}} from '@/lib/deportistas';\n`)
    .replace(/import\s+\{([^}]+)\}\s+from\s+'@\/app\/alumnos\/importar\/page';?\n?/g,
             (_, names) => `import {${names}} from '@/lib/deportistas';\n`);

  fs.writeFileSync(file, content, 'utf8');
  console.log(`✅ ${path.relative(SRC, file)}`);
  fixed++;
}

console.log(`\n${fixed} archivos actualizados.`);
