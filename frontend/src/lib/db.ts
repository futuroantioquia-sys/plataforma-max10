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
  // EXCLUYE columnas COD-prefijo (ej: "COD. DEPORTISTA", "CÓDIGO ALUMNO")
  // y verifica que el valor no sea un código numérico puro.
  const key1 = Object.keys(cols).find(k => {
    const t = k.trim();
    if (/^c[oó]d/i.test(t)) return false; // excluir "COD DEPORTISTA", etc.
    return /deportista|alumno|jugador|atleta/i.test(t);
  });
  if (key1 && cols[key1]?.trim() && !/^\d+$/.test(cols[key1].trim())) {
    return cols[key1].trim();
  }

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

/** Convierte fila cruda de Supabase al tipo Deportista.
 *
 * FIX Bug C: columnas puede llegar como objeto JS (JSONB parseado) o como
 * string (TEXT/JSON sin parsear), dependiendo de cómo declara el retorno
 * la función PostgreSQL `buscar_calidoso`. Se parsea en ambos casos.
 */
function rowToDeportista(r: any): Deportista {
  let cols: Record<string, unknown> = {};

  if (r.columnas !== null && r.columnas !== undefined) {
    if (typeof r.columnas === 'string') {
      // La función RPC devolvió columnas como TEXT → parsear manualmente
      try {
        cols = JSON.parse(r.columnas);
      } catch {
        console.warn('[rowToDeportista] columnas no es JSON válido:', String(r.columnas).slice(0, 100));
        cols = {};
      }
    } else if (typeof r.columnas === 'object') {
      cols = r.columnas as Record<string, unknown>;
    }
  }

  return {
    id:        r.id,
    _nombre:   derivarNombre(r.nombre ?? '', cols as Record<string, string>),
    _columnas: cols as Record<string, string>,
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
    _columnas: d._columnas ?? {},
    _nombre: derivarNombre(d._nombre, d._columnas ?? {}),
  }));
  if (result.length) _cacheDeportistas = result;
  return result;
}

/**
 * Búsqueda rápida: retorna solo los deportistas cuyo CÓDIGO coincida.
 * Llama al endpoint /api/calidoso-login que hace UNA query a Supabase (vía RPC).
 * Si el RPC falla, intenta query directa al SDK.
 * Fallback final a caché en memoria o localStorage.
 */
