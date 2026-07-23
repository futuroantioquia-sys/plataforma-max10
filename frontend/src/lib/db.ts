/**
 * db.ts — Capa de datos Futuro Antioquia
 * Supabase es la fuente de verdad. localStorage = caché local.
 */

import { createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';

// ── Tipos ────────────────────────────────────────────────────

export interface Deportista {
  id:        string;
  _nombre:   string;
  _columnas: Record<string, string>;
  foto?:     string;
}

export interface FilaPago {
  detalle:  string;
  estado:   string;   // 'PEND' | 'PAGÓ' | 'PAGÓ CON 10%'
  vPagado:  string;
  vCargado: string;
  destino:  string;
  fecha:    string;
}

export type AllPagos = Record<string, FilaPago[]>;

// ── Claves localStorage (backward compat) ────────────────────
const LS_DEPS  = 'futuro_deportistas';
const LS_PAGOS = 'futuro_pagos_estado';
const LS_FOTOS = 'futuro_fotos_deportistas';
/** Clave dedicada para pagos del Libro Contable (claves numéricas 4-5 dígitos).
 *  Se guarda SEPARADO del resto para que no compita con datos de Supabase
 *  y no pierda datos por cuota de localStorage. */
const LS_LIBRO = 'futuro_libro_pagos';

// ── Caché en memoria (evita re-fetch en cada navegación) ─────
let _cacheDeportistas: Deportista[] | null = null;
let _cachePagos:       AllPagos    | null = null;

/** Invalida la caché para forzar recarga desde Supabase */
export function invalidarCache() {
  _cacheDeportistas = null;
  _cachePagos       = null;
}

// ── Helpers ──────────────────────────────────────────────────
function supabase() { return createClient(); }

/**
 * Deriva el nombre correcto del deportista.
 * Si el campo `nombre` es un código numérico (o está vacío),
 * busca en columnas alguna clave que represente el nombre real.
 */
function derivarNombre(nombre: string, columnas: Record<string, string>): string {
  const n = (nombre ?? '').trim();
  // Si tiene contenido y NO es solo dígitos → es el nombre real
  if (n && !/^\d+$/.test(n)) return n;

  const cols = columnas ?? {};

  // Prioridad 1: columna que contenga "deportista" o "alumno" o "jugador"
  const key1 = Object.keys(cols).find(k =>
    /deportista|alumno|jugador|atleta/i.test(k.trim())
  );
  if (key1 && cols[key1]?.trim()) return cols[key1].trim();

  // Prioridad 2: cualquier columna que contenga "nombre"
  // (pero que no sea solo el CÓDIGO)
  const key2 = Object.keys(cols).find(k =>
    /nombre/i.test(k.trim()) && !/^c[oó]d/i.test(k.trim())
  );
  if (key2 && cols[key2]?.trim() && !/^\d+$/.test(cols[key2].trim())) {
    return cols[key2].trim();
  }

  return n;
}

function lsGet<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { console.warn('[db] localStorage lleno o bloqueado:', key, e); }
}

// ── DEPORTISTAS ───────────────────────────────────────────────

/** Convierte fila cruda de Supabase al tipo Deportista */
function rowToDeportista(r: any): Deportista {
  return {
    id:        r.id,
    _nombre:   derivarNombre(r.nombre ?? '', r.columnas ?? {}),
    _columnas: r.columnas ?? {},
  };
}

/** Guarda deportistas solo si la nueva lista tiene MÁS registros que la actual en localStorage */
function lsSetDeps(deps: Deportista[]) {
  const actual = lsGet<Deportista[]>(LS_DEPS, []);
  if (deps.length >= actual.length) lsSet(LS_DEPS, deps);
}

/** Fetch paginado: recorre páginas de 1000 hasta agotar todos los registros */
async function fetchAllPages(
  baseUrl: string,
  headers: Record<string, string>,
  pageSize = 1000
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let i = 0; i < 20; i++) {           // máximo 20 páginas = 20 000 filas
    const from = offset;
    const to   = offset + pageSize - 1;
    try {
      const res = await fetch(`${baseUrl}&offset=${offset}&limit=${pageSize}`, {
        headers: { ...headers, 'Range': `${from}-${to}`, 'Prefer': 'count=none' },
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;    // última página
      offset += pageSize;
    } catch { break; }
  }
  return all;
}

/** Lee deportistas: proxy Vercel → fetch paginado → SDK paginado → localStorage. */
export async function getDeportistas(): Promise<Deportista[]> {
  if (_cacheDeportistas) return _cacheDeportistas;

  // ── Intento 1: API route de Vercel (una sola llamada, el servidor pagina internamente) ──
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);   // 20 s máx
    const res   = await fetch('/api/deportistas', {
      cache:  'no-store',
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const deps = data.map(rowToDeportista);
        lsSetDeps(deps);
        _cacheDeportistas = deps;
        return deps;
      }
    }
  } catch { /* intentar fetch directo */ }

  // ── Intento 2: fetch() paginado directo a Supabase ──
  try {
    const sbHeaders = {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
    };
    const data = await fetchAllPages(
      `${SUPABASE_URL}/rest/v1/deportistas?select=id,nombre,columnas&order=nombre`,
      sbHeaders,
      1000
    );
    if (data.length > 0) {
      const deps = data.map(rowToDeportista);
      lsSetDeps(deps);
      _cacheDeportistas = deps;
      return deps;
    }
  } catch { /* intentar SDK */ }

  // ── Intento 3: SDK paginado de Supabase ──
  try {
    const all: any[] = [];
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase()
        .from('deportistas')
        .select('id, nombre, columnas')
        .order('nombre')
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (all.length > 0) {
      const deps = all.map(rowToDeportista);
      lsSetDeps(deps);
      _cacheDeportistas = deps;
      return deps;
    }
  } catch { /* ignorar */ }

  // ── Fallback: localStorage ──
  const cached = lsGet<Deportista[]>(LS_DEPS, []);
  const result = cached.map(d => ({
    ...d,
    _nombre: derivarNombre(d._nombre, d._columnas ?? {}),
  }));
  if (result.length) _cacheDeportistas = result;
  return result;
}

/**
 * Búsqueda rápida: retorna solo los deportistas cuyo CÓDIGO coincida.
 * Llama al endpoint /api/calidoso-login que hace UNA query a Supabase.
 * Fallback a caché en memoria o localStorage si la red falla.
 */
export async function buscarPorCodigo(codigo: string): Promise<Deportista[]> {
  const RX_COD = /^c[oó]d/i;

  // ── Intento 1: endpoint rápido de Supabase (1 fila, no 1.139) ──
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res   = await fetch(
      `/api/calidoso-login?codigo=${encodeURIComponent(codigo)}`,
      { cache: 'no-store', signal: ctrl.signal }
    ).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(rowToDeportista);
      }
    }
  } catch { /* caída silenciosa → buscar en caché */ }

  // ── Fallback: filtrar la caché en memoria o localStorage ──
  const fuente = _cacheDeportistas ?? lsGet<Deportista[]>(LS_DEPS, []);
  return fuente.filter(d => {
    const cols   = d._columnas ?? {};
    const codKey = Object.keys(cols).find(k => RX_COD.test(k.trim().normalize('NFC')));
    return codKey ? String(cols[codKey]).trim().toUpperCase() === codigo : false;
  });
}

/**
 * Carga SOLO los deportistas de un proyecto específico.
 * Timeout 8s por intento para evitar spinner infinito.
 * Devuelve { data, error } para que la UI muestre el problema real.
 */
