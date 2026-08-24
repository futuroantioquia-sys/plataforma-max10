/* ═══════════════════════════════════════════════════════════════════════════
   RESPALDO DE LA BASE DE DATOS · Futuro Antioquia · Plataforma Max 10

   Baja TODAS las tablas de Supabase y las guarda en:
       RESPALDO\RESPALDO_AAAA-MM-DD\<tabla>.csv

   REGLA DE ORO DE ESTE ARCHIVO:
   Si una tabla NO se puede leer, NO se escribe un archivo vacío. Se marca como
   ERROR en el resumen. Un respaldo que guarda ceros en silencio es peor que no
   tener respaldo: da confianza falsa.

   No necesita instalar nada. Se ejecuta con:  node respaldo.js
   ═══════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

// Todas las tablas de la plataforma.
const TABLAS = [
  'admins', 'profes', 'deportistas',
  'cont_movimientos', 'cont_mapeo', 'cont_conceptos',
  'pagos_estado', 'otros_pagos', 'soportes_pago', 'soportes_pagos',
  'facturas_solicitudes', 'productos', 'nomina',
  'asistencia', 'evaluaciones', 'config_valoracion', 'cal_com',
  'calificaciones_escolares', 'documentos_deportista', 'fotos_deportistas',
  'jornada_mes', 'jornadas_proyecto', 'mensajes',
  'cert_asistencia_log', 'cumple_enviados', 'visitas',
];

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const PASO = 1000;

/* Tablas PESADAS: guardan fotos, documentos y archivos dentro de la fila.
   Pedirles 1000 filas de una vez hace que la base se rinda por tiempo
   ("statement timeout"). A estas se les pide de a poquitas. */
const PASO_ESPECIAL = {
  fotos_deportistas:        15,
  documentos_deportista:    15,
  calificaciones_escolares: 25,
  soportes_pago:            25,
  soportes_pagos:           25,
  evaluaciones:            100,
  asistencia:              500,
};

const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ── Utilidades ─────────────────────────────────────────────────────────── */

function hoy() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function ahora() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function mb(n) { return (n / 1024 / 1024).toFixed(2) + ' MB'; }

/** Convierte filas a CSV con separador ';' (el que abre Excel en español). */
function aCSV(filas) {
  if (!filas.length) return '';
  const cols = Array.from(filas.reduce((s, f) => { Object.keys(f).forEach(k => s.add(k)); return s; }, new Set()));
  const celda = v => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const lineas = [cols.join(';')];
  for (const f of filas) lineas.push(cols.map(c => celda(f[c])).join(';'));
  return lineas.join('\r\n');
}