export async function buscarPorCodigo(codigo: string): Promise<Deportista[]> {
  const RX_COD = /^c[oó]d/i;

  // ── Intento 1: endpoint rápido vía RPC buscar_calidoso ──
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
      // FIX Bug A + Bug B: leer cabecera de error que ahora expone route.ts
      const rpcErr = res.headers.get('X-Calidoso-Error');
      if (rpcErr) {
        console.error('[buscarPorCodigo] RPC reportó error:', rpcErr, '→ intentando SDK directo');
      } else {
        console.warn('[buscarPorCodigo] RPC OK pero 0 resultados para código:', codigo, '→ intentando SDK directo');
      }
    } else {
      console.error('[buscarPorCodigo] API HTTP', res.status, '→ intentando SDK directo');
    }
  } catch (e: any) {
    // FIX Bug A: ya no es silencioso — se loguea el error real
    const isTimeout = e?.name === 'AbortError';
    console.error('[buscarPorCodigo] fetch error:', isTimeout ? 'TIMEOUT 8s' : (e?.message ?? e), '→ intentando SDK directo');
  }

  // ── Intento 2: query directa SDK — bypass RPC (funciona aunque buscar_calidoso no exista) ──
  // FIX Bug D: prueba varias variantes del nombre de la columna "código" en el JSONB
  try {
    const LLAVES_CODIGO = [
      'CÓDIGO', 'CODIGO', 'CÓD', 'COD',
      'CÓDIGO DEPORTISTA', 'CODIGO DEPORTISTA',
      'COD. DEPORTISTA', 'CÓD. DEPORTISTA',
    ];
    for (const llave of LLAVES_CODIGO) {
      const { data, error } = await supabase()
        .from('deportistas')
        .select('id, nombre, columnas')
        .eq(`columnas->>${llave}`, codigo)
        .limit(5);
      if (error) {
        // Error esperado si la llave no existe en el JSONB — continuar
        continue;
      }
      if (data && data.length > 0) {
        console.log('[buscarPorCodigo] SDK directo OK con llave de código:', llave);
        return data.map(rowToDeportista);
      }
    }
    console.warn('[buscarPorCodigo] SDK directo: ninguna llave de código encontró resultados para:', codigo);
  } catch (e: any) {
    console.error('[buscarPorCodigo] SDK directo catch:', e?.message);
  }

  // ── Fallback final: filtrar la caché en memoria o localStorage ──
  const fuente = _cacheDeportistas ?? lsGet<Deportista[]>(LS_DEPS, []);
  if (fuente.length > 0) {
    console.log('[buscarPorCodigo] usando caché local:', fuente.length, 'deportistas totales');
  } else {
    console.warn('[buscarPorCodigo] caché local vacía — login fallará si RPC y SDK fallaron');
  }
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

  // Fallback 4: filtrar desde caché en memoria o localStorage
  try {
    const cached = _cacheDeportistas ?? lsGet<Deportista[]>(LS_DEPS, []);
    if (cached.length > 0) {
      const proyLower = proyecto.trim().toLowerCase();
      const filtered = cached.filter(dep => {
        const cols = dep._columnas ?? {};
        const k = Object.keys(cols).find(k => /^proy/i.test(k));
        const val = k ? String(cols[k]).trim().toLowerCase() : '';
        return val === proyLower;
      });
      if (filtered.length > 0) {
        console.log(`[getDeportistasPorProyecto] cache fallback: ${filtered.length} deportistas para "${proyecto}"`);
        return { data: filtered, error: null };
      }
    }
  } catch (e: any) {
    errores.push(`Cache fallback error: ${e?.message}`);
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

  // ── Intento 1: fetch() nativo paginado (recorre todas las páginas) ──
  try {
    const sbHeaders = {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
    };
    const data = await fetchAllPages(
      `${SUPABASE_URL}/rest/v1/pagos_estado?select=deportista_id,detalle,estado,v_pagado,v_cargado,destino,fecha`,
      sbHeaders,
      1000
    );
    if (data.length > 0) {
      const sbAll = parseSb(data);
      /* MERGE: localStorage (base completa) + Supabase (sobreescribe donde tiene datos).
         Nunca sobreescribir localStorage desde aquí — solo saveAllPagos escribe LS. */
      return { ...lsBase(), ...sbAll };
    }
  } catch { /* intentar SDK */ }

  // ── Intento 2: SDK paginado ──
  try {
    const all: any[] = [];
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase()
        .from('pagos_estado')
        .select('deportista_id, detalle, estado, v_pagado, v_cargado, destino, fecha')
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const sbAll = parseSb(all);
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

/**
 * Carga pagos SOLO para un conjunto de códigos/IDs de deportista.
 * Mucho más eficiente que getPagos() — siempre trae ≤20 filas sin importar
 * cuántos registros haya en total en pagos_estado.
 * Úsala en estado-cuenta donde ya conocemos el deportista.
 */
export async function getPagosPorCodigos(codigos: string[]): Promise<AllPagos> {
  if (!codigos.length) return {};

  /* ── Helper: parsear filas Supabase → AllPagos ── */
  const parseSb = (data: any[]): AllPagos => {
    const result: AllPagos = {};
    for (const r of data) {
      if (!result[r.deportista_id]) result[r.deportista_id] = [];
      result[r.deportista_id].push({
        detalle:  r.detalle,
        estado:   r.estado,
        vPagado:  r.v_pagado  ?? '',
        vCargado: r.v_cargado ?? '',
        destino:  r.destino   ?? '',
        fecha:    r.fecha     ?? '',
      });
    }
    return result;
  };

  /* ── Fallback localStorage: solo las claves que nos interesan ── */
  const lsBase = (): AllPagos => {
    const libroAll = lsGet<AllPagos>(LS_LIBRO, {});
    const lsAll    = lsGet<AllPagos>(LS_PAGOS, {});
    const merged   = { ...lsAll, ...libroAll };
    const filtrado: AllPagos = {};
    for (const cod of codigos) {
      if (merged[cod]) filtrado[cod] = merged[cod];
    }
    return filtrado;
  };

  const inClause = codigos.map(c => encodeURIComponent(c)).join(',');

  /* ── Intento 1: fetch() nativo con filtro in() ── */
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pagos_estado?select=deportista_id,detalle,estado,v_pagado,v_cargado,destino,fecha&deportista_id=in.(${inClause})`,
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
        return { ...lsBase(), ...parseSb(data) };
      }
    }
  } catch { /* intentar SDK */ }

  /* ── Intento 2: SDK ── */
  try {
    const { data, error } = await supabase()
      .from('pagos_estado')
      .select('deportista_id, detalle, estado, v_pagado, v_cargado, destino, fecha')
      .in('deportista_id', codigos);
    if (!error && data && data.length > 0) {
      return { ...lsBase(), ...parseSb(data) };
    }
  } catch { /* ignorar */ }

  return lsBase();
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
      .from('deportistas_fotos')
      .select('foto_base64')
      .eq('deportista_id', depId)
      .maybeSingle();

    if (error) throw error;
    if (data?.foto_base64) {
      // Guardar en localStorage también
      const fotos = lsGet<Record<string, string>>(LS_FOTOS, {});
      fotos[depId] = data.foto_base64;
      lsSet(LS_FOTOS, fotos);
      return data.foto_base64;
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
      .from('deportistas_fotos')
      .upsert({ deportista_id: depId, foto_base64: base64 }, { onConflict: 'deportista_id' });

    if (error) console.error('[db] saveFoto:', error.message);
  } catch (e) {
    console.error('[db] saveFoto:', e);
  }
}

// ── ASISTENCIA ────────────────────────────────────────────────

// [proyecto][anio_mes][deportistaId][fecha] = Estado
export type AsistenciaData = Record<string, Record<string, Record<string, Record<string, string>>>>;

const LS_ASIST = 'futuro_asistencia';

/** Lee asistencia completa: fetch() directo → SDK → localStorage. */
export async function getAsistencia(): Promise<AsistenciaData> {
  const parseAsistRows = (data: any[]): AsistenciaData => {
    const result: AsistenciaData = {};
    for (const r of data) {
      if (!result[r.proyecto]) result[r.proyecto] = {};
      if (!result[r.proyecto][r.anio_mes]) result[r.proyecto][r.anio_mes] = {};
      if (!result[r.proyecto][r.anio_mes][r.deportista_id]) result[r.proyecto][r.anio_mes][r.deportista_id] = {};
      result[r.proyecto][r.anio_mes][r.deportista_id][r.fecha] = r.estado;
    }
    return result;
  };

  // ── Intento 1: fetch() nativo (con límite para evitar payloads masivos) ──
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&limit=5000&order=anio_mes.desc`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'count=none',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const result = parseAsistRows(data);
        lsSet(LS_ASIST, result);
        return result;
      }
    }
  } catch { /* intentar SDK */ }

  // ── Intento 2: SDK ──
  try {
    const { data, error } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .order('anio_mes', { ascending: false })
      .limit(5000);

    if (error) throw error;
    if (!data || !data.length) return lsGet<AsistenciaData>(LS_ASIST, {});

    const result = parseAsistRows(data);
    lsSet(LS_ASIST, result);
    return result;
  } catch {
    return lsGet<AsistenciaData>(LS_ASIST, {});
  }
}