export async function getDeportistasPorProyecto(
  proyecto: string
): Promise<{ data: Deportista[]; error: string | null }> {
  const proyEnc = encodeURIComponent(proyecto);
  const errores: string[] = [];

  function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return promise.finally(() => clearTimeout(timer));
  }

  // Intento 1: proxy Vercel /api/deportistas (server-side, evita CORS)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`/api/deportistas?proyecto=${proyEnc}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return { data: data.map(rowToDeportista), error: null };
      }
      if (Array.isArray(data) && data.length === 0) {
        errores.push(`Proxy OK pero 0 deportistas para proyecto "${proyecto}"`);
      }
    } else {
      const body = await res.text().catch(() => '');
      errores.push(`Proxy HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
  } catch (e: any) {
    errores.push(`Proxy error: ${e?.name === 'AbortError' ? 'timeout 8s' : e?.message}`);
  }

  // Intento 2: fetch directo a Supabase REST (sin Content-Type → evita preflight CORS)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/deportistas?select=id,nombre,columnas&columnas->>PROY=eq.${proyEnc}&order=nombre`,
      {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        signal: ctrl.signal,
      }
    ).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return { data: data.map(rowToDeportista), error: null };
      }
      errores.push(`Supabase REST OK pero ${Array.isArray(data) ? data.length : 'no-array'} filas`);
    } else {
      const body = await res.text().catch(() => '');
      errores.push(`Supabase REST HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
  } catch (e: any) {
    errores.push(`Supabase REST error: ${e?.name === 'AbortError' ? 'timeout 8s' : e?.message}`);
  }

  // Intento 3: SDK Supabase
  try {
    const { data, error } = await supabase()
      .from('deportistas')
      .select('id, nombre, columnas')
      .eq('columnas->>PROY', proyecto)
      .order('nombre');
    if (!error && data && data.length > 0) {
      return { data: data.map(rowToDeportista), error: null };
    }
    errores.push(`SDK: ${error?.message ?? `0 filas devueltas`}`);
  } catch (e: any) {
    errores.push(`SDK error: ${e?.message}`);
  }

  const resumen = errores.join(' | ');
  console.error('[getDeportistasPorProyecto]', resumen);
  return { data: [], error: resumen };
}

/** Elimina TODOS los deportistas de Supabase y localStorage. */
export async function deleteAllDeportistas(): Promise<void> {
  _cacheDeportistas = null;
  try { localStorage.removeItem(LS_DEPS); } catch {}

  try {
    // Borrar toda la tabla deportistas en Supabase
    const { error } = await supabase()
      .from('deportistas')
      .delete()
      .neq('id', '___never___'); // condición que aplica a todas las filas

    if (error) console.error('[db] deleteAllDeportistas:', error.message);
  } catch (e) {
    console.error('[db] deleteAllDeportistas:', e);
  }
}

/** Guarda deportistas en Supabase (upsert) y en localStorage. */
export async function saveDeportistas(deps: Deportista[]): Promise<void> {
  _cacheDeportistas = deps; // actualizar caché inmediatamente
  lsSet(LS_DEPS, deps);

  try {
    const rows = deps.map(d => ({
      id:      d.id,
      nombre:  derivarNombre(d._nombre, d._columnas),
      columnas: d._columnas,
    }));

    const { error } = await supabase()
      .from('deportistas')
      .upsert(rows, { onConflict: 'id' });

    if (error) console.error('[db] saveDeportistas:', error.message);
  } catch (e) {
    console.error('[db] saveDeportistas:', e);
  }
}

// ── PAGOS ────────────────────────────────────────────────────

/** Lee todos los pagos: fetch() directo → SDK → localStorage. */
export async function getPagos(): Promise<AllPagos> {
  /* Helper: leer localStorage como base completa (última importación) */
  const lsBase = (): AllPagos => {
    const libroAll = lsGet<AllPagos>(LS_LIBRO, {});
    const lsAll    = lsGet<AllPagos>(LS_PAGOS, {});
    return { ...lsAll, ...libroAll };
  };

  /* Helper: parsear filas de Supabase → AllPagos */
  const parseSb = (data: any[]): AllPagos => {
    const sbAll: AllPagos = {};
    for (const r of data) {
      if (!sbAll[r.deportista_id]) sbAll[r.deportista_id] = [];
      sbAll[r.deportista_id].push({
        detalle:  r.detalle,
        estado:   r.estado,
        vPagado:  r.v_pagado  ?? '',
        vCargado: r.v_cargado ?? '',
        destino:  r.destino   ?? '',
        fecha:    r.fecha     ?? '',
      });
    }
    return sbAll;
  };

  /* ── ESTRATEGIA: localStorage = base completa (import local).
     Supabase agrega/sobreescribe entradas que SÍ insertó.
     Así, si Supabase falla parcialmente para algunos deportistas,
     el localStorage los cubre sin destruir los datos del import. ──*/

  // ── Intento 1: fetch() nativo ──
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pagos_estado?select=deportista_id,detalle,estado,v_pagado,v_cargado,destino,fecha&limit=5000`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sbAll = parseSb(data);
        /* MERGE: localStorage (base completa) + Supabase (sobreescribe donde tiene datos).
           Nunca sobreescribir localStorage desde aquí — solo saveAllPagos escribe LS. */
        return { ...lsBase(), ...sbAll };
      }
    }
  } catch { /* intentar SDK */ }

  // ── Intento 2: SDK ──
  try {
    const { data, error } = await supabase()
      .from('pagos_estado')
      .select('deportista_id, detalle, estado, v_pagado, v_cargado, destino, fecha')
      .limit(5000);

    if (error) throw error;

    const sbAll = parseSb(data ?? []);
    if (Object.keys(sbAll).length > 0) {
      /* MERGE: Supabase + localStorage (cubre gaps de INSERT parcialmente fallido) */
      return { ...lsBase(), ...sbAll };
    }

    // Supabase vacío → usar solo localStorage
    return lsBase();
  } catch {
    // Sin Supabase: localStorage completo
    return lsBase();
  }
}

/** Guarda/actualiza pagos de UN deportista en Supabase. */
export async function savePagosDeportista(depId: string, filas: FilaPago[]): Promise<void> {
  // Actualizar localStorage (solo dep.id entries, NO tocar LS_LIBRO)
  const all = lsGet<AllPagos>(LS_PAGOS, {});
  all[depId] = filas;
  lsSet(LS_PAGOS, all);

  try {
    const rows = filas.map(f => ({
      deportista_id: depId,
      detalle:       f.detalle,
      estado:        f.estado,
      v_pagado:      f.vPagado,
      v_cargado:     f.vCargado,
      destino:       f.destino,
      fecha:         f.fecha,
    }));

    const { error } = await supabase()
      .from('pagos_estado')
      .upsert(rows, { onConflict: 'deportista_id,detalle' });

    if (error) console.error('[db] savePagosDeportista:', error.message);
  } catch (e) {
    console.error('[db] savePagosDeportista:', e);
  }
}