/** Pide UN pedazo de la tabla. Devuelve {filas} | {timeout} | {error}. */
async function pedirPedazo(tabla, desde, cuantos) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/${tabla}?select=*`, {
      headers: { ...H, Range: `${desde}-${desde + cuantos - 1}`, 'Range-Unit': 'items' },
    });
  } catch (e) {
    return { error: 'sin conexión: ' + (e && e.message ? e.message : e) };
  }
  if (!res.ok && res.status !== 206) {
    const t = await res.text().catch(() => '');
    // 57014 = la base se rindió por tiempo. Se puede reintentar más pequeño.
    if (res.status >= 500 || /57014|timeout/i.test(t)) return { timeout: true, detalle: t.slice(0, 80) };
    return { error: `HTTP ${res.status} ${t.slice(0, 120)}` };
  }
  const lote = await res.json().catch(() => null);
  if (!Array.isArray(lote)) return { error: 'respuesta inesperada' };
  return { filas: lote };
}

/** Baja una tabla completa. Si la base se rinde por tiempo, vuelve a intentar
 *  el MISMO pedazo pero más pequeño, hasta de a una fila si toca. Así las
 *  tablas con fotos y documentos también quedan respaldadas. */
async function bajarTabla(tabla) {
  const todo = [];
  let desde = 0;
  let paso  = PASO_ESPECIAL[tabla] || PASO;
  let reintentos = 0;

  while (true) {
    const r = await pedirPedazo(tabla, desde, paso);

    if (r.timeout) {
      if (paso > 1) {                       // el mismo pedazo, más pequeño
        paso = Math.max(1, Math.floor(paso / 4));
        process.stdout.write('·');
        await esperar(600);
        continue;
      }
      if (++reintentos <= 3) {              // ya es de a una: esperar y reintentar
        process.stdout.write('~');
        await esperar(3000);
        continue;
      }
      return { error: `la base se rindió por tiempo en la fila ${desde} (${r.detalle || ''})` };
    }

    if (r.error) {
      if (++reintentos <= 2) { await esperar(1500); continue; }
      return { error: r.error };
    }

    reintentos = 0;
    todo.push(...r.filas);
    if (r.filas.length < paso) break;       // ya no hay más
    desde += r.filas.length;
    if (desde > 500000) return { error: 'demasiadas filas, se detuvo por seguridad' };
  }
  return { filas: todo };
}

/* ── Programa principal ─────────────────────────────────────────────────── */

(async () => {
  const raiz    = path.resolve(__dirname);
  const destino = path.join(raiz, 'RESPALDO', 'RESPALDO_' + hoy());
  fs.mkdirSync(destino, { recursive: true });

  console.log('');
  console.log('============================================================');
  console.log('  RESPALDO DE LA BASE DE DATOS · ' + ahora());
  console.log('============================================================');
  console.log('  Guardando en: ' + destino);
  console.log('');

  const resumen = [];
  let conError = 0, totalFilas = 0, totalBytes = 0;

  for (const tabla of TABLAS) {
    process.stdout.write('  ' + tabla.padEnd(26));
    const r = await bajarTabla(tabla);

    if (r.error) {
      conError++;
      resumen.push({ tabla, estado: 'ERROR', detalle: r.error, filas: 0, bytes: 0 });
      console.log('ERROR  ← ' + r.error);
      continue;
    }
    if (!r.filas.length) {
      // Tabla vacía de verdad: se deja constancia, pero NO se borra un archivo previo.
      resumen.push({ tabla, estado: 'VACIA', detalle: 'la tabla no tiene filas', filas: 0, bytes: 0 });
      console.log('vacía');
      continue;
    }

    const csv  = aCSV(r.filas);
    const arch = path.join(destino, tabla + '.csv');
    fs.writeFileSync(arch, '﻿' + csv, 'utf8');
    const bytes = fs.statSync(arch).size;
    totalFilas += r.filas.length;
    totalBytes += bytes;
    resumen.push({ tabla, estado: 'OK', detalle: '', filas: r.filas.length, bytes });
    console.log(String(r.filas.length).padStart(7) + ' filas   ' + mb(bytes));
  }

  /* ── Resumen en pantalla y en archivo ── */
  const lineas = [];
  lineas.push('RESPALDO DE LA BASE DE DATOS · Futuro Antioquia');
  lineas.push('Fecha: ' + ahora());
  lineas.push('Carpeta: ' + destino);
  lineas.push('');
  lineas.push('TABLA                        ESTADO    FILAS      TAMAÑO');
  lineas.push('------------------------------------------------------------');
  for (const r of resumen) {
    lineas.push(
      r.tabla.padEnd(28) + r.estado.padEnd(10) +
      String(r.filas).padStart(7) + '   ' + mb(r.bytes).padStart(10) +
      (r.detalle ? '   ← ' + r.detalle : ''),
    );
  }
  lineas.push('------------------------------------------------------------');
  lineas.push('TOTAL: ' + totalFilas + ' filas · ' + mb(totalBytes));
  lineas.push('Tablas con error: ' + conError);
  lineas.push('');
  if (conError > 0) {
    lineas.push('*** ATENCION: ' + conError + ' tabla(s) NO se pudieron respaldar. ***');
    lineas.push('*** Este respaldo esta INCOMPLETO. Avisele a Claude.        ***');
  } else {
    lineas.push('Respaldo COMPLETO. Todas las tablas quedaron guardadas.');
  }

  const texto = lineas.join('\r\n');
  fs.writeFileSync(path.join(destino, '_RESUMEN.txt'), texto, 'utf8');
  // Copia fija en la raíz, para poder revisar el último respaldo sin buscar.
  fs.writeFileSync(path.join(raiz, 'ULTIMO-RESPALDO.txt'), texto, 'utf8');

  console.log('');
  console.log(texto.split('\r\n').slice(-4).join('\n'));
  console.log('');
  process.exit(conError > 0 ? 1 : 0);
})();