/** Guarda asistencia completa (upsert batch). */
export async function saveAsistencia(data: AsistenciaData): Promise<void> {
  lsSet(LS_ASIST, data);

  try {
    const rows: object[] = [];
    for (const [proyecto, meses] of Object.entries(data)) {
      for (const [anio_mes, deps] of Object.entries(meses)) {
        for (const [deportista_id, fechas] of Object.entries(deps)) {
          for (const [fecha, estado] of Object.entries(fechas)) {
            rows.push({ proyecto, anio_mes, deportista_id, fecha, estado });
          }
        }
      }
    }
    if (!rows.length) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('asistencia')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'proyecto,anio_mes,deportista_id,fecha' });
      if (error) console.error('[db] saveAsistencia chunk:', error.message);
    }
  } catch (e) {
    console.error('[db] saveAsistencia:', e);
  }
}

/**
 * Carga asistencia de UN deportista específico (para vista calidoso).
 * Evita traer las 20k+ filas de todos los deportistas.
 */
export async function getAsistenciaDeportista(deportistaId: string): Promise<AsistenciaData> {
  const parse = (data: any[]): AsistenciaData => {
    const result: AsistenciaData = {};
    for (const r of data) {
      if (!result[r.proyecto]) result[r.proyecto] = {};
      if (!result[r.proyecto][r.anio_mes]) result[r.proyecto][r.anio_mes] = {};
      if (!result[r.proyecto][r.anio_mes][r.deportista_id]) result[r.proyecto][r.anio_mes][r.deportista_id] = {};
      result[r.proyecto][r.anio_mes][r.deportista_id][r.fecha] = r.estado;
    }
    return result;
  };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&deportista_id=eq.${encodeURIComponent(deportistaId)}&limit=2000&order=anio_mes.desc`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'count=none',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return parse(data);
    }
  } catch { /* ignorar */ }

  // Fallback: filtrar del localStorage si ya estaba cacheado
  try {
    const full = lsGet<AsistenciaData>(LS_ASIST, {});
    const result: AsistenciaData = {};
    for (const [proy, meses] of Object.entries(full)) {
      for (const [mes, deps] of Object.entries(meses)) {
        if (deps[deportistaId]) {
          if (!result[proy]) result[proy] = {};
          if (!result[proy][mes]) result[proy][mes] = {};
          result[proy][mes][deportistaId] = deps[deportistaId];
        }
      }
    }
    return result;
  } catch { return {}; }
}

/** Carga asistencia filtrada por proyecto (para profes — evita cargar todo). */
export async function getAsistenciaPorProyecto(proyecto: string): Promise<AsistenciaData> {
  const parseRows = (data: any[]): AsistenciaData => {
    const result: AsistenciaData = {};
    for (const r of data) {
      if (!result[r.proyecto]) result[r.proyecto] = {};
      if (!result[r.proyecto][r.anio_mes]) result[r.proyecto][r.anio_mes] = {};
      if (!result[r.proyecto][r.anio_mes][r.deportista_id]) result[r.proyecto][r.anio_mes][r.deportista_id] = {};
      result[r.proyecto][r.anio_mes][r.deportista_id][r.fecha] = r.estado;
    }
    return result;
  };

  // Intento 1: fetch() nativo con filtro de proyecto
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&proyecto=eq.${encodeURIComponent(proyecto)}`,
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
      if (Array.isArray(data)) return parseRows(data);
    }
  } catch { /* intentar SDK */ }

  // Intento 2: SDK con filtro
  try {
    const { data, error } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .eq('proyecto', proyecto);
    if (!error && data) return parseRows(data);
  } catch {}

  // Fallback: localStorage (filtrado)
  const all = lsGet<AsistenciaData>(LS_ASIST, {});
  return all[proyecto] ? { [proyecto]: all[proyecto] } : {};
}