/** Borra TODOS los pagos del libro contable: localStorage + Supabase. */
export async function deleteAllPagos(): Promise<void> {
  /* 1. Limpiar localStorage */
  try { localStorage.removeItem(LS_LIBRO);  } catch {}
  try { localStorage.removeItem(LS_PAGOS);  } catch {}
  _cachePagos = null;

  /* 2. Borrar en Supabase — fetch() directo */
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/pagos_estado?deportista_id=not.is.null`,
      {
        method: 'DELETE',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
      }
    );
  } catch {
    /* Fallback SDK */
    try {
      await supabase().from('pagos_estado').delete().neq('deportista_id', '');
    } catch (e) {
      console.error('[db] deleteAllPagos:', e);
    }
  }
}

/** Guarda todos los pagos (batch): usado al importar Libro Contable.
 *  - TODAS las claves → Supabase pagos_estado (fuente de verdad)
 *  - Claves numéricas también → LS_LIBRO (caché local rápida)
 *  - Claves dep.id → LS_PAGOS (caché local rápida) */
export async function saveAllPagos(all: AllPagos): Promise<void> {
  /* Separar claves numéricas (Libro Contable) de claves dep.id (manual) */
  const libroEntries: AllPagos = {};
  const depEntries:   AllPagos = {};

  for (const [key, filas] of Object.entries(all)) {
    if (/^\d{1,6}$/.test(key)) {
      libroEntries[key] = filas;
    } else {
      depEntries[key] = filas;
    }
  }

  /* 1. Caché localStorage */
  lsSet(LS_LIBRO, libroEntries);
  lsSet(LS_PAGOS, depEntries);

  /* 2. Sincronizar TODO (libro + dep.id) con Supabase — fuente de verdad */
  try {
    const rows: object[] = [];
    // Libro contable (claves numéricas como deportista_id — TEXT, sin FK)
    for (const [codigo, filas] of Object.entries(libroEntries)) {
      for (const f of filas) {
        rows.push({
          deportista_id: codigo,
          detalle:       f.detalle,
          estado:        f.estado,
          v_pagado:      f.vPagado,
          v_cargado:     f.vCargado,
          destino:       f.destino,
          fecha:         f.fecha,
        });
      }
    }
    // Pagos manuales (dep.id)
    for (const [depId, filas] of Object.entries(depEntries)) {
      for (const f of filas) {
        rows.push({
          deportista_id: depId,
          detalle:       f.detalle,
          estado:        f.estado,
          v_pagado:      f.vPagado,
          v_cargado:     f.vCargado,
          destino:       f.destino,
          fecha:         f.fecha,
        });
      }
    }
    if (!rows.length) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('pagos_estado')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'deportista_id,detalle' });
      if (error) console.error('[db] saveAllPagos chunk:', error.message);
    }
  } catch (e) {
    console.error('[db] saveAllPagos:', e);
  }
}

// ── FOTOS ────────────────────────────────────────────────────

/** Lee foto de un deportista: Supabase primero, localStorage como fallback. */
export async function getFoto(depId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .from('fotos_deportistas')
      .select('base64')
      .eq('deportista_id', depId)
      .maybeSingle();

    if (error) throw error;
    if (data?.base64) {
      // Guardar en localStorage también
      const fotos = lsGet<Record<string, string>>(LS_FOTOS, {});
      fotos[depId] = data.base64;
      lsSet(LS_FOTOS, fotos);
      return data.base64;
    }
  } catch {}

  // Fallback localStorage
  const fotos = lsGet<Record<string, string>>(LS_FOTOS, {});
  return fotos[depId] ?? null;
}

/** Guarda foto en Supabase y localStorage. */
export async function saveFoto(depId: string, base64: string): Promise<void> {
  const fotos = lsGet<Record<string, string>>(LS_FOTOS, {});
  fotos[depId] = base64;
  lsSet(LS_FOTOS, fotos);

  try {
    const { error } = await supabase()
      .from('fotos_deportistas')
      .upsert({ deportista_id: depId, base64: base64 }, { onConflict: 'deportista_id' });

    if (error) console.error('[db] saveFoto:', error.message);
  } catch (e) {
    console.error('[db] saveFoto:', e);
  }
}

// ── ASISTENCIA ────────────────────────────────────────────────

// [proyecto][anio_mes][deportistaId][fecha] = Estado
export type AsistenciaData = Record<string, Record<string, Record<string, Record<string, string>>>>;

const LS_ASIST = 'futuro_asistencia';

/** Fusiona dos AsistenciaData: mantiene TODOS los registros de ambas fuentes.
 *  Si existe el mismo (proyecto/mes/dep/fecha) en ambas, Supabase tiene prioridad. */
function mergeAsistencia(local: AsistenciaData, remote: AsistenciaData): AsistenciaData {
  // Empezar con copia profunda del local
  const merged: AsistenciaData = JSON.parse(JSON.stringify(local));
  for (const [proy, meses] of Object.entries(remote)) {
    if (!merged[proy]) merged[proy] = {};
    for (const [mes, deps] of Object.entries(meses)) {
      if (!merged[proy][mes]) merged[proy][mes] = {};
      for (const [dep, fechas] of Object.entries(deps)) {
        if (!merged[proy][mes][dep]) merged[proy][mes][dep] = {};
        for (const [fecha, estado] of Object.entries(fechas)) {
          if (estado) merged[proy][mes][dep][fecha] = estado; // Supabase gana solo si tiene estado real (no vacío)
        }
      }
    }
  }
  return merged;
}

/** Lee asistencia completa: fetch() directo → SDK → localStorage.
 *  Siempre FUSIONA con localStorage (nunca sobreescribe), y usa limit alto para evitar
 *  truncamiento de la paginación de Supabase (default 1000 filas). */
export async function getAsistencia(): Promise<AsistenciaData> {
  const parseAsistRows = (data: any[]): AsistenciaData => {
    const result: AsistenciaData = {};
    for (const r of data) {
      if (!r.estado) continue; // ignorar filas vacías — no deben sobreescribir datos válidos
      if (!result[r.proyecto]) result[r.proyecto] = {};
      if (!result[r.proyecto][r.anio_mes]) result[r.proyecto][r.anio_mes] = {};
      if (!result[r.proyecto][r.anio_mes][r.deportista_id]) result[r.proyecto][r.anio_mes][r.deportista_id] = {};
      result[r.proyecto][r.anio_mes][r.deportista_id][r.fecha] = r.estado;
    }
    return result;
  };

  const local = lsGet<AsistenciaData>(LS_ASIST, {});

  // ── Intento 1: fetch() nativo con limit alto ──
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&limit=50000`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const remote = parseAsistRows(data);
        const merged = mergeAsistencia(local, remote);
        lsSet(LS_ASIST, merged);
        return merged;
      }
    }
  } catch { /* intentar SDK */ }

  // ── Intento 2: SDK con limit alto ──
  try {
    const { data, error } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .limit(50000);

    if (error) throw error;
    if (!data || !data.length) return local;

    const remote = parseAsistRows(data);
    const merged = mergeAsistencia(local, remote);
    lsSet(LS_ASIST, merged);
    return merged;
  } catch {
    return local;
  }
}

/** Guarda asistencia SOLO en localStorage (rápido, sin riesgo de carrera). */
export function saveAsistenciaLocal(data: AsistenciaData): void {
  lsSet(LS_ASIST, data);
}

/** Carga asistencia filtrada por un proyecto — ~50-200 filas en vez de 50 000.
 *  Para profes: carga solo su proyecto; actualiza LS sin tocar otros proyectos. */