/**
 * Carga asistencia para una lista de deportista_ids.
 * Permite que los registros históricos sigan al deportista aunque cambie de proyecto.
 */
export async function getAsistenciaDeportistas(ids: string[]): Promise<AsistenciaData> {
  if (!ids.length) return {};

  const parseRows = (data: any[]): AsistenciaData => {
    const result: AsistenciaData = {};
    for (const r of data) {
      if (!result[r.proyecto]) result[r.proyecto] = {};
      if (!result[r.proyecto][r.anio_mes]) result[r.proyecto][r.anio_mes] = {};
      if (!result[r.proyecto][r.anio_mes][r.deportista_id]) result[r.proyecto][r.anio_mes][r.deportista_id] = {};
      result[r.proyecto][r.anio_mes][r.deportista_id][r.fecha] = r.estado;
    }
    return result;
  };

  // Supabase IN filter: deportista_id=in.(id1,id2,...)
  const inParam = `(${ids.map(id => encodeURIComponent(id)).join(',')})`;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&deportista_id=in.${inParam}&limit=10000&order=anio_mes.desc`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'count=none',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return parseRows(data);
    }
  } catch { /* fallback */ }

  // SDK fallback
  try {
    const { data, error } = await supabase()
      .from('asistencia')
      .select('proyecto, anio_mes, deportista_id, fecha, estado')
      .in('deportista_id', ids);
    if (!error && data && data.length > 0) return parseRows(data);
  } catch {}

  return {};
}

/** Guarda asistencia en localStorage inmediatamente (sin esperar Supabase). */
export function saveAsistenciaLocal(data: AsistenciaData): void {
  lsSet(LS_ASIST, data);
}

/**
 * Guarda asistencia de UN proyecto en Supabase (upsert).
 * Devuelve true si guardó OK, false si hubo error.
 */
export async function saveAsistenciaProyecto(proyecto: string, asistencia: AsistenciaData): Promise<boolean> {
  lsSet(LS_ASIST, asistencia);
  try {
    const proyData = asistencia[proyecto];
    if (!proyData) return true;
    const rows: object[] = [];
    for (const [anio_mes, deps] of Object.entries(proyData)) {
      for (const [deportista_id, fechas] of Object.entries(deps)) {
        for (const [fecha, estado] of Object.entries(fechas)) {
          if (estado) rows.push({ proyecto, anio_mes, deportista_id, fecha, estado });
        }
      }
    }
    if (!rows.length) return true;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase()
        .from('asistencia')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'proyecto,anio_mes,deportista_id,fecha' });
      if (error) { console.error('[db] saveAsistenciaProyecto:', error.message); return false; }
    }
    return true;
  } catch (e) {
    console.error('[db] saveAsistenciaProyecto:', e);
    return false;
  }
}

/** Elimina un registro de asistencia individual de Supabase (al desmarcar estado). */
export async function deleteAsistenciaFecha(
  proyecto: string, anio_mes: string, deportista_id: string, fecha: string
): Promise<void> {
  try {
    const { error } = await supabase()
      .from('asistencia')
      .delete()
      .match({ proyecto, anio_mes, deportista_id, fecha });
    if (error) console.error('[db] deleteAsistenciaFecha:', error.message);
  } catch (e) {
    console.error('[db] deleteAsistenciaFecha:', e);
  }
}

// ── DOCUMENTOS DEPORTISTA ────────────────────────────────────
// Tabla: documentos_deportista (deportista_id, tipo, nombre, datos, fecha)
// PK: (deportista_id, tipo) — tipos: 'ti' | 'rc' | 'eps'

export type DocTipo = 'ti' | 'rc' | 'eps';
export interface DocFile { nombre: string; datos: string; fecha: string; }
export type DocsDeportista = Partial<Record<DocTipo, DocFile>>;

/** Carga los documentos (TI/RC/EPS) de un deportista desde Supabase. */
export async function getDocumentos(deportistaId: string): Promise<DocsDeportista> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos_deportista?select=tipo,nombre,datos,fecha&deportista_id=eq.${encodeURIComponent(deportistaId)}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        const result: DocsDeportista = {};
        for (const r of rows) result[r.tipo as DocTipo] = { nombre: r.nombre, datos: r.datos, fecha: r.fecha };
        return result;
      }
    }
  } catch { /* SDK fallback */ }

  try {
    const { data, error } = await supabase()
      .from('documentos_deportista')
      .select('tipo, nombre, datos, fecha')
      .eq('deportista_id', deportistaId);
    if (!error && data) {
      const result: DocsDeportista = {};
      for (const r of data) result[r.tipo as DocTipo] = { nombre: r.nombre, datos: r.datos, fecha: r.fecha };
      return result;
    }
  } catch {}

  return {};
}

/** Guarda o actualiza un documento de un deportista en Supabase. */
export async function saveDocumento(deportistaId: string, tipo: DocTipo, doc: DocFile): Promise<void> {
  try {
    const { error } = await supabase()
      .from('documentos_deportista')
      .upsert(
        { deportista_id: deportistaId, tipo, nombre: doc.nombre, datos: doc.datos, fecha: doc.fecha },
        { onConflict: 'deportista_id,tipo' }
      );
    if (error) console.error('[db] saveDocumento:', error.message);
  } catch (e) { console.error('[db] saveDocumento:', e); }
}

/** Elimina un documento de un deportista en Supabase. */
export async function deleteDocumento(deportistaId: string, tipo: DocTipo): Promise<void> {
  try {
    const { error } = await supabase()
      .from('documentos_deportista')
      .delete()
      .match({ deportista_id: deportistaId, tipo });
    if (error) console.error('[db] deleteDocumento:', error.message);
  } catch (e) { console.error('[db] deleteDocumento:', e); }
}

// ── CALIFICACIONES ───────────────────────────────────────────
// Tabla: calificaciones (deportista_id TEXT, anio_mes TEXT, valor TEXT)
// PK: (deportista_id, anio_mes) — sigue al deportista aunque cambie de proyecto

/**
 * Lee calificaciones para una lista de deportista_ids y un mes.
 * Retorna { [deportista_id]: valor }
 */
export async function getCalificaciones(ids: string[], anioMes: string): Promise<Record<string, string>> {
  if (!ids.length) return {};

  const inParam = `(${ids.map(id => encodeURIComponent(id)).join(',')})`;

  // Intento 1: fetch() directo
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/calificaciones?select=deportista_id,valor&deportista_id=in.${inParam}&anio_mes=eq.${encodeURIComponent(anioMes)}`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'count=none',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const result: Record<string, string> = {};
        for (const r of data) result[r.deportista_id] = r.valor ?? '';
        return result;
      }
    }
  } catch { /* intentar SDK */ }

  // Intento 2: SDK
  try {
    const { data, error } = await supabase()
      .from('calificaciones')
      .select('deportista_id, valor')
      .in('deportista_id', ids)
      .eq('anio_mes', anioMes);
    if (!error && data) {
      const result: Record<string, string> = {};
      for (const r of data) result[r.deportista_id] = r.valor ?? '';
      return result;
    }
  } catch {}

  return {};
}