export async function getAsistenciaPorProyecto(proyectoId: string): Promise<AsistenciaData> {
  if (!proyectoId) return {};

  const parseRows = (rows: any[]): AsistenciaData => {
    const r: AsistenciaData = {};
    for (const row of rows) {
      if (!row.estado) continue;
      if (!r[row.proyecto]) r[row.proyecto] = {};
      if (!r[row.proyecto][row.anio_mes]) r[row.proyecto][row.anio_mes] = {};
      if (!r[row.proyecto][row.anio_mes][row.deportista_id]) r[row.proyecto][row.anio_mes][row.deportista_id] = {};
      r[row.proyecto][row.anio_mes][row.deportista_id][row.fecha] = row.estado;
    }
    return r;
  };

  // Local: extraer solo este proyecto del LS completo
  const localFull = lsGet<AsistenciaData>(LS_ASIST, {});
  const local: AsistenciaData = localFull[proyectoId]
    ? { [proyectoId]: localFull[proyectoId] }
    : {};

  // Intento 1: fetch() directo filtrado por proyecto
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado` +
      `&proyecto=eq.${encodeURIComponent(proyectoId)}&limit=5000`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const remote = parseRows(data);
        const merged = mergeAsistencia(local, remote);
        const full   = lsGet<AsistenciaData>(LS_ASIST, {});
        if (merged[proyectoId]) full[proyectoId] = merged[proyectoId];
        lsSet(LS_ASIST, full);
        return merged;
      }
    }
  } catch { /* fallback SDK */ }

  // Intento 2: SDK filtrado por proyecto
  try {
    const { data, error } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .eq('proyecto', proyectoId)
      .limit(5000);
    if (!error && Array.isArray(data)) {
      const remote = parseRows(data);
      const merged = mergeAsistencia(local, remote);
      const full   = lsGet<AsistenciaData>(LS_ASIST, {});
      if (merged[proyectoId]) full[proyectoId] = merged[proyectoId];
      lsSet(LS_ASIST, full);
      return merged;
    }
  } catch { /* ignore */ }

  return local;
}

/** Guarda asistencia de UN SOLO PROYECTO en Supabase y LS.
 *  Evita sobreescribir datos de otros proyectos/profes. Retorna true si todo OK. */
export async function saveAsistenciaProyecto(proyectoId: string, data: AsistenciaData): Promise<boolean> {
  // 1. Actualizar LS: solo este proyecto, sin tocar los demás
  const fullLocal = lsGet<AsistenciaData>(LS_ASIST, {});
  if (data[proyectoId]) fullLocal[proyectoId] = data[proyectoId];
  lsSet(LS_ASIST, fullLocal);

  // 2. Upsert solo filas del proyecto actual
  try {
    const rows: object[] = [];
    const proyData = data[proyectoId] ?? {};
    for (const [anio_mes, deps] of Object.entries(proyData)) {
      for (const [deportista_id, fechas] of Object.entries(deps)) {
        for (const [fecha, estado] of Object.entries(fechas)) {
          if (estado) rows.push({ proyecto: proyectoId, anio_mes, deportista_id, fecha, estado });
        }
      }
    }
    if (!rows.length) return true;
    let allOk = true;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('asistencia')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'proyecto,anio_mes,deportista_id,fecha' });
      if (error) { console.error('[db] saveAsistenciaProyecto chunk:', error.message); allOk = false; }
    }
    return allOk;
  } catch (e) {
    console.error('[db] saveAsistenciaProyecto:', e);
    return false;
  }
}

/** Elimina UNA marca de asistencia de Supabase (cuando el usuario la desmarca).
 *  También limpia LS para consistencia. */
export async function deleteAsistenciaFecha(
  proyectoId: string, anio_mes: string, deportistaId: string, fecha: string
): Promise<void> {
  // 1. Borrar de LS
  const full = lsGet<AsistenciaData>(LS_ASIST, {});
  if (full[proyectoId]?.[anio_mes]?.[deportistaId]) {
    const { [fecha]: _r, ...rest } = full[proyectoId][anio_mes][deportistaId];
    full[proyectoId][anio_mes][deportistaId] = rest;
    lsSet(LS_ASIST, full);
  }
  // 2. DELETE en Supabase
  try {
    await supabase()
      .from('asistencia')
      .delete()
      .eq('proyecto', proyectoId)
      .eq('anio_mes', anio_mes)
      .eq('deportista_id', deportistaId)
      .eq('fecha', fecha);
  } catch (e) { console.error('[db] deleteAsistenciaFecha:', e); }
}

/** Obtiene asistencia solo de UN deportista — consulta pequeña, ideal para móvil/calidoso. */
export async function getAsistenciaDeportista(proyectoId: string, deportistaId: string): Promise<AsistenciaData> {
  if (!proyectoId || !deportistaId) return {};

  const parse = (rows: any[]): AsistenciaData => {
    const r: AsistenciaData = {};
    for (const row of rows) {
      if (!row.estado) continue; // ignorar filas vacías
      if (!r[row.proyecto]) r[row.proyecto] = {};
      if (!r[row.proyecto][row.anio_mes]) r[row.proyecto][row.anio_mes] = {};
      if (!r[row.proyecto][row.anio_mes][row.deportista_id]) r[row.proyecto][row.anio_mes][row.deportista_id] = {};
      r[row.proyecto][row.anio_mes][row.deportista_id][row.fecha] = row.estado;
    }
    return r;
  };

  // Intento 1: fetch directo filtrado
  try {
    const url = `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado` +
      `&proyecto=eq.${encodeURIComponent(proyectoId)}&deportista_id=eq.${encodeURIComponent(deportistaId)}&limit=5000`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return parse(data);
    }
  } catch { /* fallback SDK */ }

  // Intento 2: SDK filtrado
  try {
    const { data } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .eq('proyecto', proyectoId)
      .eq('deportista_id', deportistaId)
      .limit(5000);
    if (data && data.length > 0) return parse(data);
  } catch { /* ignore */ }

  return {};
}

/** Guarda asistencia completa (upsert batch).
 *  Retorna true si todos los chunks se guardaron en Supabase, false si hubo algún error. */
export async function saveAsistencia(data: AsistenciaData): Promise<boolean> {
  lsSet(LS_ASIST, data);

  try {
    const rows: object[] = [];
    for (const [proyecto, meses] of Object.entries(data)) {
      for (const [anio_mes, deps] of Object.entries(meses)) {
        for (const [deportista_id, fechas] of Object.entries(deps)) {
          for (const [fecha, estado] of Object.entries(fechas)) {
            if (estado) rows.push({ proyecto, anio_mes, deportista_id, fecha, estado }); // no subir estados vacíos
          }
        }
      }
    }
    if (!rows.length) return true;
    let allOk = true;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('asistencia')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'proyecto,anio_mes,deportista_id,fecha' });
      if (error) { console.error('[db] saveAsistencia chunk:', error.message); allOk = false; }
    }
    return allOk;
  } catch (e) {
    console.error('[db] saveAsistencia:', e);
    return false;
  }
}

// ── VISTA CONTABLE ────────────────────────────────────────────

export type FilaVC = Record<string, string>; // { CÓDIGO, NOMBRE, MATRÍCULA, FEBRERO... }

const LS_VC = 'futuro_vista_contable';

/** Lee vista contable: Supabase primero, localStorage como fallback. */
export async function getVistaContable(): Promise<FilaVC[]> {
  try {
    const { data, error } = await supabase()
      .from('vista_contable')
      .select('deportista_id, nombre, valores');

    if (error) throw error;
    if (!data || !data.length) return lsGet<FilaVC[]>(LS_VC, []);

    const rows: FilaVC[] = data.map((r: any) => ({
      ...r.valores,
      _dep_id: r.deportista_id,
    }));
    lsSet(LS_VC, rows);
    return rows;
  } catch {
    return lsGet<FilaVC[]>(LS_VC, []);
  }
}

/** Guarda vista contable en Supabase y localStorage. */
export async function saveVistaContable(filas: FilaVC[]): Promise<void> {
  lsSet(LS_VC, filas);

  try {
    const rows = filas.map(f => ({
      deportista_id: f['CÓDIGO'] ?? f['_dep_id'] ?? String(Math.random()),
      nombre:        f['NOMBRE'] ?? '',
      valores:       f,
    }));

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('vista_contable')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'deportista_id' });
      if (error) console.error('[db] saveVistaContable chunk:', error.message);
    }
  } catch (e) {
    console.error('[db] saveVistaContable:', e);
  }
}

// ── BANCOS HISTÓRICO ──────────────────────────────────────────

const LS_BANCOS = 'futuro_bancos_historico';

/** Lee historial de bancos: Supabase primero, localStorage como fallback. */
export async function getBancosHistorico(): Promise<object[]> {
  try {
    const { data, error } = await supabase()
      .from('bancos_historico')
      .select('datos, batch_id, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || !data.length) return lsGet<object[]>(LS_BANCOS, []);

    // Aplanar todos los batches en un solo array
    const all: object[] = [];
    for (const batch of data) {
      if (Array.isArray(batch.datos)) all.push(...batch.datos);
    }
    lsSet(LS_BANCOS, all);
    return all;
  } catch {
    return lsGet<object[]>(LS_BANCOS, []);
  }
}

/** Guarda un nuevo batch del historial de bancos. */
export async function saveBancosHistorico(filas: object[]): Promise<void> {
  // Agregar al array existente en localStorage
  const prev = lsGet<object[]>(LS_BANCOS, []);
  const nuevo = [...prev, ...filas];
  lsSet(LS_BANCOS, nuevo);

  try {
    const batch_id = Date.now().toString();
    const { error } = await supabase()
      .from('bancos_historico')
      .insert({ datos: filas, batch_id });
    if (error) console.error('[db] saveBancosHistorico:', error.message);
  } catch (e) {
    console.error('[db] saveBancosHistorico:', e);
  }
}

/** Reemplaza todo el historial de bancos (para borrar/resetear). */
export async function setBancosHistorico(filas: object[]): Promise<void> {
  lsSet(LS_BANCOS, filas);

  try {
    // Borrar todos los batches existentes e insertar uno nuevo
    await supabase().from('bancos_historico').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (filas.length) {
      const { error } = await supabase()
        .from('bancos_historico')
        .insert({ datos: filas, batch_id: 'reset-' + Date.now() });
      if (error) console.error('[db] setBancosHistorico:', error.message);
    }
  } catch (e) {
    console.error('[db] setBancosHistorico:', e);
  }
}

// ── Gestión de Profes ─────────────────────────────────────────

export interface Profe {
  id:        string;   // uuid generado en cliente
  usuario:   string;   // apellido en mayúsculas (login)
  clave:     string;   // cédula
  proyectos: string[]; // proyectos a los que puede acceder
  foto?:     string;   // base64 foto de perfil (sync cross-device)
}

const LS_PROFES = 'futuro_profes';

// Profes iniciales — fallback garantizado si no hay BD ni caché.
// PROYECTOS SINCRONIZADOS con Supabase — actualizar aquí cuando cambien asignaciones.
const PROFES_INICIALES: Profe[] = [
  { id: 'pi-01', usuario: 'CASTRO',   clave: '1214734807', proyectos: ['SUB 8A','SUB 8B'] },
  { id: 'pi-02', usuario: 'MEJIA',    clave: '1152192324', proyectos: [] },
  { id: 'pi-03', usuario: 'RAMIREZ',  clave: '1017258984', proyectos: ['SUB 11A'] },
  { id: 'pi-04', usuario: 'SAMUEL',   clave: '1000415036', proyectos: ['SUB 12A','SUB 12B'] },
  { id: 'pi-05', usuario: 'TABARES',  clave: '1000084856', proyectos: ['SUB 9A','SUB 9B'] },
  { id: 'pi-06', usuario: 'CHALARCA', clave: '1128389946', proyectos: ['3','SUB 11B','SUB 15A'] },
  { id: 'pi-07', usuario: 'RIOS',     clave: '1036639022', proyectos: ['2','5','SUB 14A','SUB 14B','SUB 8C'] },
  { id: 'pi-08', usuario: 'JESUS',    clave: '1003404311', proyectos: ['SUB 10A','SUB 10B'] },
  { id: 'pi-09', usuario: 'MARTIN',   clave: '1013458275', proyectos: ['10','6','SUB 7A'] },
  { id: 'pi-10', usuario: 'MARLON',   clave: '1017192180', proyectos: ['4','8','80'] },
  { id: 'pi-11', usuario: 'ALEX',     clave: '1020464354', proyectos: ['40','45','46','47','48','48A','48B'] },
  { id: 'pi-12', usuario: 'DORIA',    clave: '1003050289', proyectos: ['20','21','52','55','57','59','SUB 8C'] },
  { id: 'pi-13', usuario: 'MUÑOZ',    clave: '1034776238', proyectos: ['22','33','34','35','36'] },
  { id: 'pi-14', usuario: 'ALVAREZ',  clave: '1033180115', proyectos: ['41','42','SUB 13C','SUB 15B'] },
  { id: 'pi-15', usuario: 'DUVAN',    clave: '1002066215', proyectos: ['51','54','56','60','SUB 9C'] },
  { id: 'pi-16', usuario: 'GIRALDO',  clave: '1127792656', proyectos: ['31','SUB 10C','SUB 12C'] },
  { id: 'pi-17', usuario: 'NICOLAS',  clave: '1005372826', proyectos: ['30','50','53','61','SUB 7B'] },
  { id: 'pi-18', usuario: 'KAREN',    clave: '1000870631', proyectos: ['11','12A','12B','13'] },
  { id: 'pi-19', usuario: 'CAMILA',   clave: '1193081467', proyectos: ['23','24','25'] },
  { id: 'pi-20', usuario: 'EDGAR',    clave: '98539787',   proyectos: ['32','34','7','SUB 11C','SUB 13C'] },
  { id: 'pi-21', usuario: 'JIMENEZ',  clave: '1036864427', proyectos: ['43','44'] },
  { id: 'pi-22', usuario: 'GUZMAN',   clave: '1000203538', proyectos: [] },
];

/** Convierte una fila cruda de Supabase al tipo Profe */
function rowToProfe(r: any): Profe {
  return {
    id:        r.id        ?? '',
    usuario:   r.usuario   ?? '',
    clave:     r.clave     ?? '',
    proyectos: Array.isArray(r.proyectos) ? r.proyectos : [],
    foto:      r.foto      ?? '',
  };
}

export async function getProfes(): Promise<Profe[]> {

  // ── Intento 1: API route de Vercel (proxy — siempre alcanzable desde mobile) ──
  try {
    const res = await fetch('/api/profes', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lista: Profe[] = data.map(rowToProfe);
        lsSet(LS_PROFES, lista);
        return lista;
      }
    }
  } catch { /* intentar fetch directo */ }

  // ── Intento 2: fetch() nativo directo a Supabase ──
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profes?select=*&order=usuario`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lista: Profe[] = data.map(rowToProfe);
        lsSet(LS_PROFES, lista);
        return lista;
      }
    }
  } catch { /* intentar SDK */ }

  // ── Intento 3: SDK de Supabase ──
  try {
    const { data, error } = await supabase()
      .from('profes')
      .select('*')
      .order('usuario');
    if (!error && Array.isArray(data) && data.length > 0) {
      const lista: Profe[] = data.map(rowToProfe);
      lsSet(LS_PROFES, lista);
      return lista;
    }
  } catch { /* ignorar */ }

  // ── Intento 4: localStorage ──
  const cached = lsGet<Profe[]>(LS_PROFES, []);
  if (cached && cached.length && cached.some(p => p.proyectos.length > 0)) {
    return cached;
  }

  // ── Fallback final: lista hardcodeada con proyectos actualizados ──
  return PROFES_INICIALES;
}

export async function saveProfes(lista: Profe[]): Promise<{ ok: boolean; msg?: string }> {
  lsSet(LS_PROFES, lista);

  if (!lista.length) return { ok: true };

  const rows = lista.map(p => ({
    id:        p.id,
    usuario:   p.usuario,
    clave:     p.clave,
    proyectos: p.proyectos,
    foto:      p.foto ?? '',
  }));

  // Intento 1: upsert por id (funciona si el id ya existe en Supabase)
  try {
    const { error } = await supabase()
      .from('profes')
      .upsert(rows, { onConflict: 'id' });
    if (!error) return { ok: true };
    console.warn('[db] saveProfes upsert/id:', error.message);
  } catch (e: any) {
    console.warn('[db] saveProfes upsert/id catch:', e?.message);
  }

  // Intento 2: actualizar fila por fila (no usa DELETE, solo UPDATE/INSERT)
  try {
    for (const row of rows) {
      // Intentar UPDATE por usuario
      const { data, error: updErr } = await supabase()
        .from('profes')
        .update({ clave: row.clave, proyectos: row.proyectos, foto: row.foto })
        .eq('usuario', row.usuario)
        .select('id');
      if (updErr) {
        console.warn('[db] update', row.usuario, updErr.message);
        continue;
      }
      // Si no actualizó ninguna fila, insertar
      if (!data || data.length === 0) {
        const { error: insErr } = await supabase().from('profes').insert(row);
        if (insErr) console.warn('[db] insert', row.usuario, insErr.message);
      }
    }
    return { ok: true };
  } catch (e: any) {
    console.error('[db] saveProfes fallback:', e);
    return { ok: false, msg: String(e?.message ?? e) };
  }
}