/**
 * Guarda/actualiza la calificación de un deportista para un mes.
 * Keyed por deportista_id — no por proyecto, así sobrevive traslados.
 */
export async function saveCalificacion(deportistaId: string, anioMes: string, valor: string): Promise<void> {
  try {
    const { error } = await supabase()
      .from('calificaciones')
      .upsert(
        { deportista_id: deportistaId, anio_mes: anioMes, valor },
        { onConflict: 'deportista_id,anio_mes' }
      );
    if (error) console.error('[db] saveCalificacion:', error.message);
  } catch (e) {
    console.error('[db] saveCalificacion:', e);
  }
}

// ── SOPORTES DE PAGO ─────────────────────────────────────────
// Tabla: soportes_pago (id, deportista_id, nombre, datos, fecha, meses[], confirmado, fecha_confirmacion)

export interface SoportePago {
  id: string;
  deportista_id: string;
  nombre: string;
  datos: string;
  fecha: string;
  meses: string[];
  confirmado: boolean;
  fecha_confirmacion: string | null;
  created_at: string;
}

/** Guarda un soporte de pago en Supabase (dual-save con localStorage). */
export async function saveSoportePago(
  deportistaId: string,
  soporte: { name: string; data: string; date: string; meses: string[] }
): Promise<void> {
  try {
    const { error } = await supabase()
      .from('soportes_pago')
      .insert({
        deportista_id: deportistaId,
        nombre: soporte.name,
        datos: soporte.data,
        fecha: soporte.date,
        meses: soporte.meses ?? [],
        confirmado: false,
      });
    if (error) console.error('[db] saveSoportePago:', error.message);
  } catch (e) { console.error('[db] saveSoportePago:', e); }
}