// ── EVALUACIONES (Valoración deportiva — historial real) ───────

export interface Evaluacion {
  id: string; fecha: string; codigo: string; nombre: string; edad: string;
  proyecto: string; perfil: string; posicion: string;
  torneos: string; partJugados: string; tarjAmarillas: string; partTitular: string;
  tarjRojas: string; minutosJugados: string; goles: string; calificacion: string;
  foto: string;
  fuerzaNivel: string; fuerzaDesc: string;
  velocidadNivel: string; velocidadDesc: string;
  resistenciaNivel: string; resistenciaDesc: string;
  controlNivel: string; controlDesc: string;
  paseNivel: string; paseDesc: string;
  remataNivel: string; remataDesc: string;
  conductaNivel: string; conductaDesc: string;
  posicionNivel: string; posicionDesc: string;
  visionNivel: string; visionDesc: string;
  defensaNivel: string; defensaDesc: string;
  actitudNivel: string; actitudDesc: string;
  disciplinaNivel: string; disciplinaDesc: string;
  trabajoNivel: string; trabajoDesc: string;
  observaciones: string;
}

const LS_EVALUACIONES = 'futuro_evaluaciones';

/** Lee el historial de evaluaciones, opcionalmente filtrado por código de deportista. */
export async function getEvaluaciones(codigo?: string): Promise<Evaluacion[]> {
  try {
    let query = supabase().from('evaluaciones').select('*').order('created_at', { ascending: false });
    if (codigo) query = query.eq('codigo', codigo.trim().toUpperCase());
    const { data, error } = await query;
    if (error) throw error;

    const lista: Evaluacion[] = (data ?? []).map((r: any) => ({
      id: r.id, fecha: r.fecha, codigo: r.codigo, nombre: r.nombre ?? '', edad: r.edad ?? '',
      proyecto: r.proyecto ?? '', perfil: r.perfil ?? '', posicion: r.posicion ?? '',
      torneos: r.torneos ?? '', partJugados: r.part_jugados ?? '', tarjAmarillas: r.tarj_amarillas ?? '',
      partTitular: r.part_titular ?? '', tarjRojas: r.tarj_rojas ?? '', minutosJugados: r.minutos_jugados ?? '',
      goles: r.goles ?? '', calificacion: r.calificacion ?? '', foto: r.foto ?? '',
      fuerzaNivel: r.fuerza_nivel ?? '', fuerzaDesc: r.fuerza_desc ?? '',
      velocidadNivel: r.velocidad_nivel ?? '', velocidadDesc: r.velocidad_desc ?? '',
      resistenciaNivel: r.resistencia_nivel ?? '', resistenciaDesc: r.resistencia_desc ?? '',
      controlNivel: r.control_nivel ?? '', controlDesc: r.control_desc ?? '',
      paseNivel: r.pase_nivel ?? '', paseDesc: r.pase_desc ?? '',
      remataNivel: r.remata_nivel ?? '', remataDesc: r.remata_desc ?? '',
      conductaNivel: r.conducta_nivel ?? '', conductaDesc: r.conducta_desc ?? '',
      posicionNivel: r.posicion_nivel ?? '', posicionDesc: r.posicion_desc ?? '',
      visionNivel: r.vision_nivel ?? '', visionDesc: r.vision_desc ?? '',
      defensaNivel: r.defensa_nivel ?? '', defensaDesc: r.defensa_desc ?? '',
      actitudNivel: r.actitud_nivel ?? '', actitudDesc: r.actitud_desc ?? '',
      disciplinaNivel: r.disciplina_nivel ?? '', disciplinaDesc: r.disciplina_desc ?? '',
      trabajoNivel: r.trabajo_nivel ?? '', trabajoDesc: r.trabajo_desc ?? '',
      observaciones: r.observaciones ?? '',
    }));
    lsSet(LS_EVALUACIONES, lista);
    return lista;
  } catch {
    const cached = lsGet<Evaluacion[]>(LS_EVALUACIONES, []);
    return codigo ? cached.filter(e => e.codigo === codigo.trim().toUpperCase()) : cached;
  }
}

/** Guarda una NUEVA evaluación (siempre inserta — cada guardado queda en el historial). */
export async function saveEvaluacion(data: Omit<Evaluacion, 'id'>): Promise<void> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const cached = lsGet<Evaluacion[]>(LS_EVALUACIONES, []);
  lsSet(LS_EVALUACIONES, [{ ...data, id }, ...cached]);

  try {
    const row = {
      id, fecha: data.fecha, codigo: data.codigo.trim().toUpperCase(), nombre: data.nombre, edad: data.edad,
      proyecto: data.proyecto, perfil: data.perfil, posicion: data.posicion,
      torneos: data.torneos, part_jugados: data.partJugados, tarj_amarillas: data.tarjAmarillas,
      part_titular: data.partTitular, tarj_rojas: data.tarjRojas, minutos_jugados: data.minutosJugados,
      goles: data.goles, calificacion: data.calificacion, foto: data.foto,
      fuerza_nivel: data.fuerzaNivel, fuerza_desc: data.fuerzaDesc,
      velocidad_nivel: data.velocidadNivel, velocidad_desc: data.velocidadDesc,
      resistencia_nivel: data.resistenciaNivel, resistencia_desc: data.resistenciaDesc,
      control_nivel: data.controlNivel, control_desc: data.controlDesc,
      pase_nivel: data.paseNivel, pase_desc: data.paseDesc,
      remata_nivel: data.remataNivel, remata_desc: data.remataDesc,
      conducta_nivel: data.conductaNivel, conducta_desc: data.conductaDesc,
      posicion_nivel: data.posicionNivel, posicion_desc: data.posicionDesc,
      vision_nivel: data.visionNivel, vision_desc: data.visionDesc,
      defensa_nivel: data.defensaNivel, defensa_desc: data.defensaDesc,
      actitud_nivel: data.actitudNivel, actitud_desc: data.actitudDesc,
      disciplina_nivel: data.disciplinaNivel, disciplina_desc: data.disciplinaDesc,
      trabajo_nivel: data.trabajoNivel, trabajo_desc: data.trabajoDesc,
      observaciones: data.observaciones,
    };
    const { error } = await supabase().from('evaluaciones').insert(row);
    if (error) console.error('[db] saveEvaluacion:', error.message);
  } catch (e) {
    console.error('[db] saveEvaluacion:', e);
  }
}