/** Carga todos los soportes pendientes (no confirmados) para el admin. */
export async function getSoportesPendientes(): Promise<SoportePago[]> {
  // Intento 1: fetch() directo (más portable en mobile)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?select=id,deportista_id,nombre,datos,fecha,meses,confirmado,fecha_confirmacion,created_at&confirmado=eq.false&order=created_at.desc`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'count=none',
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data as SoportePago[];
    }
  } catch { /* fallback */ }

  // Intento 2: SDK Supabase
  try {
    const { data, error } = await supabase()
      .from('soportes_pago')
      .select('id,deportista_id,nombre,datos,fecha,meses,confirmado,fecha_confirmacion,created_at')
      .eq('confirmado', false)
      .order('created_at', { ascending: false });
    if (!error && data) return data as SoportePago[];
  } catch {}

  return [];
}

/** Cuenta soportes pendientes (para badge del dashboard). */
export async function countSoportesPendientes(): Promise<number> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?select=id&confirmado=eq.false`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'count=exact',
          'Range':         '0-0',
        },
      }
    );
    if (res.ok) {
      const cr = res.headers.get('content-range');
      if (cr) { const m = cr.match(/\/(\d+)/); if (m) return parseInt(m[1]); }
      const data = await res.json();
      if (Array.isArray(data)) return data.length;
    }
  } catch {}
  return 0;
}

/** Marca un soporte como confirmado. */
export async function confirmarSoportePago(soporteId: string): Promise<void> {
  try {
    const { error } = await supabase()
      .from('soportes_pago')
      .update({
        confirmado: true,
        fecha_confirmacion: new Date().toLocaleDateString('es-CO'),
      })
      .eq('id', soporteId);
    if (error) console.error('[db] confirmarSoportePago:', error.message);
  } catch (e) { console.error('[db] confirmarSoportePago:', e); }
}

/** Elimina un soporte (cuando el admin rechaza). */
export async function eliminarSoportePago(soporteId: string): Promise<void> {
  try {
    const { error } = await supabase()
      .from('soportes_pago')
      .delete()
      .eq('id', soporteId);
    if (error) console.error('[db] eliminarSoportePago:', error.message);
  } catch (e) { console.error('[db] eliminarSoportePago:', e); }
}

/** Elimina soportes NO confirmados por deportista_id + nombre de archivo.
 *  Usado cuando el calidoso borra un soporte local → también lo elimina de Supabase. */
export async function eliminarSoportePorNombre(
  deportistaId: string,
  nombre: string,
): Promise<void> {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?deportista_id=eq.${encodeURIComponent(deportistaId)}&nombre=eq.${encodeURIComponent(nombre)}&confirmado=eq.false`,
      {
        method: 'DELETE',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'return=minimal',
        },
      }
    );
  } catch (e) { console.error('[db] eliminarSoportePorNombre:', e); }
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