// ── SESIONES DE ENTRENAMIENTO ────────────────────────────────

export interface Sesion {
  id: string; fecha: string; proyecto: string; profesor: string;
  objetivo: string; ejercicios: string; observaciones: string;
}

const LS_SESIONES = 'futuro_sesiones';

/** Lee sesiones de entrenamiento, opcionalmente filtradas por proyecto. */
export async function getSesiones(proyecto?: string): Promise<Sesion[]> {
  try {
    let query = supabase().from('sesiones_entrenamiento').select('*').order('fecha', { ascending: false });
    if (proyecto) query = query.eq('proyecto', proyecto);
    const { data, error } = await query;
    if (error) throw error;

    const lista: Sesion[] = (data ?? []).map((r: any) => ({
      id: r.id, fecha: r.fecha, proyecto: r.proyecto, profesor: r.profesor ?? '',
      objetivo: r.objetivo ?? '', ejercicios: r.ejercicios ?? '', observaciones: r.observaciones ?? '',
    }));
    lsSet(LS_SESIONES, lista);
    return lista;
  } catch {
    const cached = lsGet<Sesion[]>(LS_SESIONES, []);
    return proyecto ? cached.filter(s => s.proyecto === proyecto) : cached;
  }
}

/** Guarda una nueva sesión de entrenamiento (siempre inserta). */
export async function saveSesion(data: Omit<Sesion, 'id'>): Promise<void> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const cached = lsGet<Sesion[]>(LS_SESIONES, []);
  lsSet(LS_SESIONES, [{ ...data, id }, ...cached]);

  try {
    const { error } = await supabase().from('sesiones_entrenamiento').insert({ id, ...data });
    if (error) console.error('[db] saveSesion:', error.message);
  } catch (e) {
    console.error('[db] saveSesion:', e);
  }
}

// ── POSTPARTIDO ──────────────────────────────────────────────

export interface DesempenoJugador { codigo: string; nombre: string; observacion: string; }

export interface Postpartido {
  id: string; fecha: string; proyecto: string; rival: string; resultado: string;
  observacionesGrupo: string; desempenoIndividual: DesempenoJugador[]; aprendizajes: string;
}

const LS_POSTPARTIDOS = 'futuro_postpartidos';

/** Lee postpartidos, opcionalmente filtrados por proyecto. */
export async function getPostpartidos(proyecto?: string): Promise<Postpartido[]> {
  try {
    let query = supabase().from('postpartidos').select('*').order('fecha', { ascending: false });
    if (proyecto) query = query.eq('proyecto', proyecto);
    const { data, error } = await query;
    if (error) throw error;

    const lista: Postpartido[] = (data ?? []).map((r: any) => ({
      id: r.id, fecha: r.fecha, proyecto: r.proyecto, rival: r.rival ?? '', resultado: r.resultado ?? '',
      observacionesGrupo: r.observaciones_grupo ?? '',
      desempenoIndividual: r.desempeno_individual ?? [],
      aprendizajes: r.aprendizajes ?? '',
    }));
    lsSet(LS_POSTPARTIDOS, lista);
    return lista;
  } catch {
    const cached = lsGet<Postpartido[]>(LS_POSTPARTIDOS, []);
    return proyecto ? cached.filter(p => p.proyecto === proyecto) : cached;
  }
}

/** Guarda un nuevo postpartido (siempre inserta). */
export async function savePostpartido(data: Omit<Postpartido, 'id'>): Promise<void> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const cached = lsGet<Postpartido[]>(LS_POSTPARTIDOS, []);
  lsSet(LS_POSTPARTIDOS, [{ ...data, id }, ...cached]);

  try {
    const row = {
      id, fecha: data.fecha, proyecto: data.proyecto, rival: data.rival, resultado: data.resultado,
      observaciones_grupo: data.observacionesGrupo, desempeno_individual: data.desempenoIndividual,
      aprendizajes: data.aprendizajes,
    };
    const { error } = await supabase().from('postpartidos').insert(row);
    if (error) console.error('[db] savePostpartido:', error.message);
  } catch (e) {
    console.error('[db] savePostpartido:', e);
  }
}

// ── CAL / COM (calificación mensual + competencia en torneo) ──
//
// Tabla Supabase: cal_com
// UNIQUE(proyecto, anio_mes, deportista_id)  ← upsert seguro por celda
// localStorage: claves futuro_cal_${proy}_${mesKey} / futuro_com_${proy}_${mesKey}
//               (mismo formato que usaba el código anterior — compatibilidad total)

/**
 * Sube a Supabase los deportistas que tienen CAL/COM en localStorage pero
 * que no existen en la BD remota (datos guardados antes del fix o con red caída).
 * Fire-and-forget: no bloquea la carga de la página.
 */
function syncOrphans(
  proyectoId: string,
  anio_mes: string,
  localCal: Record<string, string>,
  localCom: Record<string, string>,
  remoteCal: Record<string, string>,
  remoteCom: Record<string, string>
): void {
  // Reunir todos los deportista_id que tienen datos en localStorage
  const allLocalIds = new Set([
    ...Object.keys(localCal).filter(id => localCal[id]),
    ...Object.keys(localCom).filter(id => localCom[id]),
  ]);
  // IDs que Supabase ya conoce
  const allRemoteIds = new Set([...Object.keys(remoteCal), ...Object.keys(remoteCom)]);
  // Huérfanos: tienen datos en localStorage pero NO en Supabase
  const orphanIds = [...allLocalIds].filter(id => !allRemoteIds.has(id));
  if (orphanIds.length === 0) return;
  console.log(`[db] syncOrphans: ${orphanIds.length} entradas localStorage-only → subiendo a Supabase`);
  Promise.all(
    orphanIds.map(depId =>
      saveCalCom(proyectoId, anio_mes, depId, localCal[depId] ?? '', localCom[depId] ?? '')
    )
  ).catch(e => console.warn('[db] syncOrphans error:', e));
}

/**
 * Carga CAL y COM de Supabase para un proyecto + mes específicos.
 * Mergea con localStorage: Supabase sobreescribe por deportista_id cuando
 * tiene valor, localStorage cubre los deportistas que Supabase aún no tiene.
 * Retorna { cal: Record<depId, valor>, com: Record<depId, valor> }
 */
export async function getCalComPorProyecto(
  proyectoId: string,
  anio_mes: string
): Promise<{ cal: Record<string, string>; com: Record<string, string> }> {
  const lsCalKey = `futuro_cal_${proyectoId}_${anio_mes}`;
  const lsComKey = `futuro_com_${proyectoId}_${anio_mes}`;
  const localCal = lsGet<Record<string, string>>(lsCalKey, {});
  const localCom = lsGet<Record<string, string>>(lsComKey, {});

  function parseRows(data: any[]): { cal: Record<string, string>; com: Record<string, string> } {
    const cal: Record<string, string> = {};
    const com: Record<string, string> = {};
    for (const r of data) {
      if (r.cal && r.deportista_id) cal[r.deportista_id] = r.cal;
      if (r.com && r.deportista_id) com[r.deportista_id] = r.com;
    }
    return { cal, com };
  }

  function persist(cal: Record<string, string>, com: Record<string, string>) {
    lsSet(lsCalKey, cal);
    lsSet(lsComKey, com);
  }

  // Intento 1: fetch() directo a Supabase (evita CORS preflight en móvil)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cal_com?select=deportista_id,cal,com` +
      `&proyecto=eq.${encodeURIComponent(proyectoId)}` +
      `&anio_mes=eq.${encodeURIComponent(anio_mes)}` +
      `&limit=10000`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const { cal: remoteCal, com: remoteCom } = parseRows(data);
        // Supabase gana sobre localStorage por deportista (tiene la última escritura real)
        const mergedCal = { ...localCal, ...remoteCal };
        const mergedCom = { ...localCom, ...remoteCom };
        persist(mergedCal, mergedCom);
        // Subir entradas que solo existen en localStorage (sin conexión anterior o pre-fix)
        syncOrphans(proyectoId, anio_mes, localCal, localCom, remoteCal, remoteCom);
        return { cal: mergedCal, com: mergedCom };
      }
    }
  } catch { /* fallback SDK */ }

  // Intento 2: SDK Supabase
  try {
    const { data, error } = await supabase()
      .from('cal_com')
      .select('deportista_id, cal, com')
      .eq('proyecto', proyectoId)
      .eq('anio_mes', anio_mes);
    if (!error && Array.isArray(data)) {
      const { cal: remoteCal, com: remoteCom } = parseRows(data);
      const mergedCal = { ...localCal, ...remoteCal };
      const mergedCom = { ...localCom, ...remoteCom };
      persist(mergedCal, mergedCom);
      // Subir entradas que solo existen en localStorage (sin conexión anterior o pre-fix)
      syncOrphans(proyectoId, anio_mes, localCal, localCom, remoteCal, remoteCom);
      return { cal: mergedCal, com: mergedCom };
    }
  } catch { /* ignorar */ }

  // Fallback: solo localStorage (sin red)
  return { cal: localCal, com: localCom };
}

/**
 * Upsert inmediato de CAL y COM para UN deportista específico.
 * Llamado en cada cambio de celda — el UNIQUE constraint garantiza idempotencia.
 * Escribe localStorage primero (UI optimista), luego Supabase (fuente de verdad).
 *
 * NOTA: pasar el valor actual del OTRO campo para no pisarlo en el upsert.
 * Ejemplo: cuando el profe cambia CAL, pasar com=comMap[depId]?? ''
 */
export async function saveCalCom(
  proyectoId: string,
  anio_mes: string,
  deportistaId: string,
  cal: string,
  com: string
): Promise<void> {
  // 1. Caché localStorage (respuesta inmediata sin esperar red)
  const lsCalKey = `futuro_cal_${proyectoId}_${anio_mes}`;
  const lsComKey = `futuro_com_${proyectoId}_${anio_mes}`;
  const calMap = lsGet<Record<string, string>>(lsCalKey, {});
  const comMap = lsGet<Record<string, string>>(lsComKey, {});
  calMap[deportistaId] = cal;
  comMap[deportistaId] = com;
  lsSet(lsCalKey, calMap);
  lsSet(lsComKey, comMap);

  // 2. Supabase upsert (fuente de verdad — idempotente por UNIQUE constraint)
  //    Intento 1: fetch() directo (evita CORS preflight en móvil — mismo patrón
  //    que usan todas las demás funciones de escritura en este archivo).
  const row = {
    proyecto:      proyectoId,
    anio_mes,
    deportista_id: deportistaId,
    cal:           cal || null,   // NULL en BD cuando no hay valor (más limpio que '')
    com:           com || null,
  };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cal_com?on_conflict=proyecto%2Canio_mes%2Cdeportista_id`,
      {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify(row),
      }
    );
    if (res.ok || res.status === 201) {
      return; // éxito — no necesitamos el SDK
    }
    // Respuesta no-ok: loggear y caer al SDK
    const errText = await res.text().catch(() => res.status.toString());
    console.warn('[db] saveCalCom fetch() no-ok, usando SDK. Status:', res.status, errText);
  } catch (e) {
    console.warn('[db] saveCalCom fetch() falló, usando SDK:', e);
  }

  //    Intento 2: SDK Supabase (fallback cuando fetch() falla por red o CORS)
  try {
    const { error } = await supabase()
      .from('cal_com')
      .upsert(row, { onConflict: 'proyecto,anio_mes,deportista_id' });
    if (error) console.error('[db] saveCalCom SDK:', error.message);
  } catch (e) {
    console.error('[db] saveCalCom SDK:', e);
  }
}

// ── FOTOS PROFES ──────────────────────────────────────────────
// La tabla `profes` ya tiene columna `foto text` (nullable).
// Se identifica al profe por su campo `usuario` (apellido en mayúsculas).

/**
 * Carga las fotos de todos los profes desde Supabase.
 * Retorna { [usuario]: base64 } — compatible con la clave FOTOS_PROFE_KEY
 * que usa AlumnosPageContent.
 */
export async function getFotosProfes(): Promise<Record<string, string>> {
  const lsKey = 'futuro_fotos_profes';
  const local  = lsGet<Record<string, string>>(lsKey, {});

  // Intento 1: fetch() directo filtrado (solo filas con foto)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profes?select=usuario,foto&foto=not.is.null`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const remote: Record<string, string> = {};
        for (const r of data) {
          // Excluir strings vacíos que son el DEFAULT de la columna
          if (r.usuario && r.foto && r.foto.length > 10) remote[r.usuario] = r.foto;
        }
        const merged = { ...local, ...remote };
        lsSet(lsKey, merged);
        return merged;
      }
    }
  } catch { /* fallback SDK */ }

  // Intento 2: SDK Supabase
  try {
    const { data } = await supabase()
      .from('profes')
      .select('usuario, foto')
      .not('foto', 'is', null);
    if (data && data.length > 0) {
      const remote: Record<string, string> = {};
      for (const r of data) {
        if (r.usuario && r.foto && r.foto.length > 10) remote[r.usuario] = r.foto;
      }
      const merged = { ...local, ...remote };
      lsSet(lsKey, merged);
      return merged;
    }
  } catch { /* ignorar */ }

  return local;
}

/**
 * Guarda la foto de un profe en Supabase (columna `foto` de la tabla `profes`)
 * y en localStorage.  Se identifica por `usuario` (apellido en mayúsculas).
 */
export async function saveFotoProfe(usuario: string, base64: string): Promise<void> {
  // 1. localStorage inmediato
  const lsKey = 'futuro_fotos_profes';
  const fotos  = lsGet<Record<string, string>>(lsKey, {});
  fotos[usuario] = base64;
  lsSet(lsKey, fotos);

  // 2. Supabase: UPDATE por usuario (la fila ya existe — no usar insert)
  try {
    const { error } = await supabase()
      .from('profes')
      .update({ foto: base64 })
      .eq('usuario', usuario);
    if (error) console.error('[db] saveFotoProfe:', error.message);
  } catch (e) {
    console.error('[db] saveFotoProfe:', e);
  }
}
