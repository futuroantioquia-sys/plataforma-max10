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
/* Mientras la primera lectura de pagos está en camino, cualquier otra parte de
   la pantalla que también los pida se PEGA a esa misma lectura en vez de
   arrancar otra. Antes, dos módulos abiertos al tiempo bajaban la tabla dos
   veces. — 27/08/2026 */
let _pagosEnCamino: Promise<AllPagos> | null = null;

/** Invalida la caché para forzar recarga desde Supabase */
export function invalidarCache() {
  _cacheDeportistas = null;
  _cachePagos       = null;
  _pagosEnCamino    = null;
}

// ── Helpers ──────────────────────────────────────────────────
function supabase() { return createClient(); }

/**
 * Deriva el nombre correcto del deportista.
 * Si el campo `nombre` es un código numérico (o está vacío),
 * busca en columnas alguna clave que represente el nombre real.
 */
/** Todo nombre de deportista se muestra SIEMPRE en MAYÚSCULA en la plataforma. */
function derivarNombre(nombre: string, columnas: Record<string, string>): string {
  return derivarNombreBase(nombre, columnas).toUpperCase();
}

function derivarNombreBase(nombre: string, columnas: Record<string, string>): string {
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
function lsSetDeps(_deps: Deportista[]) {
  // Ya no se guarda la lista completa en el navegador: son ~1.100 fichas y
  // desbordaban la cuota de 5 MB. La caché en memoria (_cacheDeportistas)
  // sigue funcionando mientras la pestaña esté abierta.
}

/** Fetch paginado: trae TODAS las páginas.
 *
 *  POR QUÉ SE CAMBIÓ (dirección, 27/08/2026): Control de Pagos se demoraba en
 *  abrir. La causa era esta función: pedía la página 1, ESPERABA a que llegara,
 *  pedía la página 2, esperaba, y así. Con ~7.000 pagos guardados eran siete
 *  viajes al servidor, uno detrás de otro, y el usuario esperando los siete.
 *
 *  Ahora se pide la primera página preguntando de una cuántos registros hay en
 *  total (eso lo contesta el servidor en el encabezado Content-Range). Sabiendo
 *  el total, las páginas que faltan se piden TODAS AL TIEMPO. Siete viajes en
 *  fila se convierten en uno más una tanda simultánea: el tiempo pasa a ser el
 *  de la página más lenta, no el de la suma de todas.
 *
 *  Si el servidor no contesta el total (un espejo viejo, un proxy que corta el
 *  encabezado), se sigue como antes, de página en página. Nunca se queda sin
 *  datos por esto.
 */
async function fetchAllPages(
  baseUrl: string,
  headers: Record<string, string>,
  pageSize = 1000
): Promise<any[]> {
  const MAX_PAGINAS = 60;                  // tope de seguridad: 60 000 filas

  const pedir = async (offset: number, contar: boolean): Promise<Response | null> => {
    try {
      return await fetch(`${baseUrl}&offset=${offset}&limit=${pageSize}`, {
        headers: {
          ...headers,
          'Range':  `${offset}-${offset + pageSize - 1}`,
          'Prefer': contar ? 'count=exact' : 'count=none',
        },
      });
    } catch { return null; }
  };

  /* ── Primera página, pidiendo el total ── */
  const primera = await pedir(0, true);
  if (!primera || !primera.ok) return [];
  let cabeza: any[] = [];
  try { cabeza = await primera.json(); } catch { return []; }
  if (!Array.isArray(cabeza) || cabeza.length === 0) return [];
  if (cabeza.length < pageSize) return cabeza;          // cabía todo en una

  /* ── ¿Cuántos hay en total? Viene como "0-999/7231" ── */
  const rango = primera.headers.get('content-range') || '';
  const total = Number((rango.split('/')[1] || '').trim());

  if (Number.isFinite(total) && total > 0) {
    // Se sabe el total: se piden de una vez TODAS las páginas que faltan.
    const offsets: number[] = [];
    for (let o = pageSize; o < total && offsets.length < MAX_PAGINAS; o += pageSize) {
      offsets.push(o);
    }
    const respuestas = await Promise.all(offsets.map(async o => {
      const r = await pedir(o, false);
      if (!r || !r.ok) return [] as any[];
      try {
        const d = await r.json();
        return Array.isArray(d) ? d : [];
      } catch { return [] as any[]; }
    }));
    const todo = cabeza.slice();
    for (const trozo of respuestas) todo.push(...trozo);
    return todo;
  }

  /* ── Sin total: como antes, una página detrás de otra ── */
  const all: any[] = cabeza.slice();
  let offset = pageSize;
  for (let i = 1; i < MAX_PAGINAS; i++) {
    const res = await pedir(offset, false);
    if (!res || !res.ok) break;
    let data: any;
    try { data = await res.json(); } catch { break; }
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;    // última página
    offset += pageSize;
  }
  return all;
}

/** Lee deportistas: proxy Vercel → fetch paginado → SDK paginado → localStorage. */
export async function getDeportistas(): Promise<Deportista[]> {
  if (_cacheDeportistas) return _cacheDeportistas;

  /* ── Limpieza única de la copia vieja del navegador ──────────────
     Versiones anteriores guardaban la lista COMPLETA de deportistas en
     localStorage ('futuro_deportistas'). Esa copia ya no se actualiza,
     pero el "Fallback" de más abajo todavía la puede leer, y entonces
     reaparecen fichas que YA fueron borradas de la nube (ej. el fantasma
     "NUEVO DEPORTISTA" del 15/08/2026). Se borra una sola vez por
     navegador para que la nube sea siempre la única fuente de verdad. */
  try {
    if (!localStorage.getItem('futuro_deps_ls_purgado_v1')) {
      localStorage.removeItem(LS_DEPS);
      localStorage.setItem('futuro_deps_ls_purgado_v1', '1');
    }
  } catch { /* noop */ }

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
/** Cuántos deportistas tiene cada proyecto, SIN bajarse las fichas.
 *
 *  ⚠ RENDIMIENTO (25/08/2026): la pantalla "Mis Proyectos" llamaba a
 *  getDeportistas(), que baja las MÁS DE MIL fichas completas de la academia,
 *  solo para escribir "25 deportistas" debajo de cada proyecto. En el celular
 *  del formador eso eran varios megas antes de ver nada.
 *
 *  Esto le pregunta al servidor únicamente el número (Prefer: count=exact con
 *  Range 0-0 no devuelve ni una fila), y solo de los proyectos del formador. */
export async function contarDeportistasPorProyecto(
  proyectos: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const lista = Array.from(new Set(
    (proyectos ?? []).map(p => String(p ?? '').trim()).filter(Boolean)
  ));
  if (!lista.length) return out;

  /* Camino bueno: que cuente el servidor de Vercel (una sola llamada, y allá
     sí se puede leer la cabecera con el total). */
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(
      `/api/deportistas?conteo=${encodeURIComponent(lista.join('|'))}`,
      { cache: 'no-store', signal: ctrl.signal }
    ).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const p of lista) {
          const n = Number((data as any)[p]);
          if (!Number.isNaN(n)) out[p] = n;
        }
        if (Object.keys(out).length) return out;
      }
    }
  } catch { /* se intenta el camino de abajo */ }

  /* Repuesto: contar desde el navegador. Se piden SOLO los id (nada de fichas
     ni fotos: son unos pocos kilobytes) y se cuentan las filas que llegan. No
     depende de leer cabeceras, que es lo que puede bloquear el navegador. */
  await Promise.all(lista.map(async proy => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/deportistas?select=id&columnas->>PROY=eq.${encodeURIComponent(proy)}`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (res.ok) {
        const filas = await res.json();
        if (Array.isArray(filas)) out[proy] = filas.length;
      }
    } catch { /* si falla, ese proyecto simplemente no muestra número */ }
  }));
  return out;
}

/** UNA sola ficha, por su id.
 *
 *  ⚠ RENDIMIENTO (25/08/2026): la pantalla de asistencia del deportista —la que
 *  abren los PADRES— llamaba a getDeportistas() y se bajaba las 1.163 fichas de
 *  la academia para encontrar UNA. En el celular de una familia eso son varios
 *  megas para ver a su propio hijo.
 *
 *  Devuelve null si no se encuentra (por ejemplo, los calidosos con id temporal
 *  tipo `dep-xxxx`): ahí quien llama puede recurrir a la lista completa. */
export async function getDeportistaPorId(id: string): Promise<Deportista | null> {
  const clean = String(id ?? '').trim();
  if (!clean) return null;

  // Si la lista ya está en memoria, no se pide nada.
  if (_cacheDeportistas) {
    const hit = _cacheDeportistas.find(d => d.id === clean);
    if (hit) return hit;
  }
  // Los ids temporales no son uuid: preguntar por ellos da error en el servidor.
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  if (!esUuid) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/deportistas?select=id,nombre,columnas&id=eq.${encodeURIComponent(clean)}&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, cache: 'no-store' },
    );
    if (res.ok) {
      const filas = await res.json();
      if (Array.isArray(filas) && filas[0]) return rowToDeportista(filas[0]);
    }
  } catch { /* sin conexión: quien llama decide qué hacer */ }
  return null;
}

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

/** Elimina UN deportista de la base de datos. Devuelve true si lo logro.

    La pantalla "General" ya la usaba, pero la funcion no estaba en este
    archivo: al oprimir Eliminar la pantalla reventaba con
    "eliminarDeportista is not a function".

    Borra SOLO la ficha del deportista. Sus pagos, asistencias y documentos
    no se tocan (quedan sin dueno), tal como advierte el mensaje de
    confirmacion que ve el usuario antes de borrar. */
export async function eliminarDeportista(id: string): Promise<boolean> {
  const dep = String(id ?? '').trim();
  if (!dep) return false;
  try {
    const { error } = await supabase().from('deportistas').delete().eq('id', dep);
    if (error) { console.error('[db] eliminarDeportista:', error.message); return false; }

    // Se saca tambien de la cache en memoria y del respaldo del navegador,
    // para que no reaparezca al cambiar de pantalla.
    if (_cacheDeportistas) _cacheDeportistas = _cacheDeportistas.filter(d => d.id !== dep);
    try {
      const guardados = lsGet<Deportista[]>(LS_DEPS, []);
      if (guardados.length) lsSetDeps(guardados.filter(d => d.id !== dep));
    } catch { /* el respaldo local es opcional */ }

    return true;
  } catch (e) {
    console.error('[db] eliminarDeportista:', e);
    return false;
  }
}

/** Guarda deportistas en Supabase (upsert) y en localStorage. */
export async function saveDeportistas(deps: Deportista[]): Promise<void> {
  /* ── BLINDAJE DE LOS DEPORTISTAS (20/08/2026) ────────────────────────────
     Esta función guarda TODOS los deportistas de una sola vez, escribiendo
     encima lo que tenga en memoria. El 20 de agosto ese mismo patrón, en la
     tabla de formadores, borró las claves de los 24 profes: la lista llegó
     incompleta y el "guardar" la escribió encima.
     Con 1.164 fichas, el mismo descuido borraría los datos de todos.
     Por eso ahora hay tres frenos:
       1. Si llega MUCHO menos de lo que hay, no se guarda nada.
       2. Una ficha SIN columnas nunca se escribe.
       3. La copia local solo se actualiza con lo que de verdad se guardó.  */

  const lista = Array.isArray(deps) ? deps : [];
  const previos = Array.isArray(_cacheDeportistas) ? _cacheDeportistas.length : 0;

  // FRENO 1 — llegó menos de la mitad de lo que ya había: algo salió mal.
  if (previos > 20 && lista.length < previos * 0.5) {
    console.error(
      `[db] saveDeportistas ABORTADO: llegaron ${lista.length} fichas y en memoria hay ${previos}. ` +
      'No se guarda nada para no borrar datos.',
    );
    return;
  }

  // FRENO 2 — fichas vacías (sin ninguna columna): no se escriben.
  const validos = lista.filter(d => d && d.id && Object.keys(d._columnas ?? {}).length > 0);
  const descartados = lista.length - validos.length;
  if (descartados > 0) {
    console.warn(`[db] saveDeportistas: ${descartados} ficha(s) sin datos — no se guardan para no borrar lo que hay.`);
  }
  if (!validos.length) {
    console.error('[db] saveDeportistas: no hay ninguna ficha con datos. No se guarda nada.');
    return;
  }

  try {
    const rows = validos.map(d => ({
      id:      d.id,
      nombre:  derivarNombre(d._nombre, d._columnas),
      columnas: d._columnas,
    }));

    const { error } = await supabase()
      .from('deportistas')
      .upsert(rows, { onConflict: 'id' });

    if (error) { console.error('[db] saveDeportistas:', error.message); return; }

    // FRENO 3 — la copia local solo se actualiza si el guardado salió bien.
    _cacheDeportistas = lista;
    lsSet(LS_DEPS, lista);
  } catch (e) {
    console.error('[db] saveDeportistas:', e);
  }
}

/** Actualiza las columnas (JSONB) de UN deportista y refresca la caché para que el
 *  cambio (p. ej. la cuota mensual manual) aplique en TODA la plataforma. */
export async function updateColumnasDeportista(id: string, columnas: Record<string, any>): Promise<boolean> {
  try {
    const { error } = await supabase()
      .from('deportistas')
      .update({ columnas })
      .eq('id', id);
    if (error) { console.error('[db] updateColumnasDeportista:', error.message); return false; }
    if (Array.isArray(_cacheDeportistas)) {
      _cacheDeportistas = _cacheDeportistas.map(d => d.id === id ? { ...d, _columnas: columnas } : d);
      lsSet(LS_DEPS, _cacheDeportistas);
    }
    return true;
  } catch (e) {
    console.error('[db] updateColumnasDeportista:', e);
    return false;
  }
}

// ── PAGOS ────────────────────────────────────────────────────

/** Lee todos los pagos: fetch() directo → SDK → localStorage.
 *
 *  SE RECUERDA LO YA LEÍDO (dirección, 27/08/2026). Antes, cada vez que se
 *  entraba a Control de Pagos —o se volvía de mirar un estado de cuenta— se
 *  bajaba otra vez la tabla ENTERA de pagos. Son miles de filas y la espera se
 *  sentía completa cada vez.
 *
 *  Ahora la lista queda guardada en la memoria de la pestaña: la primera vez se
 *  baja, y de ahí en adelante aparece de una. Cuando se marca un pago, se
 *  publica el libro o se borra todo, la memoria se bota sola y la próxima
 *  lectura vuelve a traer lo fresco (ver `olvidarPagos`), así que NUNCA se ve
 *  un dato viejo. Al recargar la página también se empieza de cero.
 *
 *  `getPagos(true)` obliga a bajarlos otra vez, por si se necesita.
 */
export async function getPagos(forzar = false): Promise<AllPagos> {
  if (!forzar && _cachePagos) return _cachePagos;
  if (!forzar && _pagosEnCamino) return _pagosEnCamino;

  const tarea = leerPagosDeVerdad();
  _pagosEnCamino = tarea;
  try {
    const res = await tarea;
    _cachePagos = res;
    return res;
  } finally {
    if (_pagosEnCamino === tarea) _pagosEnCamino = null;
  }
}

/** Bota lo que se tenga recordado de los pagos. Se llama sola después de
 *  cualquier cambio; también sirve para el botón de "actualizar". */
export function olvidarPagos(): void {
  _cachePagos     = null;
  _pagosEnCamino  = null;
}

async function leerPagosDeVerdad(): Promise<AllPagos> {
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

  /* NOTA: el estado de cuenta lee SOLO lo autorizado (pagos_estado). El libro
     dinámico NO se refleja aquí automáticamente; se publica manualmente con el
     botón "Actualizar estados de cuenta" del libro. */

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

  /* Cambió un pago: lo que se tenía recordado ya no sirve. La próxima pantalla
     que pida los pagos los vuelve a bajar frescos. — 27/08/2026 */
  olvidarPagos();

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

/**
 * PUBLICA pagos del libro dinámico al estado de cuenta (tabla pagos_estado).
 * Es una acción MANUAL/autorizada (se llama solo desde el botón del libro).
 * Solo escribe lo PAGADO (estado/v_pagado/destino/fecha); NO incluye v_cargado,
 * así el "cargado" (lo que debe pagar) queda intacto.
 */
export async function publicarPagosEstado(
  rows: { deportista_id: string; detalle: string; vPagado: string; destino: string; fecha: string }[],
): Promise<{ ok: boolean; n: number; msg?: string }> {
  if (!rows.length) return { ok: true, n: 0 };
  olvidarPagos();                    // se publicó: lo recordado ya no sirve
  const payload = rows.map(r => ({
    deportista_id: r.deportista_id,
    detalle:       r.detalle,
    estado:        'PAGÓ',
    v_pagado:      r.vPagado,
    destino:       r.destino,
    fecha:         r.fecha,
  }));
  try {
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase()
        .from('pagos_estado')
        .upsert(payload.slice(i, i + 500), { onConflict: 'deportista_id,detalle' });
      if (error) { console.error('[db] publicarPagosEstado:', error.message); return { ok: false, n: 0, msg: error.message }; }
    }
    return { ok: true, n: payload.length };
  } catch (e: any) {
    console.error('[db] publicarPagosEstado:', e);
    return { ok: false, n: 0, msg: String(e?.message ?? e) };
  }
}

/** Devuelve las claves "código|mes" que YA están PAGADAS en el estado de cuenta
 *  (para marcar en verde en el libro dinámico, de forma permanente). */
export async function getPagadosKeys(): Promise<string[]> {
  const out: string[] = [];
  const paso = 1000;
  try {
    const { count } = await supabase().from('pagos_estado').select('*', { count: 'exact', head: true });
    const total = count ?? 0;
    const nP = Math.ceil(total / paso);
    const reqs = [];
    for (let p = 0; p < nP; p++) reqs.push(supabase().from('pagos_estado').select('deportista_id,detalle,estado,v_pagado').range(p * paso, p * paso + paso - 1));
    const res = await Promise.all(reqs);
    for (const r of res) {
      for (const row of (((r as any).data || []) as any[])) {
        const est = String(row.estado || '');
        const vp = String(row.v_pagado || '').replace(/\D/g, '');
        const pagado = /PAG/i.test(est) || vp.length > 0;
        if (pagado && row.deportista_id && row.detalle) out.push(String(row.deportista_id) + '|' + String(row.detalle));
      }
    }
  } catch (e: any) { console.error('[db] getPagadosKeys', e?.message); }
  return out;
}

/** Borra TODOS los pagos del libro contable: localStorage + Supabase. */
export async function deleteAllPagos(): Promise<void> {
  /* 1. Limpiar localStorage */
  try { localStorage.removeItem(LS_LIBRO);  } catch {}
  try { localStorage.removeItem(LS_PAGOS);  } catch {}
  olvidarPagos();

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
  olvidarPagos();                    // se importó el libro: hay que releer
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

/** Cuenta las filas del Libro Contable en Supabase (código numérico) — compartido admin/contable. */
export async function countLibroPagos(): Promise<number> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/count_libro_pagos`,
      {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
        body: '{}',
      }
    );
    if (res.ok) {
      const n = await res.json();
      if (typeof n === 'number') return n;
    }
  } catch {}
  // Respaldo local (solo si falla la red)
  try {
    const raw = lsGet<Record<string, unknown[]>>(LS_LIBRO, {});
    return Object.values(raw).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  } catch { return 0; }
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
    if (data?.base64) return data.base64;   // sin copia en el navegador: ocupa demasiado
  } catch {}

  // Fallback localStorage
  const fotos = lsGet<Record<string, string>>(LS_FOTOS, {});
  return fotos[depId] ?? null;
}

/** Guarda foto en Supabase y localStorage. */

/* ============================================================
   COMPRESIÓN AUTOMÁTICA DE IMÁGENES AL SUBIR
   ------------------------------------------------------------
   Antes, cada foto o documento entraba tal como salía del celular:
   1,2 MB en promedio y hasta 11 MB. Eso llenó el cupo de la base
   y tumbó la plataforma el 17/08/2026.
   Ahora TODA imagen se reduce en el navegador ANTES de subirla.
   El archivo original del papá no se toca: solo se sube la copia liviana.
   ============================================================ */

/** Tamaño en KB de un texto base64 (para registrar en consola). */
function pesoKB(base64: string): number {
  return Math.round((String(base64 || '').length * 0.75) / 1024);
}

/**
 * Reduce una imagen en el navegador.
 * @param ladoMax  lado más largo permitido, en píxeles
 * @param calidad  0 a 1 (0.7 = documentos, 0.88 = fotos de deportistas)
 * @param topeKB   si aún pesa más que esto, vuelve a reducir
 */
export async function comprimirImagen(
  base64: string,
  ladoMax = 1600,
  calidad = 0.7,
  topeKB = 400,
): Promise<string> {
  const dato = String(base64 || '');
  if (!dato) return dato;

  // Los PDF no se pueden comprimir con este método: se dejan tal cual.
  if (!/^data:image\//i.test(dato)) return dato;
  if (typeof document === 'undefined') return dato;   // no hay navegador

  try {
    const img: HTMLImageElement = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('imagen ilegible'));
      i.src = dato;
    });

    let salida = dato;
    let lado = ladoMax;
    let q = calidad;

    // Hasta 4 pasadas: si sigue pesando de más, reduce un poco más.
    for (let intento = 0; intento < 4; intento++) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width  * escala));
      const h = Math.max(1, Math.round(img.height * escala));

      const lienzo = document.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      const ctx = lienzo.getContext('2d');
      if (!ctx) return dato;
      ctx.fillStyle = '#ffffff';          // fondo blanco: los PNG con
      ctx.fillRect(0, 0, w, h);           // transparencia no salen negros
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      salida = lienzo.toDataURL('image/jpeg', q);
      if (pesoKB(salida) <= topeKB) break;
      lado = Math.round(lado * 0.8);
      q = Math.max(0.5, q - 0.1);
    }

    // Si por lo que sea quedó más pesada que la original, se deja la original.
    if (salida.length >= dato.length) return dato;

    console.log(`[db] imagen comprimida: ${pesoKB(dato)} KB -> ${pesoKB(salida)} KB`);
    return salida;
  } catch (e) {
    console.error('[db] comprimirImagen:', e);
    return dato;   // ante cualquier falla, se sube la original
  }
}

export async function saveFoto(depId: string, base64: string): Promise<void> {
  // Las fotos YA NO se guardan en el navegador: pesan ~230 KB cada una y llenaban
  // el almacenamiento (tope ~5 MB), lo que tumbaba el inicio de sesión.

  // FOTO DEL DEPORTISTA: se conserva BUENA RESOLUCIÓN, porque se usa en la
  // tarjeta de cumpleaños y en la ficha. 1200 px y calidad alta.
  base64 = await comprimirImagen(base64, 1200, 0.88, 300);

  try {
    const { error } = await supabase()
      .from('fotos_deportistas')
      .upsert({ deportista_id: depId, base64: base64 }, { onConflict: 'deportista_id' });

    if (error) console.error('[db] saveFoto:', error.message);
  } catch (e) {
    console.error('[db] saveFoto:', e);
  }
}

/** Trae TODAS las fotos guardadas en la nube (deportista_id → base64).
 *  Sirve para que el admin/profe vea las fotos de todos los deportistas,
 *  no solo las que tenga en la memoria local de su dispositivo. */
/** Corta una lista larga en pedazos, para no armar URLs gigantes. */
function enPedazos<T>(lista: T[], tam: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

/** Fotos de los deportistas.
 *
 *  ⚠ RENDIMIENTO (25/08/2026): antes esta función SIEMPRE se traía la foto de
 *  TODOS los deportistas de la academia (más de mil imágenes en base64, decenas
 *  de MB) aunque el formador solo estuviera viendo los 25 niños de su proyecto.
 *  Eso era lo que hacía que la lista tardara tanto en el celular.
 *
 *  Ahora se le pueden pasar los `ids` que están en pantalla y trae solo esos.
 *  Sin `ids` sigue trayendo todas (lo usa el administrador). */
export async function getFotosDeportistas(ids?: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const hdr = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };
  const limpios = (ids ?? []).map(s => String(s ?? '').trim()).filter(Boolean);
  if (ids && limpios.length === 0) return map;   // pidió una lista vacía → nada que traer

  const urls = limpios.length
    ? enPedazos(limpios, 100).map(gr =>
        `${SUPABASE_URL}/rest/v1/fotos_deportistas?select=deportista_id,base64`
        + `&deportista_id=in.(${gr.map(id => `"${encodeURIComponent(id)}"`).join(',')})`)
    : [`${SUPABASE_URL}/rest/v1/fotos_deportistas?select=deportista_id,base64`];

  try {
    const respuestas = await Promise.all(urls.map(u => fetch(u, { headers: hdr })));
    for (const res of respuestas) {
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows)) {
        for (const r of rows) if (r.deportista_id && r.base64) map[r.deportista_id] = r.base64;
      }
    }
  } catch { /* noop */ }
  return map;
}

/** Devuelve el conjunto de deportista_id que tienen un TORNEO sin pagar (estado PEND). */
export async function getDeportistasDebenTorneo(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase()
      .from('otros_pagos')
      .select('deportista_id')
      .eq('tipo', 'torneo')
      .eq('estado', 'PEND');
    if (error) throw error;
    return new Set((data ?? []).map((r: any) => r.deportista_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

// ── ASISTENCIA ────────────────────────────────────────────────

// [proyecto][anio_mes][deportistaId][fecha] = Estado
export type AsistenciaData = Record<string, Record<string, Record<string, Record<string, string>>>>;

const LS_ASIST = 'futuro_asistencia';

/** Lee asistencia completa: fetch() directo → SDK → localStorage. */
/** Meses a los que limitar la consulta, en formato `2026_08`.
 *  Devuelve el pedazo de dirección para PostgREST, o '' si no hay límite. */
function filtroMeses(meses?: string[]): string {
  const lim = (meses ?? []).map(m => String(m ?? '').trim()).filter(Boolean);
  if (!lim.length) return '';
  return `&anio_mes=in.(${lim.map(m => encodeURIComponent(m)).join(',')})`;
}

/** Lee la asistencia.
 *
 *  ⚠ RENDIMIENTO (25/08/2026): antes SIEMPRE se traía la asistencia COMPLETA de
 *  la academia — todos los deportistas, todos los meses, todos los años. Son
 *  decenas de miles de filas que el servidor entrega de a 1.000, o sea decenas
 *  de viajes seguidos antes de poder pintar nada. Por eso el módulo tardaba
 *  tanto en abrir.
 *
 *  Ahora se le pasan los `meses` que de verdad se van a mostrar (normalmente
 *  los 12 del año seleccionado). Sin `meses` se comporta como antes. */
export async function getAsistencia(meses?: string[]): Promise<AsistenciaData> {
  const filtro = filtroMeses(meses);
  const limMeses = (meses ?? []).map(m => String(m ?? '').trim()).filter(Boolean);
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

  // ── Intento 1: fetch() nativo PAGINADO — trae TODOS los meses (sin tope de 5000) ──
  try {
    const data = await fetchAllPages(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado${filtro}&order=anio_mes.desc,id.asc`,
      {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
      },
      1000
    );
    if (Array.isArray(data) && data.length > 0) {
      const result = parseAsistRows(data);
      // La copia local solo se guarda cuando se trajo TODO; si se pidió un año
      // suelto, pisarla dejaría al resto de años sin respaldo.
      if (!limMeses.length) { try { lsSet(LS_ASIST, result); } catch {} }
      return result;
    }
  } catch { /* intentar SDK */ }

  // ── Intento 2: SDK PAGINADO ──
  try {
    const all: any[] = [];
    let offset = 0;
    for (let i = 0; i < 60; i++) {
      let q = supabase()
        .from('asistencia')
        .select('proyecto, anio_mes, deportista_id, fecha, estado')
        .order('anio_mes', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (limMeses.length) q = q.in('anio_mes', limMeses) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (!all.length) return lsGet<AsistenciaData>(LS_ASIST, {});

    const result = parseAsistRows(all);
    if (!limMeses.length) { try { lsSet(LS_ASIST, result); } catch {} }
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

  // Intento 1: fetch() nativo PAGINADO por proyecto (trae TODAS las filas, todos los meses)
  try {
    const data = await fetchAllPages(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&proyecto=eq.${encodeURIComponent(proyecto)}&order=id.asc`,
      {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
      },
      1000
    );
    if (Array.isArray(data) && data.length > 0) return parseRows(data);
  } catch { /* intentar SDK */ }

  // Intento 2: SDK PAGINADO con filtro
  try {
    const all: any[] = [];
    let offset = 0;
    for (let i = 0; i < 60; i++) {
      const { data, error } = await supabase()
        .from('asistencia')
        .select('proyecto, anio_mes, deportista_id, fecha, estado')
        .eq('proyecto', proyecto)
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (all.length) return parseRows(all);
  } catch {}

  // Fallback: localStorage (filtrado)
  const all = lsGet<AsistenciaData>(LS_ASIST, {});
  return all[proyecto] ? { [proyecto]: all[proyecto] } : {};
}

/**
 * Carga asistencia para una lista de deportista_ids.
 * Permite que los registros históricos sigan al deportista aunque cambie de proyecto.
 */
export async function getAsistenciaDeportistas(ids: string[], meses?: string[]): Promise<AsistenciaData> {
  if (!ids.length) return {};
  // Igual que getAsistencia: si se dicen los meses, se traen SOLO esos. Antes
  // se bajaba el historial completo de cada deportista. — 25/08/2026
  const filtro = filtroMeses(meses);
  const limMeses = (meses ?? []).map(m => String(m ?? '').trim()).filter(Boolean);

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
    const data = await fetchAllPages(
      `${SUPABASE_URL}/rest/v1/asistencia?select=proyecto,anio_mes,deportista_id,fecha,estado&deportista_id=in.${inParam}${filtro}&order=id.asc`,
      {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
      },
      1000
    );
    if (Array.isArray(data) && data.length > 0) return parseRows(data);
  } catch { /* fallback */ }

  // SDK fallback PAGINADO
  try {
    const all: any[] = [];
    let offset = 0;
    for (let i = 0; i < 60; i++) {
      let q = supabase()
        .from('asistencia')
        .select('proyecto, anio_mes, deportista_id, fecha, estado')
        .in('deportista_id', ids)
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (limMeses.length) q = q.in('anio_mes', limMeses) as typeof q;
      const { data, error } = await q;
      if (error) break;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (all.length) return parseRows(all);
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
// PK: (deportista_id, tipo) — tipos: 'ti' | 'rc' | 'eps' | 'notas'

export type DocTipo = 'ti' | 'rc' | 'eps' | 'notas';
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
  // Documentos escaneados: se reducen fuerte, solo hay que poder leerlos.
  doc = { ...doc, datos: await comprimirImagen(doc.datos, 1600, 0.7, 250) };
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

// ── CALIFICACIONES ESCOLARES (varias por deportista, renombrables) ──
// Tabla: calificaciones_escolares (id, deportista_id, nombre, datos, created_at)

export interface CalificacionEscolar { id: string; deportistaId: string; nombre: string; datos: string; createdAt: string; }

/** Lee las calificaciones escolares de un deportista (varias). */
export async function getCalificacionesEscolares(deportistaId: string): Promise<CalificacionEscolar[]> {
  try {
    const { data, error } = await supabase()
      .from('calificaciones_escolares')
      .select('id, deportista_id, nombre, datos, created_at')
      .eq('deportista_id', deportistaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, deportistaId: r.deportista_id ?? '', nombre: r.nombre ?? '', datos: r.datos ?? '', createdAt: r.created_at ?? '',
    }));
  } catch (e) { console.error('[db] getCalificacionesEscolares:', e); return []; }
}

/** Agrega una calificación escolar nueva. Devuelve la fila creada o null. */
export async function addCalificacionEscolar(deportistaId: string, nombre: string, datos: string): Promise<CalificacionEscolar | null> {
  // Boletines: se reducen fuerte, solo hay que poder leer las notas.
  datos = await comprimirImagen(datos, 1600, 0.7, 250);
  try {
    const { data, error } = await supabase()
      .from('calificaciones_escolares')
      .insert({ deportista_id: deportistaId, nombre: (nombre ?? '').trim() || 'Calificación', datos })
      .select('id, deportista_id, nombre, datos, created_at')
      .single();
    if (error) { console.error('[db] addCalificacionEscolar:', error.message); return null; }
    return { id: data.id, deportistaId: data.deportista_id ?? '', nombre: data.nombre ?? '', datos: data.datos ?? '', createdAt: data.created_at ?? '' };
  } catch (e) { console.error('[db] addCalificacionEscolar:', e); return null; }
}

/** Renombra una calificación escolar. */
export async function renameCalificacionEscolar(id: string, nombre: string): Promise<void> {
  try {
    const { error } = await supabase().from('calificaciones_escolares').update({ nombre: (nombre ?? '').trim() || 'Calificación' }).eq('id', id);
    if (error) console.error('[db] renameCalificacionEscolar:', error.message);
  } catch (e) { console.error('[db] renameCalificacionEscolar:', e); }
}

/** Elimina una calificación escolar. */
export async function deleteCalificacionEscolar(id: string): Promise<void> {
  try {
    const { error } = await supabase().from('calificaciones_escolares').delete().eq('id', id);
    if (error) console.error('[db] deleteCalificacionEscolar:', error.message);
  } catch (e) { console.error('[db] deleteCalificacionEscolar:', e); }
}

/**
 * Resumen de GESTIÓN para el consolidado de asistencia: quién tiene FOTO,
 * DOCUMENTO (TI o RC), EPS y CALIFICACIONES escolares. A diferencia de
 * getResumenDocumentos(), esta versión PAGINA: no se queda en las primeras 1000 filas.
 */
export async function getResumenGestion(): Promise<{ conFoto: Set<string>; conDoc: Set<string>; conEps: Set<string>; conCal: Set<string> }> {
  const conFoto = new Set<string>(), conDoc = new Set<string>(), conEps = new Set<string>(), conCal = new Set<string>();
  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
  try {
    const [docs, fotos, cals] = await Promise.all([
      fetchAllPages(`${SUPABASE_URL}/rest/v1/documentos_deportista?select=deportista_id,tipo&order=deportista_id.asc`, headers, 1000),
      fetchAllPages(`${SUPABASE_URL}/rest/v1/fotos_deportistas?select=deportista_id&order=deportista_id.asc`, headers, 1000),
      fetchAllPages(`${SUPABASE_URL}/rest/v1/calificaciones_escolares?select=deportista_id&order=deportista_id.asc`, headers, 1000),
    ]);
    for (const r of docs as any[]) {
      if (!r?.deportista_id) continue;
      const t = String(r.tipo || '').toLowerCase();
      if (t === 'eps') conEps.add(r.deportista_id);
      else if (t === 'ti' || t === 'rc') conDoc.add(r.deportista_id);
    }
    for (const r of fotos as any[]) if (r?.deportista_id) conFoto.add(r.deportista_id);
    for (const r of cals  as any[]) if (r?.deportista_id) conCal.add(r.deportista_id);
  } catch (e) {
    console.error('[db] getResumenGestion:', e);
  }
  return { conFoto, conDoc, conEps, conCal };
}

/** Resumen para el cuadro de proyecto: qué deportistas tienen documento, EPS y calificaciones. */
/** Quién tiene documento / EPS / notas escolares / foto.
 *  Con `ids` consulta solo esos deportistas (el formador ve un solo proyecto);
 *  sin `ids` consulta toda la academia. — 25/08/2026 */
export async function getResumenDocumentos(ids?: string[]): Promise<{ conDoc: Set<string>; conEps: Set<string>; conEsc: Set<string>; conFoto: Set<string> }> {
  const conDoc = new Set<string>(), conEps = new Set<string>(), conEsc = new Set<string>(), conFoto = new Set<string>();
  const limpios = (ids ?? []).map(s => String(s ?? '').trim()).filter(Boolean);
  if (ids && limpios.length === 0) return { conDoc, conEps, conEsc, conFoto };
  const soloEstos = (q: any): any => (limpios.length ? q.in('deportista_id', limpios) : q);
  try {
    const [docsRes, escRes, fotoRes] = await Promise.all([
      soloEstos(supabase().from('documentos_deportista').select('deportista_id, tipo')),
      soloEstos(supabase().from('calificaciones_escolares').select('deportista_id')),
      // Solo el id (sin base64): chequeo LIVIANO de "¿tiene foto?" sin descargar la imagen.
      soloEstos(supabase().from('fotos_deportistas').select('deportista_id').neq('base64', '')),
    ]);
    for (const r of (docsRes.data ?? []) as any[]) {
      if (r.tipo === 'eps') conEps.add(r.deportista_id);
      else if (r.tipo === 'ti' || r.tipo === 'rc') conDoc.add(r.deportista_id);
    }
    for (const r of (escRes.data ?? []) as any[]) conEsc.add(r.deportista_id);
    for (const r of (fotoRes.data ?? []) as any[]) if (r.deportista_id) conFoto.add(r.deportista_id);
  } catch (e) { console.error('[db] getResumenDocumentos:', e); }
  return { conDoc, conEps, conEsc, conFoto };
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
 * VALORACIONES DE TODO UN AÑO.
 * Devuelve, por deportista, el promedio de las valoraciones que tenga en ese
 * año, con un decimal. Lo usa el CONSOLIDADO de asistencias, que resume el año
 * entero y no un mes suelto. Si un deportista no tiene ninguna, no aparece.
 */
export async function getValoracionesAnio(ids: string[], anio: number | string): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const inParam = `(${ids.map(id => encodeURIComponent(id)).join(',')})`;
  const patron  = `${anio}\\_%`;   // 2026_01, 2026_02, … (la _ se escapa: es comodín en LIKE)

  const promediar = (filas: any[]): Record<string, string> => {
    const acum: Record<string, number[]> = {};
    for (const r of filas) {
      const n = parseFloat(String(r.valor ?? '').replace(',', '.'));
      if (!isFinite(n) || n <= 0) continue;
      (acum[r.deportista_id] = acum[r.deportista_id] || []).push(n);
    }
    const out: Record<string, string> = {};
    for (const [id, vals] of Object.entries(acum)) {
      if (!vals.length) continue;
      out[id] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
    }
    return out;
  };

  // Intento 1: fetch() directo
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/calificaciones?select=deportista_id,valor&deportista_id=in.${inParam}&anio_mes=like.${encodeURIComponent(patron)}`,
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
      if (Array.isArray(data)) return promediar(data);
    }
  } catch { /* intentar SDK */ }

  // Intento 2: SDK
  try {
    const { data, error } = await supabase()
      .from('calificaciones')
      .select('deportista_id, valor')
      .in('deportista_id', ids)
      .like('anio_mes', `${anio}\\_%`);
    if (!error && data) return promediar(data);
  } catch { /* ignorar */ }

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
/* ── BLINDAJE (22/08/2026) ────────────────────────────────────────────────────
   Varias funciones intentan primero la "portería de servidor" (/api/...) y, si
   falla, siguen por el camino directo a Supabase con la clave pública. El
   problema: también seguían cuando el servidor respondía "no autorizado", con
   lo cual el control de acceso quedaba anulado. Esta función distingue los dos
   casos: 401/403 significa PARAR. */
function accesoDenegado(r: Response): boolean {
  return r.status === 401 || r.status === 403;
}

export async function saveSoportePago(
  deportistaId: string,
  soporte: { name: string; data: string; date: string; meses: string[] }
): Promise<void> {
  // Soportes de pago: se reducen, solo hay que poder leer el comprobante.
  soporte = { ...soporte, data: await comprimirImagen(soporte.data, 1600, 0.7, 250) };

  // Portería de servidor primero (usa la llave maestra). Si no está lista, cae al método anterior.
  try {
    const r = await fetch('/api/pagos/soportes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deportistaId, nombre: soporte.name, datos: soporte.data, fecha: soporte.date, meses: soporte.meses ?? [] }),
    });
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok) return; }
  } catch {}

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

/** Carga los soportes NO confirmados de UN deportista desde Supabase.
 *  Se usa en la vista del calidoso para que sus soportes no dependan de
 *  localStorage (que se llena con los base64 y pierde datos). */
export async function getSoportesDeDeportista(deportistaIds: string | string[]): Promise<SoportePago[]> {
  const ids = (Array.isArray(deportistaIds) ? deportistaIds : [deportistaIds])
    .map(s => String(s ?? '').trim()).filter(Boolean);
  if (!ids.length) return [];
  // Portería de servidor primero
  try {
    const rr = await fetch(`/api/pagos/soportes?deportistaIds=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' });
    if (accesoDenegado(rr)) return [];   // el servidor dijo que no: no se busca por otro lado
    if (rr.ok) { const j = await rr.json().catch(() => null); if (j?.ok && Array.isArray(j.soportes)) return j.soportes as SoportePago[]; }
  } catch {}
  const inList = ids.map(v => `"${v.replace(/"/g, '')}"`).join(',');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?select=id,deportista_id,nombre,datos,fecha,meses,confirmado,fecha_confirmacion,created_at&deportista_id=in.(${encodeURIComponent(inList)})&confirmado=eq.false&order=created_at.desc`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) { const data = await res.json(); if (Array.isArray(data)) return data as SoportePago[]; }
  } catch {}
  try {
    const { data } = await supabase().from('soportes_pago').select('*').in('deportista_id', ids).eq('confirmado', false);
    return (data ?? []) as SoportePago[];
  } catch { return []; }
}

/** Carga todos los soportes pendientes (no confirmados) para el admin.
 *  IMPORTANTE: NO trae la imagen base64 (`datos`) para que la lista sea liviana y NUNCA falle
 *  por tamaño. La imagen de cada soporte se carga aparte con getSoporteDatos(id). */
export async function getSoportesPendientes(): Promise<SoportePago[]> {
  // Portería de servidor primero (lista liviana SIN imagen)
  try {
    const r = await fetch('/api/pagos/soportes', { cache: 'no-store' });
    if (accesoDenegado(r)) return [];   // el servidor dijo que no
    if (r.ok) {
      const j = await r.json().catch(() => null);
      if (j?.ok && Array.isArray(j.soportes)) {
        return j.soportes.map((s: any) => ({
          id: s.id, deportista_id: s.deportista_id ?? '', nombre: s.nombre ?? '', datos: '',
          fecha: s.fecha ?? '', meses: Array.isArray(s.meses) ? s.meses : [],
          confirmado: !!s.confirmado, fecha_confirmacion: s.fecha_confirmacion ?? null, created_at: s.created_at ?? '',
        })) as SoportePago[];
      }
    }
  } catch {}

  const mapear = (arr: any[]): SoportePago[] => arr.map((r: any) => ({
    id: r.id, deportista_id: r.deportista_id ?? '', nombre: r.nombre ?? '', datos: '',
    fecha: r.fecha ?? '', meses: Array.isArray(r.meses) ? r.meses : [],
    confirmado: !!r.confirmado, fecha_confirmacion: r.fecha_confirmacion ?? null,
    created_at: r.created_at ?? '',
  }));

  // Intento 1: fetch() directo — SIN datos (liviano)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?select=id,deportista_id,nombre,fecha,meses,confirmado,fecha_confirmacion,created_at&confirmado=eq.false&order=created_at.desc`,
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
      if (Array.isArray(data)) return mapear(data);
    }
  } catch { /* fallback */ }

  // Intento 2: SDK Supabase (también sin datos)
  try {
    const { data, error } = await supabase()
      .from('soportes_pago')
      .select('id,deportista_id,nombre,fecha,meses,confirmado,fecha_confirmacion,created_at')
      .eq('confirmado', false)
      .order('created_at', { ascending: false });
    if (!error && data) return mapear(data);
  } catch {}

  return [];
}

/** Carga la imagen/base64 (`datos`) de UN soporte por su id. Se usa perezosamente en la lista. */
export async function getSoporteDatos(soporteId: string): Promise<string> {
  if (!soporteId) return '';
  // Portería de servidor primero
  try {
    const r = await fetch(`/api/pagos/soportes/datos?id=${encodeURIComponent(soporteId)}`, { cache: 'no-store' });
    if (accesoDenegado(r)) return '';   // el servidor dijo que no
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok) return j.datos ?? ''; }
  } catch {}
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?select=datos&id=eq.${encodeURIComponent(soporteId)}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.datos) return String(data[0].datos);
    }
  } catch {}
  return '';
}

/** Cuenta soportes pendientes (para badge del dashboard). */
export async function countSoportesPendientes(): Promise<number> {
  // Portería de servidor primero
  try {
    const r = await fetch('/api/pagos/soportes?solo=count', { cache: 'no-store' });
    if (accesoDenegado(r)) return 0;   // el servidor dijo que no
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok && typeof j.count === 'number') return j.count; }
  } catch {}
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

/** Marca un soporte como confirmado. Devuelve true solo si REALMENTE se guardó. */
export async function confirmarSoportePago(soporteId: string): Promise<boolean> {
  // Portería de servidor primero
  try {
    const r = await fetch('/api/pagos/soportes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: soporteId }),
    });
    if (accesoDenegado(r)) return false;   // el servidor dijo que no
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok) return true; }
  } catch {}
  try {
    const { error } = await supabase()
      .from('soportes_pago')
      .update({
        confirmado: true,
        fecha_confirmacion: new Date().toLocaleDateString('es-CO'),
      })
      .eq('id', soporteId);
    if (error) { console.error('[db] confirmarSoportePago:', error.message); return false; }
    return true;
  } catch (e) { console.error('[db] confirmarSoportePago:', e); return false; }
}

/** Elimina un soporte (cuando el admin rechaza). Devuelve true solo si REALMENTE se borró. */
export async function eliminarSoportePago(soporteId: string): Promise<boolean> {
  // Portería de servidor primero
  try {
    const r = await fetch(`/api/pagos/soportes?id=${encodeURIComponent(soporteId)}`, { method: 'DELETE' });
    if (accesoDenegado(r)) return false;   // el servidor dijo que no
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok) return true; }
  } catch {}
  try {
    const { error } = await supabase()
      .from('soportes_pago')
      .delete()
      .eq('id', soporteId);
    if (error) { console.error('[db] eliminarSoportePago:', error.message); return false; }
    return true;
  } catch (e) { console.error('[db] eliminarSoportePago:', e); return false; }
}

/** Elimina soportes NO confirmados por nombre de archivo, cubriendo TODOS los
 *  posibles IDs del deportista (id de página, id real, código…), para que al
 *  borrar el calidoso su soporte también desaparezca de "Confirmar Pagos"
 *  aunque se haya guardado bajo otro identificador. */
export async function eliminarSoportePorNombre(
  deportistaIds: string | string[],
  nombre: string,
): Promise<void> {
  const ids = (Array.isArray(deportistaIds) ? deportistaIds : [deportistaIds])
    .map(s => String(s ?? '').trim()).filter(Boolean);
  if (!ids.length || !nombre) return;
  // Portería de servidor primero
  try {
    const r = await fetch(`/api/pagos/soportes?deportistaIds=${encodeURIComponent(ids.join(','))}&nombre=${encodeURIComponent(nombre)}`, { method: 'DELETE' });
    if (accesoDenegado(r)) return;   // el servidor dijo que no
    if (r.ok) { const j = await r.json().catch(() => null); if (j?.ok) return; }
  } catch {}
  const inList = ids.map(v => `"${v.replace(/"/g, '')}"`).join(',');
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/soportes_pago?deportista_id=in.(${encodeURIComponent(inList)})&nombre=eq.${encodeURIComponent(nombre)}&confirmado=eq.false`,
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
  nombre?:   string;   // nombre completo del formador
  proyectos: string[]; // proyectos a los que puede acceder
  foto?:     string;   // base64 foto de perfil (sync cross-device)
}

const LS_PROFES = 'futuro_profes';

// BLINDAJE (22/08/2026): aquí había una lista con el usuario y la CÉDULA de 22
// formadores. Como este archivo se compila dentro del JavaScript que descarga
// cualquier visitante, esas 22 cédulas —que además son sus contraseñas— quedaban
// publicadas en internet. La lista se eliminó por completo.

/** Convierte una fila cruda de Supabase al tipo Profe */
function rowToProfe(r: any): Profe {
  return {
    id:        r.id        ?? '',
    usuario:   r.usuario   ?? '',
    // Seguridad: la contraseña (cifrada) NO se envía al navegador. El campo va vacío;
    // si el admin escribe una nueva, se cifra al guardar; si lo deja vacío, no cambia.
    clave:     '',
    nombre:    r.nombre    ?? '',
    proyectos: Array.isArray(r.proyectos) ? r.proyectos : [],
    foto:      r.foto      ?? '',
  };
}

export async function getProfes(): Promise<Profe[]> {

  // ── Intento 1: API route de Vercel (proxy — siempre alcanzable desde mobile) ──
  try {
    const res = await fetch('/api/profes', { cache: 'no-store' });
    if (accesoDenegado(res)) return [];   // el servidor dijo que no
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
      `${SUPABASE_URL}/rest/v1/profes?select=id,usuario,nombre,proyectos,foto&order=usuario`,
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
      // Blindaje: nunca traer la columna `clave` al navegador.
      .select('id,usuario,nombre,proyectos,foto')
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

  // ── Sin datos: se devuelve vacío. Ya NO hay lista de respaldo con cédulas. ──
  return [];
}

export async function saveProfes(lista: Profe[]): Promise<{ ok: boolean; msg?: string }> {
  lsSet(LS_PROFES, lista);

  if (!lista.length) return { ok: true };

  /* PROTECCIÓN DE LAS CLAVES (20/08/2026)
     Esta función guarda TODOS los formadores, no solo el que se editó. Si la
     lista llega con la clave vacía —porque no se alcanzó a leer, o porque vino
     de una copia incompleta del navegador— guardar borraba la clave de TODOS y
     ningún profe podía volver a entrar. Ya pasó una vez.
     Regla: una clave vacía NUNCA se escribe. Si viene vacía, se deja la que
     tenga la base. */
  const conClave = (p: Profe) => String((p as any).clave ?? '').trim() !== '';

  const rows = lista.map(p => {
    const base: any = {
      id:        p.id,
      usuario:   p.usuario,
      nombre:    p.nombre ?? '',
      proyectos: p.proyectos,
      foto:      p.foto ?? '',
    };
    if (conClave(p)) base.clave = p.clave;   // solo si trae clave de verdad
    return base;
  });

  const sinClave = lista.filter(p => !conClave(p)).length;
  if (sinClave) console.warn(`[db] saveProfes: ${sinClave} formador(es) sin clave — no se les toca la clave guardada.`);

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
      // Ojo: `row` ya viene sin la casilla `clave` cuando venía vacía, así que
      // este update no puede borrarla.
      const patch: any = { nombre: row.nombre, proyectos: row.proyectos, foto: row.foto };
      if ((row as any).clave !== undefined) patch.clave = (row as any).clave;
      const { data, error: updErr } = await supabase()
        .from('profes')
        .update(patch)
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

/** Elimina un formador (por id) de Supabase y de la caché local. */
export async function deleteProfe(id: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    const cache = lsGet<Profe[]>(LS_PROFES, []);
    lsSet(LS_PROFES, cache.filter(p => p.id !== id));
  } catch { /* noop */ }
  try {
    const { error } = await supabase().from('profes').delete().eq('id', id);
    if (error) { console.error('[db] deleteProfe:', error.message); return { ok: false, msg: error.message }; }
    return { ok: true };
  } catch (e: any) {
    console.error('[db] deleteProfe:', e);
    return { ok: false, msg: String(e?.message ?? e) };
  }
}

// ── ADMINISTRADORES (contabilidad / deportivo) ────────────────
export interface Admin {
  id:      string;
  usuario: string;                          // login en mayúsculas
  clave:   string;                          // contraseña
  nombre:  string;                          // nombre visible
  /** Permisos:
   *   'total'        — acceso completo (deportivo + finanzas). 25/08/2026
   *   'contabilidad' — edita Finanzas; el resto lo ve en solo lectura
   *   'deportivo'    — todo menos Finanzas */
  tipo:    'total' | 'contabilidad' | 'deportivo';
  /** true = este administrador NO tiene contraseña guardada, así que NO PUEDE
   *  ENTRAR con ninguna. Lo calcula el servidor; la contraseña en sí nunca
   *  sale de allá. Se agregó el 26/08/2026 porque a Diana se le quedó la
   *  casilla vacía y no había forma de verlo: la pantalla se veía normal y el
   *  ingreso solo decía "usuario o contraseña incorrectos". */
  sinClave?: boolean;
}

/** Normaliza lo que venga de la base a uno de los tres tipos válidos. */
export function tipoAdmin(v: unknown): Admin['tipo'] {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'total' || t === 'contabilidad') return t;
  return 'deportivo';
}

export async function getAdmins(): Promise<Admin[]> {
  /* Se pide por la ruta del servidor /api/admins y NO directo a la base
     (26/08/2026). Dos razones:
       · esa ruta habla con la llave maestra, así que ve la tabla aunque los
         candados (RLS) estén puestos;
       · es la única que puede decir si un administrador quedó SIN CONTRASEÑA,
         porque mira la casilla allá y solo manda un sí/no. La contraseña sigue
         sin salir nunca del servidor.
     Si la ruta no responde, se cae al camino anterior para no dejar la
     pantalla vacía. */
  try {
    const res = await fetch('/api/admins', { cache: 'no-store' });
    if (res.ok) {
      const lista = await res.json();
      if (Array.isArray(lista)) {
        return lista.map((r: any) => ({
          id:      r.id ?? '',
          usuario: String(r.usuario ?? '').toUpperCase(),
          clave:   '',
          nombre:  r.nombre ?? '',
          tipo:    tipoAdmin(r.tipo),
          sinClave: !!r.sinClave,
        }));
      }
    }
  } catch (e: any) { console.warn('[db] getAdmins por /api/admins:', e?.message); }

  try {
    const { data, error } = await supabase()
      .from('admins')
      // Blindaje: nunca traer la columna `clave` al navegador.
      .select('id,usuario,nombre,tipo')
      .order('usuario');
    if (error) { console.warn('[db] getAdmins:', error.message); return []; }
    return (data || []).map((r: any) => ({
      id:      r.id ?? '',
      usuario: String(r.usuario ?? '').toUpperCase(),
      // Seguridad: la contraseña (cifrada) NO se envía al navegador (vacío = no cambiar).
      clave:   '',
      nombre:  r.nombre ?? '',
      tipo:    tipoAdmin(r.tipo),
    }));
  } catch (e: any) { console.error('[db] getAdmins:', e?.message); return []; }
}

export async function saveAdmin(a: Admin): Promise<{ ok: boolean; msg?: string }> {
  const row = {
    id:      a.id,
    usuario: String(a.usuario || '').trim().toUpperCase(),
    clave:   String(a.clave || '').trim(),
    nombre:  String(a.nombre || '').trim(),
    tipo:    tipoAdmin(a.tipo),
  };
  try {
    const { error } = await supabase().from('admins').upsert(row, { onConflict: 'id' });
    if (error) { console.error('[db] saveAdmin:', error.message); return { ok: false, msg: error.message }; }
    return { ok: true };
  } catch (e: any) { console.error('[db] saveAdmin:', e?.message); return { ok: false, msg: String(e?.message ?? e) }; }
}

export async function deleteAdmin(id: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    const { error } = await supabase().from('admins').delete().eq('id', id);
    if (error) { console.error('[db] deleteAdmin:', error.message); return { ok: false, msg: error.message }; }
    return { ok: true };
  } catch (e: any) { console.error('[db] deleteAdmin:', e?.message); return { ok: false, msg: String(e?.message ?? e) }; }
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
  // ── Campos completos de la Valoración Deportiva (se leen y se guardan) ──
  driblingNivel?: string; driblingDesc?: string;
  cabeceoNivel?: string; cabeceoDesc?: string;
  quiteNivel?: string; quiteDesc?: string;
  proteccionNivel?: string; proteccionDesc?: string;
  amplitudNivel?: string; amplitudDesc?: string;
  transicionNivel?: string; transicionDesc?: string;
  superioridadNivel?: string; superioridadDesc?: string;
  basculacionNivel?: string; basculacionDesc?: string;
  identidadNivel?: string; identidadDesc?: string;
  bloqueNivel?: string; bloqueDesc?: string;
  climaNivel?: string; climaDesc?: string;
  gestionCompNivel?: string; gestionCompDesc?: string;
  responsabilidad?: string; puntualidad?: string; disciplinaComp?: string; respeto?: string;
  tolerancia?: string; companerismo?: string; liderazgo?: string; trabajoEquipoComp?: string; sentidoPertenencia?: string;
  logrosTrimestre?: string; objetivosTrimestre?: string;
  periodoDesde?: string; periodoHasta?: string; numeroInforme?: string;
  equipoTrimestre?: string;
}

const LS_EVALUACIONES = 'futuro_evaluaciones';

/** Lee el historial de evaluaciones, opcionalmente filtrado por código de deportista. */
/** Marca si la ÚLTIMA lectura de evaluaciones salió del servidor (true) o de la
 *  copia guardada en este navegador (false). La pantalla de valoración la usa
 *  para avisarle al formador que está viendo datos viejos. */
export let ultimaLecturaEvaluacionesEnLinea = true;

export async function getEvaluaciones(codigo?: string): Promise<Evaluacion[]> {
  try {
    // Se intenta dos veces: en el celular del formador, con datos móviles, la
    // primera petición falla a menudo y antes se caía derecho a la copia vieja.
    const pedir = async () => {
      let query = supabase().from('evaluaciones').select('*').order('created_at', { ascending: false });
      if (codigo) query = query.eq('codigo', codigo.trim().toUpperCase());
      const r = await query;
      if (r.error) throw r.error;
      return r;
    };
    let data: any[] | null = null;
    try {
      ({ data } = await pedir());
    } catch {
      await new Promise(res => setTimeout(res, 900));
      ({ data } = await pedir());
    }
    ultimaLecturaEvaluacionesEnLinea = true;

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
      // ── Campos completos: se leen de vuelta para que al reabrir NO se pierdan ──
      driblingNivel: r.dribling_nivel ?? '', driblingDesc: r.dribling_desc ?? '',
      cabeceoNivel: r.cabeceo_nivel ?? '', cabeceoDesc: r.cabeceo_desc ?? '',
      quiteNivel: r.quite_nivel ?? '', quiteDesc: r.quite_desc ?? '',
      proteccionNivel: r.proteccion_nivel ?? '', proteccionDesc: r.proteccion_desc ?? '',
      amplitudNivel: r.amplitud_nivel ?? '', amplitudDesc: r.amplitud_desc ?? '',
      transicionNivel: r.transicion_nivel ?? '', transicionDesc: r.transicion_desc ?? '',
      superioridadNivel: r.superioridad_nivel ?? '', superioridadDesc: r.superioridad_desc ?? '',
      basculacionNivel: r.basculacion_nivel ?? '', basculacionDesc: r.basculacion_desc ?? '',
      identidadNivel: r.identidad_nivel ?? '', identidadDesc: r.identidad_desc ?? '',
      bloqueNivel: r.bloque_nivel ?? '', bloqueDesc: r.bloque_desc ?? '',
      climaNivel: r.clima_nivel ?? '', climaDesc: r.clima_desc ?? '',
      gestionCompNivel: r.gestion_comp_nivel ?? '', gestionCompDesc: r.gestion_comp_desc ?? '',
      responsabilidad: r.responsabilidad ?? '', puntualidad: r.puntualidad ?? '',
      disciplinaComp: r.disciplina_comp ?? '', respeto: r.respeto ?? '',
      tolerancia: r.tolerancia ?? '', companerismo: r.companerismo ?? '',
      liderazgo: r.liderazgo ?? '', trabajoEquipoComp: r.trabajo_equipo_comp ?? '',
      sentidoPertenencia: r.sentido_pertenencia ?? '',
      logrosTrimestre: r.logros_trimestre ?? '', objetivosTrimestre: r.objetivos_trimestre ?? '',
      periodoDesde: r.periodo_desde ?? '', periodoHasta: r.periodo_hasta ?? '', numeroInforme: r.numero_informe ?? '',
      equipoTrimestre: r.equipo_trimestre ?? '',
    }));
    // Solo se guarda la cache completa cuando se pidio TODO; si se pidio un
    // deportista puntual, pisar la cache dejaria al resto sin respaldo.
    if (!codigo) lsSet(LS_EVALUACIONES, lista);
    return lista;
  } catch (e) {
    console.warn('[db] getEvaluaciones: sin conexión, se muestra la copia de este navegador.', e);
    ultimaLecturaEvaluacionesEnLinea = false;
    const cached = lsGet<Evaluacion[]>(LS_EVALUACIONES, []);
    return codigo ? cached.filter(e => e.codigo === codigo.trim().toUpperCase()) : cached;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   RESUMEN DE VALORACIONES  (carga rápida)

   Las pantallas "Control de Informes" y el listado de deportistas solo
   necesitan saber QUE informes existen (codigo, numero y fecha), no el
   contenido completo de cada valoracion.

   getEvaluaciones() hace select('*'): decenas de columnas de texto MAS la
   foto en base64 de cada informe. Con miles de registros eso son varios MB
   en cada carga. Ademas PostgREST corta la respuesta en 1000 filas, por lo
   que faltaban informes de forma intermitente ("a veces si aparecen").

   Esta version pide 4 columnas y pagina de a 1000 hasta traerlas todas.
   ───────────────────────────────────────────────────────────────────────────── */
export interface EvaluacionResumen {
  id: string; codigo: string; fecha: string; numeroInforme: string;
  /** Cuántas casillas de valoración ya tienen algo, y cuántas se miran.
   *  Con esto el consolidado sabe si el informe está terminado o a medias. */
  llenos?: number;
  total?: number;
}

const LS_EVALS_RESUMEN = 'futuro_evaluaciones_resumen';

/** Resumen de informes. Con `codigos` trae solo los de esos deportistas
 *  (el formador ve un solo proyecto); sin `codigos` trae los de toda la
 *  academia, que es lo que necesita Control de Informes. — 25/08/2026 */
/* Las casillas que se miran para saber si un informe está terminado o a
   medias. Son las CATORCE valoraciones de siempre —las que tiene cualquier
   informe, sea del perfil que sea— más las observaciones. No se miran todas
   las casillas posibles a propósito: hay bloques que solo aplican a ciertos
   perfiles, y exigirlos marcaría como "a medias" informes que sí están
   completos. — 27/08/2026 */
const CAMPOS_AVANCE = [
  'fuerza_nivel', 'velocidad_nivel', 'resistencia_nivel', 'control_nivel',
  'pase_nivel', 'remata_nivel', 'conducta_nivel', 'posicion_nivel',
  'vision_nivel', 'defensa_nivel', 'actitud_nivel', 'disciplina_nivel',
  'trabajo_nivel', 'observaciones',
];

export async function getEvaluacionesResumen(codigos?: string[]): Promise<EvaluacionResumen[]> {
  const paso = 1000;
  const out: EvaluacionResumen[] = [];
  const cods = (codigos ?? []).map(c => String(c ?? '').trim().toUpperCase()).filter(Boolean);
  if (codigos && cods.length === 0) return out;
  try {
    for (let desde = 0; desde < 200000; desde += paso) {
      let q = supabase()
        .from('evaluaciones')
        .select('id, codigo, fecha, numero_informe, ' + CAMPOS_AVANCE.join(', '))
        .order('id', { ascending: true })
        .range(desde, desde + paso - 1);
      if (cods.length) q = q.in('codigo', cods) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      const lote = data ?? [];
      for (const r of lote as any[]) {
        /* ¿QUÉ TAN LLENO ESTÁ EL INFORME? (dirección, 27/08/2026)
           No basta con saber que el informe EXISTE: el formador puede haberlo
           abierto, puesto dos notas y dejarlo ahí. Se cuentan las casillas de
           nivel que ya tienen algo, y con eso el consolidado pinta el semáforo:
           ninguna = rojo, algunas = naranja, todas = verde. */
        const llenos = CAMPOS_AVANCE.filter(c => String((r as any)[c] ?? '').trim() !== '').length;
        out.push({
          id:            String(r.id ?? ''),
          codigo:        String(r.codigo ?? '').trim().toUpperCase(),
          fecha:         r.fecha ?? '',
          numeroInforme: String(r.numero_informe ?? '').trim(),
          llenos,
          total:         CAMPOS_AVANCE.length,
        });
      }
      if (lote.length < paso) break;
    }
    // Solo se guarda la copia cuando se pidió TODO; si se pidió un puñado de
    // códigos, pisarla dejaría al resto de la academia sin respaldo.
    if (!cods.length) lsSet(LS_EVALS_RESUMEN, out);
    return out;
  } catch {
    // Sin conexion: se usa lo ultimo que se alcanzo a guardar en este navegador.
    const cache = lsGet<EvaluacionResumen[]>(LS_EVALS_RESUMEN, []);
    return cods.length ? cache.filter(e => cods.includes(e.codigo)) : cache;
  }
}

/** Guarda una NUEVA evaluación (siempre inserta — cada guardado queda en el historial).
 *
 *  ⚠ IMPORTANTE (25/08/2026): antes esta función se TRAGABA los errores: si el
 *  insert fallaba solo escribía en la consola y la pantalla igual decía
 *  "¡Guardado!". Por eso varios formadores creían haber subido el informe y
 *  después no aparecía. Ahora, si falla, LANZA el error para que la pantalla
 *  pueda avisar de verdad. Devuelve el id de la fila insertada. */
export async function saveEvaluacion(data: Omit<Evaluacion, 'id'>): Promise<string> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  {
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
      // ── Fundamentos y aspectos adicionales del formato completo ──
      dribling_nivel: (data as any).driblingNivel ?? '',         dribling_desc: (data as any).driblingDesc ?? '',
      cabeceo_nivel: (data as any).cabeceoNivel ?? '',           cabeceo_desc: (data as any).cabeceoDesc ?? '',
      quite_nivel: (data as any).quiteNivel ?? '',               quite_desc: (data as any).quiteDesc ?? '',
      proteccion_nivel: (data as any).proteccionNivel ?? '',     proteccion_desc: (data as any).proteccionDesc ?? '',
      amplitud_nivel: (data as any).amplitudNivel ?? '',         amplitud_desc: (data as any).amplitudDesc ?? '',
      transicion_nivel: (data as any).transicionNivel ?? '',     transicion_desc: (data as any).transicionDesc ?? '',
      superioridad_nivel: (data as any).superioridadNivel ?? '', superioridad_desc: (data as any).superioridadDesc ?? '',
      basculacion_nivel: (data as any).basculacionNivel ?? '',   basculacion_desc: (data as any).basculacionDesc ?? '',
      identidad_nivel: (data as any).identidadNivel ?? '',       identidad_desc: (data as any).identidadDesc ?? '',
      bloque_nivel: (data as any).bloqueNivel ?? '',             bloque_desc: (data as any).bloqueDesc ?? '',
      clima_nivel: (data as any).climaNivel ?? '',               clima_desc: (data as any).climaDesc ?? '',
      gestion_comp_nivel: (data as any).gestionCompNivel ?? '',  gestion_comp_desc: (data as any).gestionCompDesc ?? '',
      responsabilidad: (data as any).responsabilidad ?? '',      puntualidad: (data as any).puntualidad ?? '',
      disciplina_comp: (data as any).disciplinaComp ?? '',       respeto: (data as any).respeto ?? '',
      tolerancia: (data as any).tolerancia ?? '',                companerismo: (data as any).companerismo ?? '',
      liderazgo: (data as any).liderazgo ?? '',                  trabajo_equipo_comp: (data as any).trabajoEquipoComp ?? '',
      sentido_pertenencia: (data as any).sentidoPertenencia ?? '',
      logros_trimestre: (data as any).logrosTrimestre ?? '',     objetivos_trimestre: (data as any).objetivosTrimestre ?? '',
      periodo_desde: (data as any).periodoDesde ?? '',           periodo_hasta: (data as any).periodoHasta ?? '',
      numero_informe: (data as any).numeroInforme ?? '',
      equipo_trimestre: (data as any).equipoTrimestre ?? '',
      observaciones: data.observaciones,
    };
    const { error } = await supabase().from('evaluaciones').insert(row);
    if (error) {
      console.error('[db] saveEvaluacion:', error.message);
      throw new Error(error.message || 'No se pudo guardar la valoración.');
    }
    // La copia local SOLO se guarda cuando el servidor confirmó. Antes se
    // escribía primero, así que un guardado fallido dejaba un informe fantasma
    // que el formador veía en su teléfono y nadie más.
    const cached = lsGet<Evaluacion[]>(LS_EVALUACIONES, []);
    lsSet(LS_EVALUACIONES, [{ ...data, id } as Evaluacion, ...cached]);
    return id;
  }
}

// ── MENSAJES (calidoso ⇄ administración) ─────────────────────

export type EmisorMensaje = 'calidoso' | 'admin' | 'profesor';
export type DestinoMensaje = 'profesor' | 'institucion';

export interface Mensaje {
  id: string;
  deportistaId: string;
  codigo: string;
  nombre: string;
  texto: string;
  de: EmisorMensaje;      // quién lo envió
  para: DestinoMensaje;   // a quién va dirigido (profesor o institución)
  proyecto: string;       // proyecto del deportista (para enrutar al profe)
  leido: boolean;         // para mensajes del calidoso: si el destinatario ya lo leyó
  createdAt: string;
}

const LS_MENSAJES = 'futuro_mensajes_db';

/** Envía un mensaje. `de` = quién lo envía; `para` = destinatario (profesor | institucion). */
export async function enviarMensaje(data: {
  deportistaId: string; codigo: string; nombre: string; texto: string;
  de?: EmisorMensaje; para?: DestinoMensaje; proyecto?: string;
}): Promise<boolean> {
  const texto = (data.texto ?? '').trim();
  if (!texto) return false;
  const de = data.de ?? 'calidoso';
  try {
    const { error } = await supabase().from('mensajes').insert({
      deportista_id: data.deportistaId ?? '',
      codigo: (data.codigo ?? '').trim(),
      nombre: (data.nombre ?? '').trim(),
      texto,
      de,
      para: data.para ?? 'institucion',
      proyecto: (data.proyecto ?? '').trim() || null,
      // Solo los mensajes del calidoso nacen "no leídos" (pendientes para el destinatario)
      leido: de !== 'calidoso',
    });
    if (error) { console.error('[db] enviarMensaje:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('[db] enviarMensaje:', e);
    return false;
  }
}

/** Lee los mensajes. Si se pasa `codigo`, solo los de ese deportista (para el calidoso). */
export async function getMensajes(codigo?: string): Promise<Mensaje[]> {
  try {
    let query = supabase().from('mensajes').select('*').order('created_at', { ascending: false });
    if (codigo) query = query.eq('codigo', codigo.trim());
    const { data, error } = await query;
    if (error) throw error;
    const lista: Mensaje[] = (data ?? []).map((r: any) => ({
      id: r.id,
      deportistaId: r.deportista_id ?? '',
      codigo: r.codigo ?? '',
      nombre: r.nombre ?? '',
      texto: r.texto ?? '',
      de: (r.de === 'admin' ? 'admin' : r.de === 'profesor' ? 'profesor' : 'calidoso') as EmisorMensaje,
      para: (r.para === 'profesor' ? 'profesor' : 'institucion') as DestinoMensaje,
      proyecto: r.proyecto ?? '',
      leido: !!r.leido,
      createdAt: r.created_at ?? '',
    }));
    lsSet(LS_MENSAJES, lista);
    return lista;
  } catch {
    const cached = lsGet<Mensaje[]>(LS_MENSAJES, []);
    return codigo ? cached.filter(m => m.codigo === codigo.trim()) : cached;
  }
}

/** Cuenta los mensajes de calidosos sin leer. `para` filtra por destinatario (institucion | profesor). */
export async function countMensajesNoLeidos(para?: DestinoMensaje): Promise<number> {
  try {
    let q = supabase()
      .from('mensajes')
      .select('*', { count: 'exact', head: true })
      .eq('leido', false)
      .eq('de', 'calidoso');
    if (para) q = q.eq('para', para);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch {
    return lsGet<Mensaje[]>(LS_MENSAJES, []).filter(m => !m.leido && m.de === 'calidoso' && (!para || m.para === para)).length;
  }
}

/** Marca un mensaje como leído. */
export async function marcarMensajeLeido(id: string): Promise<void> {
  try {
    const { error } = await supabase().from('mensajes').update({ leido: true }).eq('id', id);
    if (error) console.error('[db] marcarMensajeLeido:', error.message);
  } catch (e) {
    console.error('[db] marcarMensajeLeido:', e);
  }
}

/** Marca como leídos los mensajes del calidoso de una conversación. `para` limita al hilo profesor|institucion. */
export async function marcarConversacionLeida(codigo: string, para?: DestinoMensaje): Promise<void> {
  const cod = (codigo ?? '').trim();
  if (!cod) return;
  try {
    let q = supabase().from('mensajes')
      .update({ leido: true })
      .eq('codigo', cod)
      .eq('de', 'calidoso')
      .eq('leido', false);
    if (para) q = q.eq('para', para);
    const { error } = await q;
    if (error) console.error('[db] marcarConversacionLeida:', error.message);
  } catch (e) {
    console.error('[db] marcarConversacionLeida:', e);
  }
}

// ── JORNADA POR MES (días de entreno que el profe ajusta solo para un mes) ──

/** Lee TODOS los overrides de días por mes de un proyecto. Devuelve { [mesKey]: number[] }. */
export async function getJornadaMes(proyecto: string): Promise<Record<string, number[]>> {
  const p = (proyecto ?? '').trim();
  if (!p) return {};
  try {
    const { data, error } = await supabase()
      .from('jornada_mes')
      .select('mes_key, dias')
      .eq('proyecto', p);
    if (error) throw error;
    const out: Record<string, number[]> = {};
    (data ?? []).forEach((r: any) => {
      if (Array.isArray(r.dias)) out[r.mes_key] = r.dias as number[];
    });
    return out;
  } catch (e) {
    console.error('[db] getJornadaMes:', e);
    return {};
  }
}

/** Guarda (upsert) los días de entreno de UN mes específico de un proyecto. */
export async function saveJornadaMes(proyecto: string, mesKey: string, dias: number[]): Promise<boolean> {
  const p = (proyecto ?? '').trim();
  if (!p || !mesKey) return false;
  try {
    const { error } = await supabase()
      .from('jornada_mes')
      .upsert({ proyecto: p, mes_key: mesKey, dias, updated_at: new Date().toISOString() }, { onConflict: 'proyecto,mes_key' });
    if (error) { console.error('[db] saveJornadaMes:', error.message); return false; }
    return true;
  } catch (e) { console.error('[db] saveJornadaMes:', e); return false; }
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

/* ─────────── Visitas / Accesos (indicador verde-rojo + analíticas) ─────────── */

const VISITAS_HDR = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

/** Registra una visita/acceso a la app (contador general).
 *  El acceso del calidoso también se registra en el servidor (/api/calidoso-login). */
export async function registrarVisita(codigo?: string, tipo: string = 'app'): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/visitas`, {
      method:  'POST',
      headers: { ...VISITAS_HDR, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ codigo: (codigo ?? '').trim() || null, tipo }),
    });
  } catch { /* noop */ }
}

/** Conjunto de códigos que YA entraron alguna vez (para el punto verde/rojo). */
export async function getCodigosConAcceso(): Promise<Set<string>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codigos_con_acceso?select=codigo`, { headers: VISITAS_HDR });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return new Set(data.map((r: any) => String(r.codigo ?? '').trim().toUpperCase()).filter(Boolean));
      }
    }
  } catch { /* noop */ }
  return new Set();
}

export interface VisitaDia { dia: string; visitas: number; visitantes: number; }

/** Analíticas: visitas por día (para la gráfica del dashboard). Devuelve del más viejo al más nuevo. */
export async function getVisitasPorDia(dias: number = 30): Promise<VisitaDia[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/visitas_por_dia?select=dia,visitas,visitantes&order=dia.desc&limit=${dias}`,
      { headers: VISITAS_HDR },
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return (data as VisitaDia[]).reverse();
    }
  } catch { /* noop */ }
  return [];
}

/** Totales rápidos: total de visitas y visitantes únicos (deportistas distintos que entraron). */
export async function getResumenVisitas(): Promise<{ total: number; unicos: number }> {
  try {
    const [rTotal, rUnicos] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/visitas?select=id`, { headers: { ...VISITAS_HDR, 'Prefer': 'count=exact', 'Range': '0-0' } }),
      fetch(`${SUPABASE_URL}/rest/v1/codigos_con_acceso?select=codigo`, { headers: VISITAS_HDR }),
    ]);
    let total = 0;
    const cr = rTotal.headers.get('content-range'); // "0-0/123"
    if (cr && cr.includes('/')) total = parseInt(cr.split('/')[1]) || 0;
    let unicos = 0;
    if (rUnicos.ok) { const d = await rUnicos.json(); if (Array.isArray(d)) unicos = d.length; }
    return { total, unicos };
  } catch { return { total: 0, unicos: 0 }; }
}

// ── SOLICITUDES DE FACTURA (calidoso → Área de Pagos / Finanzas) ──────────────
export interface FacturaSolicitud {
  id: string;
  deportistaId: string;
  codigo: string;
  nombreDeportista: string;
  facturaNombre: string;   // a nombre de quién se factura
  cedula: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  email: string;
  detalle: string;         // detalle a facturar
  valor: string;
  observacion: string;
  estado: string;          // 'PEND' | 'OK'
  createdAt: string;
}

function mapFactura(r: any): FacturaSolicitud {
  return {
    id: r.id, deportistaId: r.deportista_id ?? '', codigo: r.codigo ?? '',
    nombreDeportista: r.nombre_deportista ?? '', facturaNombre: r.factura_nombre ?? '',
    cedula: r.cedula ?? '', direccion: r.direccion ?? '', ciudad: r.ciudad ?? '',
    telefono: r.telefono ?? '', email: r.email ?? '', detalle: r.detalle ?? '',
    valor: String(r.valor ?? ''), observacion: r.observacion ?? '',
    estado: r.estado ?? 'PEND', createdAt: r.created_at ?? '',
  };
}

/** Crea una solicitud de factura (queda PENDIENTE en Finanzas). */
export async function crearSolicitudFactura(data: {
  deportistaId: string; codigo: string; nombreDeportista: string;
  facturaNombre: string; cedula: string; direccion: string; ciudad: string;
  telefono: string; email: string; detalle: string; valor: string; observacion: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase().from('facturas_solicitudes').insert({
      deportista_id: data.deportistaId ?? '',
      codigo: (data.codigo ?? '').trim(),
      nombre_deportista: (data.nombreDeportista ?? '').trim(),
      factura_nombre: (data.facturaNombre ?? '').trim(),
      cedula: (data.cedula ?? '').trim(),
      direccion: (data.direccion ?? '').trim(),
      ciudad: (data.ciudad ?? '').trim(),
      telefono: (data.telefono ?? '').trim(),
      email: (data.email ?? '').trim(),
      detalle: (data.detalle ?? '').trim(),
      valor: Number(String(data.valor ?? '').replace(/\D/g, '')) || 0,
      observacion: (data.observacion ?? '').trim(),
      estado: 'PEND',
    });
    if (error) { console.error('[db] crearSolicitudFactura:', error.message); return false; }
    return true;
  } catch (e) { console.error('[db] crearSolicitudFactura:', e); return false; }
}

/** Historial de solicitudes de un deportista (por código). Más recientes primero. */
export async function getSolicitudesFacturaPorCodigo(codigo: string): Promise<FacturaSolicitud[]> {
  try {
    const { data, error } = await supabase()
      .from('facturas_solicitudes').select('*')
      .eq('codigo', (codigo ?? '').trim())
      .order('created_at', { ascending: false });
    if (error) { console.error('[db] getSolicitudesFacturaPorCodigo:', error.message); return []; }
    return (data || []).map(mapFactura);
  } catch (e) { console.error('[db] getSolicitudesFacturaPorCodigo:', e); return []; }
}

/** Todas las solicitudes PENDIENTES (para el módulo FACTURAS PENDIENTES de Finanzas). */
export async function getSolicitudesFacturaPendientes(): Promise<FacturaSolicitud[]> {
  try {
    const { data, error } = await supabase()
      .from('facturas_solicitudes').select('*')
      .eq('estado', 'PEND')
      .order('created_at', { ascending: false });
    if (error) { console.error('[db] getSolicitudesFacturaPendientes:', error.message); return []; }
    return (data || []).map(mapFactura);
  } catch (e) { console.error('[db] getSolicitudesFacturaPendientes:', e); return []; }
}

/** Cuenta las solicitudes de factura PENDIENTES (para el contador del panel).
 *  Consulta liviana: pide solo el conteo, no trae las filas. */
export async function countSolicitudesFacturaPendientes(): Promise<number> {
  try {
    const { count, error } = await supabase()
      .from('facturas_solicitudes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'PEND');
    if (error) { console.error('[db] countSolicitudesFacturaPendientes:', error.message); return 0; }
    return count ?? 0;
  } catch (e) { console.error('[db] countSolicitudesFacturaPendientes:', e); return 0; }
}

/** Marca una solicitud como realizada (OK) → deja de aparecer en pendientes. */
export async function marcarFacturaOk(id: string): Promise<boolean> {
  try {
    const { error } = await supabase().from('facturas_solicitudes').update({ estado: 'OK' }).eq('id', id);
    if (error) { console.error('[db] marcarFacturaOk:', error.message); return false; }
    return true;
  } catch (e) { console.error('[db] marcarFacturaOk:', e); return false; }
}

// ── CERTIFICADO DE ASISTENCIA: registro de descargas (informe en Gestión) ─────
export interface CertDescarga { deportistaId: string; codigo: string; nombre: string; createdAt: string; }

/** Registra que un deportista descargó su certificado de asistencia. */
export async function registrarDescargaCertificado(data: { deportistaId: string; codigo: string; nombre: string }): Promise<void> {
  try {
    await supabase().from('cert_asistencia_log').insert({
      deportista_id: data.deportistaId ?? '',
      codigo: (data.codigo ?? '').trim(),
      nombre: (data.nombre ?? '').trim(),
    });
  } catch (e) { console.error('[db] registrarDescargaCertificado:', e); }
}

/** Lee todo el registro de descargas del certificado de asistencia (para el informe). */
export async function getCertificadosLog(): Promise<CertDescarga[]> {
  const out: CertDescarga[] = [];
  try {
    let desde = 0; const paso = 1000;
    while (true) {
      const { data, error } = await supabase()
        .from('cert_asistencia_log').select('deportista_id,codigo,nombre,created_at')
        .order('created_at', { ascending: false })
        .range(desde, desde + paso - 1);
      if (error) { console.error('[db] getCertificadosLog:', error.message); break; }
      (data || []).forEach((r: any) => out.push({
        deportistaId: r.deportista_id ?? '', codigo: r.codigo ?? '',
        nombre: r.nombre ?? '', createdAt: r.created_at ?? '',
      }));
      if (!data || data.length < paso) break;
      desde += paso;
    }
  } catch (e) { console.error('[db] getCertificadosLog:', e); }
  return out;
}
// ── FOTOS: carga liviana (agregado para el módulo de Cumpleaños) ──
// La tabla fotos_deportistas pesa ~61 MB. Traerla completa en una sola
// petición hace que la foto nunca llegue. Estas dos funciones permiten
// (1) saber QUIÉN tiene foto sin descargar ninguna imagen, y
// (2) bajar solo las fotos que se van a mostrar, en tandas pequeñas.

/** Devuelve el conjunto de deportista_id que tienen foto subida (consulta liviana). */
export async function getIdsConFoto(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/fotos_deportistas?select=deportista_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) for (const r of rows) if (r?.deportista_id) set.add(r.deportista_id);
    }
  } catch { /* noop */ }
  return set;
}

/** Descarga las fotos SOLO de los ids indicados, en tandas de 6. */
export async function getFotosPorIds(ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const limpios = Array.from(new Set((ids ?? []).filter(Boolean)));
  for (let i = 0; i < limpios.length; i += 6) {
    const tanda = limpios.slice(i, i + 6);
    const filtro = `deportista_id=in.(${tanda.map(x => `"${x}"`).join(',')})`;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/fotos_deportistas?select=deportista_id,base64&${filtro}`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows)) for (const r of rows) if (r?.deportista_id && r?.base64) map[r.deportista_id] = r.base64;
    } catch { /* sigue con la siguiente tanda */ }
  }
  return map;
}

// ── TARJETAS DE CUMPLEAÑOS YA ENVIADAS POR WHATSAPP ──────────
/* Guarda, por deportista y por AÑO, cuáles tarjetas ya se mandaron de verdad
   al acudiente. Se marca SOLO desde el botón de WhatsApp (o a mano con el
   chulo), nunca al descargar una tarjeta de prueba. Como la clave incluye el
   año, en enero arranca la lista limpia otra vez.
   Se guarda en Supabase (así lo ve cualquier computador del club) y además
   se deja una copia chiquita en el navegador para que el chulo aparezca al
   instante y siga funcionando si se cae el internet. */

const LS_CUMPLE_ENVIADOS = 'futuro_cumple_enviados';

function lsEnviados(anio: number): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const crudo = localStorage.getItem(`${LS_CUMPLE_ENVIADOS}_${anio}`);
    const arr = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : []);
  } catch { return new Set(); }
}

function lsGuardarEnviados(anio: number, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(`${LS_CUMPLE_ENVIADOS}_${anio}`, JSON.stringify(Array.from(ids))); }
  catch { /* si el navegador está lleno, no pasa nada: manda Supabase */ }
}

/** Ids de los deportistas cuya tarjeta YA se envió por WhatsApp este año. */
export async function getCumpleEnviados(anio: number): Promise<Set<string>> {
  const local = lsEnviados(anio);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cumple_enviados?select=deportista_id&anio=eq.${anio}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        const remoto = new Set<string>();
        for (const r of rows) if (r?.deportista_id) remoto.add(r.deportista_id);
        lsGuardarEnviados(anio, remoto);
        return remoto;
      }
    }
  } catch { /* sin internet: sirve la copia del navegador */ }
  return local;
}

/** Marca (o desmarca) la tarjeta de un deportista como enviada este año. */
export async function marcarCumpleEnviado(
  deportistaId: string,
  anio: number,
  enviado: boolean,
  datos?: { codigo?: string; nombre?: string; medio?: string },
): Promise<boolean> {
  if (!deportistaId || !anio) return false;

  // 1) Copia local primero, para que el chulo cambie de una.
  const set = lsEnviados(anio);
  if (enviado) set.add(deportistaId); else set.delete(deportistaId);
  lsGuardarEnviados(anio, set);

  // 2) Supabase, que es el registro de verdad.
  try {
    if (enviado) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cumple_enviados`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          deportista_id: deportistaId,
          anio,
          codigo: datos?.codigo ?? null,
          nombre: datos?.nombre ?? null,
          medio: datos?.medio ?? 'whatsapp',
          enviado_at: new Date().toISOString(),
        }),
      });
      return res.ok;
    }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cumple_enviados?deportista_id=eq.${encodeURIComponent(deportistaId)}&anio=eq.${anio}`,
      {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      }
    );
    return res.ok;
  } catch { return false; }
}

// ── TELÉFONO DE WHATSAPP ALTERNO ─────────────────────────────
/* A veces el celular que está en la ficha NO tiene WhatsApp, pero la
   institución conoce otro número que sí. Aquí se guarda ese número aparte,
   sin tocar la ficha: queda como el "teléfono de WhatsApp" del deportista y
   lo ve cualquier computador del club. El de la ficha se conserva en la
   columna telefono_ficha, como historial. */

export interface TelefonoWhatsApp {
  deportistaId: string;
  telefono: string;
  telefonoFicha: string;
  nota: string;
  actualizadoEn: string;
}

/** Todos los teléfonos de WhatsApp corregidos, por id de deportista. */
export async function getTelefonosWhatsApp(): Promise<Record<string, TelefonoWhatsApp>> {
  const out: Record<string, TelefonoWhatsApp> = {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/telefonos_whatsapp?select=deportista_id,telefono,telefono_ficha,nota,actualizado_at`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return out;
    const rows = await res.json();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (!r?.deportista_id || !r?.telefono) continue;
        out[r.deportista_id] = {
          deportistaId:  r.deportista_id,
          telefono:      String(r.telefono),
          telefonoFicha: String(r.telefono_ficha ?? ''),
          nota:          String(r.nota ?? ''),
          actualizadoEn: String(r.actualizado_at ?? ''),
        };
      }
    }
  } catch { /* sin internet: se usa el de la ficha */ }
  return out;
}

/** Guarda (o corrige) el número de WhatsApp de un deportista. */
export async function guardarTelefonoWhatsApp(
  deportistaId: string,
  telefono: string,
  datos?: { codigo?: string; nombre?: string; telefonoFicha?: string; nota?: string },
): Promise<boolean> {
  const tel = String(telefono || '').trim();
  if (!deportistaId || !tel) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/telefonos_whatsapp`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        deportista_id:  deportistaId,
        telefono:       tel,
        telefono_ficha: datos?.telefonoFicha ?? null,
        codigo:         datos?.codigo ?? null,
        nombre:         datos?.nombre ?? null,
        nota:           datos?.nota ?? null,
        actualizado_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch { return false; }
}

/** Quita el número corregido: vuelve a mandar al celular de la ficha. */
export async function borrarTelefonoWhatsApp(deportistaId: string): Promise<boolean> {
  if (!deportistaId) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/telefonos_whatsapp?deportista_id=eq.${encodeURIComponent(deportistaId)}`,
      { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    return res.ok;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// MICROCICLO DE ENTRENAMIENTO  (categoría SEGUIMIENTO)
// Se construye desde ADMON · lo gestiona el FORMADOR.
//
// REGLA DEL MÓDULO: la asistencia NO se guarda aquí.
// El microciclo LEE la tabla `asistencia` (el formato que el formador
// actualiza) y solo toma de ella: % de asistencia, número de asistentes
// y la lista de faltantes con su motivo.
// ═══════════════════════════════════════════════════════════════

export type TipoDia  = 'entreno' | 'partido' | 'descarga' | 'recuperacion' | 'descanso' | 'competencia';
export type CargaDia = 'baja' | 'media' | 'alta' | 'muy_alta';
export type EstadoMicrociclo = 'borrador' | 'publicado' | 'cerrado';

export interface MicrocicloDia {
  id:             string;
  microciclo_id:  string;
  fecha:          string;      // YYYY-MM-DD
  dia_semana:     number;      // 1 = lunes … 7 = domingo
  tipo_dia:       TipoDia;
  carga:          CargaDia;
  /** Sede donde se entrena ese día (los proyectos rotan de escenario). */
  escenario:      string;
  /** Hora de inicio, formato 24 h "HH:MM". */
  hora:           string;
  /** Componentes a desarrollar: tecnico · fisico · tactico · psicologico. */
  componentes:    string[];
  objetivo_dia:   string;
  contenidos:     string;
  fase_inicial:   string;
  fase_central:   string;
  fase_final:     string;
  /** FASE 2 — pizarra táctica (jugadores, balones, conos, aros, flechas). */
  pizarra_inicial: unknown | null;
  pizarra_central: unknown | null;
  pizarra_final:   unknown | null;
  observaciones:  string;
}

export interface Microciclo {
  id:               string;
  proyecto:         string;
  profesor:         string;
  numero:           number;
  mesociclo:        string;
  fecha_inicio:     string;    // lunes
  fecha_fin:        string;    // domingo
  objetivo_general: string;
  objetivo_tecnico: string;
  objetivo_tactico: string;
  objetivo_fisico:  string;
  objetivo_psico:   string;
  estado:           EstadoMicrociclo;
  creado_por:       string;
  dias?:            MicrocicloDia[];
}

const LS_MICROCICLOS = 'futuro_microciclos';

let _ultimoErrorMicrociclo = '';
/** Último error crudo de la base — para decirle al usuario qué pasó de verdad. */
export function ultimoErrorMicrociclo(): string { return _ultimoErrorMicrociclo; }

const HDR_MC = () => ({
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
});

function mapMicrociclo(r: any): Microciclo {
  return {
    id:               r.id,
    proyecto:         r.proyecto ?? '',
    profesor:         r.profesor ?? '',
    numero:           Number(r.numero ?? 1),
    mesociclo:        r.mesociclo ?? '',
    fecha_inicio:     r.fecha_inicio ?? '',
    fecha_fin:        r.fecha_fin ?? '',
    objetivo_general: r.objetivo_general ?? '',
    objetivo_tecnico: r.objetivo_tecnico ?? '',
    objetivo_tactico: r.objetivo_tactico ?? '',
    objetivo_fisico:  r.objetivo_fisico ?? '',
    objetivo_psico:   r.objetivo_psico ?? '',
    estado:           (r.estado ?? 'borrador') as EstadoMicrociclo,
    creado_por:       r.creado_por ?? '',
  };
}

/* ═══ ESCENARIO · HORARIO · COMPONENTES — dónde se guardan ═══════════════════
   La tabla `microciclo_dias` no tiene esas tres columnas y crearlas exige
   correr un ALTER TABLE en Supabase. Mientras eso pasa, los tres datos viajan
   juntos, en formato JSON, dentro de `pizarra_inicial`: una columna que ya
   existe, está vacía en todas las filas y pertenece a la pizarra táctica, que
   todavía no se ha construido.

   No se pierde nada y es reversible: el día que se creen las columnas de
   verdad, `mapDia` las prefiere automáticamente y solo hay que mover los datos
   una vez. — 23/08/2026 */
const COL_EXTRAS = 'pizarra_inicial';

function empacarExtras(escenario: string, hora: string, componentes: string[]): string {
  return JSON.stringify({ escenario: escenario ?? '', hora: hora ?? '', componentes: componentes ?? [] });
}

function desempacarExtras(v: unknown): { escenario: string; hora: string; componentes: string[] } {
  let o: any = v;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { o = null; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { escenario: '', hora: '', componentes: [] };
  return {
    escenario:   String(o.escenario ?? ''),
    hora:        String(o.hora ?? ''),
    componentes: Array.isArray(o.componentes) ? o.componentes.map(String) : [],
  };
}

function mapDia(r: any): MicrocicloDia {
  return {
    id:              r.id,
    microciclo_id:   r.microciclo_id,
    fecha:           r.fecha ?? '',
    dia_semana:      Number(r.dia_semana ?? 1),
    tipo_dia:        (r.tipo_dia ?? 'entreno') as TipoDia,
    carga:           (r.carga ?? 'media') as CargaDia,
    // Si algún día existen las columnas propias, mandan ellas.
    escenario:       r.escenario ?? desempacarExtras(r[COL_EXTRAS]).escenario,
    // Ojo: aquí NO se corta el texto. La hora es una franja completa
    // "08:00-09:30"; recortarla a 5 letras borraba la hora de salida.
    hora:            String(r.hora ?? desempacarExtras(r[COL_EXTRAS]).hora ?? ''),
    componentes:     Array.isArray(r.componentes)
                       ? r.componentes
                       : desempacarExtras(r[COL_EXTRAS]).componentes,
    objetivo_dia:    r.objetivo_dia ?? '',
    contenidos:      r.contenidos ?? '',
    fase_inicial:    r.fase_inicial ?? '',
    fase_central:    r.fase_central ?? '',
    fase_final:      r.fase_final ?? '',
    pizarra_inicial: r.pizarra_inicial ?? null,
    pizarra_central: r.pizarra_central ?? null,
    pizarra_final:   r.pizarra_final ?? null,
    observaciones:   r.observaciones ?? '',
  };
}

/** Lista de microciclos (cabeceras), opcionalmente de un solo proyecto. */
/* ── EL OBJETIVO SE ESCRIBE POR DÍA, NO EN LA CABECERA ──────────────────────
   (dirección, 04/09/2026 — «ese aviso no es válido, no sale de nada; la gente
    sí tiene objetivo, que ese aviso salga si realmente no hay objetivo»)

   Comprobado contra la base: de los 91 microciclos CERRADOS, NINGUNO tiene
   escrito `objetivo_general`. La casilla existe en la tabla pero el formador
   nunca la ve: en su pantalla el objetivo se escribe DÍA POR DÍA, y ahí sí
   hay 88 días con objetivo escrito.

   O sea que el cuadro de Control Total estaba mirando la casilla equivocada y
   por eso decía «sin objetivo escrito» hasta en las semanas mejor trabajadas.

   Esta función trae, de una sola pasada, el primer objetivo escrito de cada
   semana, para poder mostrarlo en el cuadro. Es liviana: solo dos columnas. */
export async function getObjetivosPorMicrociclo(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    for (let desde = 0; desde < 20000; desde += 1000) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/microciclo_dias`
        + `?select=microciclo_id,dia_semana,objetivo_dia`
        + `&order=microciclo_id.asc,dia_semana.asc&offset=${desde}&limit=1000`,
        { headers: HDR_MC() },
      );
      if (!res.ok) break;
      const filas = await res.json();
      if (!Array.isArray(filas) || filas.length === 0) break;
      filas.forEach((r: any) => {
        const id = String(r.microciclo_id ?? '');
        const t  = String(r.objetivo_dia ?? '').trim();
        if (!id || !t) return;
        if (!out[id]) out[id] = t;      // el primer día que tenga algo escrito
      });
      if (filas.length < 1000) break;
    }
  } catch {
    /* Sin señal se queda vacío: el cuadro sigue funcionando, solo que sin
       mostrar el objetivo. Nunca se cae por esto. */
  }
  return out;
}

export async function getMicrociclos(proyecto?: string): Promise<Microciclo[]> {
  const filtro = proyecto ? `&proyecto=eq.${encodeURIComponent(proyecto)}` : '';
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/microciclos?select=*${filtro}&order=fecha_inicio.desc`,
      { headers: HDR_MC() }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const lista = (Array.isArray(data) ? data : []).map(mapMicrociclo);
    try { lsSet(LS_MICROCICLOS, lista); } catch {}
    return lista;
  } catch {
    const cache = lsGet<Microciclo[]>(LS_MICROCICLOS, []);
    return proyecto ? cache.filter(m => m.proyecto === proyecto) : cache;
  }
}

/** Un microciclo con sus 7 días ordenados de lunes a domingo. */
export async function getMicrociclo(id: string): Promise<Microciclo | null> {
  if (!id) return null;
  try {
    const [rCab, rDias] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/microciclos?select=*&id=eq.${encodeURIComponent(id)}`, { headers: HDR_MC() }),
      fetch(`${SUPABASE_URL}/rest/v1/microciclo_dias?select=*&microciclo_id=eq.${encodeURIComponent(id)}&order=dia_semana.asc`, { headers: HDR_MC() }),
    ]);
    if (!rCab.ok) return null;
    const cab = await rCab.json();
    if (!Array.isArray(cab) || !cab.length) return null;
    const dias = rDias.ok ? await rDias.json() : [];
    return { ...mapMicrociclo(cab[0]), dias: (Array.isArray(dias) ? dias : []).map(mapDia) };
  } catch {
    return null;
  }
}

/** Lunes de la semana a la que pertenece una fecha (ISO, lunes = inicio). */
export function lunesDeLaSemana(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dow = d.getDay() === 0 ? 7 : d.getDay();   // 1..7
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

/** Fecha → 'YYYY-MM-DD' en hora local (no usar toISOString: corre el día). */
export function claveFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * ¿Están creadas las tablas del microciclo en Supabase?
 * Devuelve un motivo legible para mostrarlo en pantalla en vez de un
 * "no se pudo" a secas.
 */
export async function estadoTablasMicrociclo(): Promise<{ ok: boolean; motivo: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/microciclos?select=id&limit=1`, { headers: HDR_MC() });
    if (res.ok) return { ok: true, motivo: '' };

    const txt = await res.text().catch(() => '');
    if (res.status === 404 || txt.includes('PGRST205') || /schema cache/i.test(txt)) {
      return { ok: false, motivo: 'FALTAN_TABLAS' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, motivo: `PERMISO: ${txt.slice(0, 200)}` };
    }
    return { ok: false, motivo: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, motivo: `SIN_CONEXION: ${String(e).slice(0, 200)}` };
  }
}

export interface InfoProyecto {
  dias:     number[];   // 0 = domingo … 6 = sábado
  formador: string;
  sede:     string;
  /* ── LA HORA EN QUE ARRANCA EL ENTRENAMIENTO ─────────────────────────────
     (dirección, 02/09/2026)

     Se guarda SOLO la hora de inicio, en formato "4:30 PM". La de salida no
     se guarda: se saca sola, porque la academia tiene la duración fijada por
     programa —hora y media, y una hora en Estimulación—. Guardar dos horas
     que siempre son la misma cuenta es guardar un dato que se puede
     contradecir consigo mismo.

     Puede llegar vacía: la casilla es nueva y los proyectos viejos no la
     tienen. Vacía significa «todavía no se ha puesto», no «a las 12». */
  hora:     string;
}

/* ── CUÁNTO DURA UN ENTRENAMIENTO ─────────────────────────────────────────
   (dirección, 02/09/2026)

   «Si es formación, progresión, selección o desarrollo entrenan una hora y
    media… Haz lo mismo con estimulación, pero ellos serían con una hora.»

   Por eso la hora de salida NO se digita ni se guarda: se calcula. Se escribe
   la de entrada y la de salida sale sola. Si mañana la academia cambia la
   duración, se cambia aquí y queda cambiada en toda la plataforma.

   La única que entrena una hora es Estimulación, que son los más chiquitos;
   cualquier otro programa va con hora y media. */
export const MINUTOS_ENTRENO_NORMAL       = 90;
export const MINUTOS_ENTRENO_ESTIMULACION = 60;

export function minutosDeEntreno(programa: string): number {
  const p = String(programa ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return p.includes('ESTIMULACION') ? MINUTOS_ENTRENO_ESTIMULACION : MINUTOS_ENTRENO_NORMAL;
}

/** "4:30 PM" → minutos desde medianoche. -1 si no se entiende. */
export function minutosDeHoraTexto(hora: string): number {
  const t = String(hora ?? '').trim().toUpperCase();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'PM') h += 12;
    return h * 60 + Number(m[2]);
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return -1;
}

/** Los minutos, de vuelta a "6:00 PM". */
export function horaTextoDeMinutos(min: number): string {
  if (!Number.isFinite(min)) return '';
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mm} ${ampm}`;
}

/** "4:30 PM" + Formación → "6:00 PM". Vacío si la entrada no se entiende. */
export function horaFinEntreno(horaInicio: string, programa: string): string {
  const m = minutosDeHoraTexto(horaInicio);
  if (m < 0) return '';
  return horaTextoDeMinutos(m + minutosDeEntreno(programa));
}

/* ═══════════════════════════════════════════════════════════════════════════
   HORARIO DÍA POR DÍA — Progresión, Selección y Desarrollo
   (dirección, 03/09/2026 — «con los grupos de progresión, selección y
    desarrollo se hace más complejo ya que ellos entrenan por lo general en
    sedes y horas diferentes»)

   Los grupos chiquitos entrenan siempre en el mismo sitio y a la misma hora,
   y con una sola casilla basta. Los tres programas de arriba no: el lunes en
   el CDC a las 4:30 y el miércoles en el Bloque 19 a las 5:00. Por eso, en
   Info Proyectos y Formadores, a esos proyectos la casilla HORARIO les abre
   una pantalla con un renglón por día.

   DÓNDE SE GUARDA. En `config_cobro`, que ya existe y es el cajón de
   configuraciones de la plataforma (id + data en JSON). Se escogió eso y no
   una columna nueva para NO tener que tocar la base: nada de correr un .bat,
   y lo ve todo el mundo desde cualquier computador al instante.

   CÓMO SE GUARDA:
       { "SUB 12 A": { "1": { sede: "CDC", hora: "4:30 PM" },
                       "3": { sede: "BLOQUE 19", hora: "5:00 PM" } } }
   La llave del día es la del calendario: 0 = domingo … 6 = sábado.
   ═══════════════════════════════════════════════════════════════════════════ */

/** El CDC es el mismo sitio que Casa de Campeones: un solo renglón, dos
 *  nombres, porque en la academia se dicen de las dos maneras.
 *  Allá el entrenamiento es de UNA HORA, no de hora y media. */
export const SEDES_ENTRENO: { nombre: string; minutos: number }[] = [
  { nombre: 'CDC (CASA DE CAMPEONES)', minutos: 60 },
  { nombre: 'BLOQUE 19',   minutos: 90 },
  { nombre: 'EAFIT',       minutos: 90 },
  { nombre: 'ELITE',       minutos: 90 },
  { nombre: 'FUNDADORES',  minutos: 90 },
  { nombre: 'LA 80',       minutos: 90 },
  { nombre: 'NIQUÍA',      minutos: 90 },
  { nombre: 'SABANETA',    minutos: 90 },
  { nombre: 'SANTA MÓNICA',minutos: 90 },
];

/** Los tres programas que entrenan en sedes y horas distintas cada día. */
export function usaHorarioPorDia(programa: string): boolean {
  const p = String(programa ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return p.includes('PROGRESION') || p.includes('SELECCION') || p.includes('DESARROLLO');
}

/** Cuánto dura el entrenamiento EN ESA SEDE. En el CDC, una hora. */
export function minutosEnSede(sede: string, programa: string): number {
  const s = String(sede ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  /* Se reconoce escrito de las dos formas y también suelto: "CDC",
     "CASA DE CAMPEONES", "CDC (CASA DE CAMPEONES)". */
  if (/\bCDC\b/.test(s) || s.includes('CASA DE CAMPEONES')) return 60;
  return minutosDeEntreno(programa);
}

export interface HorarioDia {
  /** Dónde entrena ese día. Vacío = todavía no se ha puesto. */
  sede: string;
  /** Hora de entrada, "4:30 PM". La de salida se saca sola. */
  hora: string;
}

/** proyecto → { "1": {sede,hora}, "3": {...} }. Día 0 = domingo. */
export type HorariosPorDia = Record<string, Record<string, HorarioDia>>;

const ID_HORARIOS_DIA = 'horarios_por_dia';

export async function getHorariosPorDia(): Promise<HorariosPorDia> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/config_cobro?id=eq.${ID_HORARIOS_DIA}&select=data`,
      { headers: HDR_MC(), cache: 'no-store' },
    );
    if (!res.ok) return {};
    const d = await res.json();
    const data = Array.isArray(d) ? d[0]?.data : null;
    return (data && typeof data === 'object') ? (data as HorariosPorDia) : {};
  } catch {
    return {};
  }
}

/** Guarda TODO el mapa. Se lee, se cambia el proyecto que toca y se manda
 *  entero: son unas pocas líneas de texto y así no hay forma de perder lo de
 *  otro proyecto por una escritura a medias. */
export async function saveHorariosPorDia(v: HorariosPorDia): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/config_cobro`, {
      method: 'POST',
      headers: { ...HDR_MC(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: ID_HORARIOS_DIA, data: v, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST PARTIDOS QUE HAY QUE CORREGIR
   (dirección, 04/09/2026 — «que el admón, al revisar el juego y ver que hay
    dudas en la info, pueda cambiar el estado de TERMINADO por una opción
    llamada CORREGIR; que el profe lo vea en su banco de post partidos y vea
    por qué debe corregir; que al admón, al cambiar a corregir, le salga una
    casilla para anotar la observación, la que el profe leerá»)

   CÓMO FUNCIONA
     1. El admón abre un partido TERMINADO, ve algo raro y le da CORREGIR.
        Escribe qué está mal.
     2. El partido pasa a POR CORREGIR y se DESTRABA, para que el formador
        pueda escribir: si no, no podría corregir nada.
     3. El formador lo ve en su banco en rojo, con la observación en letras,
        y arregla lo que se le pidió.
     4. Cuando termina, el partido SIGUE en POR CORREGIR. El formador no lo
        puede cerrar: eso lo decidió la dirección — «queda por corregir hasta
        que el admón lo ponga terminado, solo el admón».
     5. El admón lo revisa y le da DAR POR TERMINADO. Ahí se borra la
        observación y el partido vuelve a TERMINADO, limpio.

   DÓNDE SE GUARDA. En `config_cobro`, el mismo cajón de las configuraciones
   —el de los horarios por día—. No hubo que tocar la tabla de las planillas
   ni crear nada nuevo en la base: son cuatro renglones de texto por partido y
   así no se corre ningún riesgo con la información de los partidos, que es lo
   que más cuidado merece.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CorreccionPP {
  /** Lo que el admón escribió: qué hay que corregir. */
  texto: string;
  /** Quién lo pidió, para que el formador sepa con quién hablar. */
  quien: string;
  /** Cuándo se pidió (ISO). */
  cuando: string;
}

/** Un partido se identifica igual que su planilla: torneo + # FECHA. */
export function clavePospartido(torneoNum: string, jornada: string): string {
  return `${String(torneoNum ?? '').trim()}|${String(jornada ?? '').trim().toUpperCase()}`;
}

const ID_CORRECCIONES_PP = 'pospartido_correcciones';

export async function getCorreccionesPospartido(): Promise<Record<string, CorreccionPP>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/config_cobro?id=eq.${ID_CORRECCIONES_PP}&select=data`,
      { headers: HDR_MC(), cache: 'no-store' },
    );
    if (!res.ok) return {};
    const d = await res.json();
    const data = Array.isArray(d) ? d[0]?.data : null;
    return (data && typeof data === 'object') ? (data as Record<string, CorreccionPP>) : {};
  } catch {
    return {};
  }
}

/** Guarda el mapa completo, igual que los horarios: es poquito texto y así no
 *  se pierde lo de otro partido por una escritura a medias. */
export async function saveCorreccionesPospartido(
  v: Record<string, CorreccionPP>,
): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/config_cobro`, {
      method: 'POST',
      headers: { ...HDR_MC(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: ID_CORRECCIONES_PP, data: v, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** "CDC (CASA DE CAMPEONES)" + "4:30 PM" → "4:30 PM – 5:30 PM". */
export function textoHorarioDia(h: HorarioDia | undefined, programa: string): string {
  if (!h || !h.hora) return '';
  const ini = minutosDeHoraTexto(h.hora);
  if (ini < 0) return '';
  return `${horaTextoDeMinutos(ini)} – ${horaTextoDeMinutos(ini + minutosEnSede(h.sede, programa))}`;
}

/* ── TODAS LAS FICHAS DE PROYECTO, DE UN SOLO VIAJE ──────────────────────────
   (dirección, 02/09/2026)

   POR QUÉ HACÍA FALTA. La pantalla de Información de Proyectos y Formadores
   leía los días de entreno y la sede de la MEMORIA DEL NAVEGADOR. Eso significa
   que lo que usted configuraba en su computador no existía en el de nadie más,
   y si esa memoria se limpiaba, salía todo en blanco — aunque en la base
   estuviera completo. De ahí el «recuperar los días que entrena cada proyecto».

   `getInfoProyecto` ya leía la base, pero de a un proyecto por viaje. Con 87
   proyectos eso son 87 viajes. Esto los trae TODOS de una. */
export async function getFichasProyecto(): Promise<Record<string, InfoProyecto>> {
  const out: Record<string, InfoProyecto> = {};
  try {
    let desde = 0; const paso = 1000;
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/jornadas_proyecto?select=*`,
        { headers: { ...HDR_MC(), Range: `${desde}-${desde + paso - 1}`, 'Range-Unit': 'items' }, cache: 'no-store' },
      );
      if (!res.ok && res.status !== 206) break;
      const data = await res.json();
      if (!Array.isArray(data)) break;
      data.forEach((r: any) => {
        const p = String(r?.proyecto ?? '').trim();
        if (!p) return;
        out[p] = {
          dias:     Array.isArray(r.dias) ? r.dias : [],
          formador: String(r.nombre_formador ?? ''),
          sede:     String(r.sede ?? ''),
          /* Si la base todavía no tiene la casilla, llega vacía y la pantalla
             la muestra como «— poner —». — 02/09/2026 */
          hora:     String(r.hora_inicio ?? ''),
        };
      });
      if (data.length < paso) break;
      desde += paso;
    }
  } catch (e: any) { console.error('[db] getFichasProyecto:', e?.message); }
  return out;
}

/* ── Y GUARDARLA, QUE ES LO QUE NUNCA SE HACÍA ───────────────────────────────
   El botón "Guardar cambios" de esa pantalla escribía los días SOLO en el
   navegador. Ese era el hueco por donde se perdían. Esto los deja en la base,
   donde los ve todo el mundo y no se borran al limpiar el navegador. */
export async function saveFichaProyecto(
  proyecto: string,
  datos: { dias?: number[]; sede?: string; nombre_formador?: string; hora?: string },
): Promise<boolean> {
  const p = String(proyecto ?? '').trim();
  if (!p) return false;
  try {
    const fila: any = { proyecto: p, updated_at: new Date().toISOString() };
    if (datos.dias !== undefined)            fila.dias = datos.dias;
    if (datos.sede !== undefined)            fila.sede = datos.sede;
    if (datos.nombre_formador !== undefined) fila.nombre_formador = datos.nombre_formador;
    if (datos.hora !== undefined)            fila.hora_inicio = datos.hora;

    let { error } = await supabase()
      .from('jornadas_proyecto')
      .upsert(fila, { onConflict: 'proyecto' });

    /* ── SI LA CASILLA DE LA HORA TODAVÍA NO EXISTE ────────────────────────
       `hora_inicio` es nueva (02/09/2026) y la base solo la tiene después de
       correr PASO-HORARIO-PROYECTO.bat. Si no está, la base RECHAZA TODO el
       guardado —se perderían también los días y la sede—. Así que se vuelve a
       intentar sin ella: se guarda lo demás y la hora es lo único que espera.
       — 02/09/2026 */
    if (error && /hora_inicio/i.test(String(error.message ?? ''))) {
      const { hora_inicio: _fuera, ...sinHora } = fila;
      const r2 = await supabase()
        .from('jornadas_proyecto')
        .upsert(sinHora, { onConflict: 'proyecto' });
      error = r2.error;
    }
    if (error) { console.error('[db] saveFichaProyecto:', error.message); return false; }
    /* La copia del navegador se deja al día también, para que /asistencia la
       encuentre de una sin tener que volver a preguntar. */
    if (Array.isArray(datos.dias)) {
      try { localStorage.setItem(`futuro_dias_${p}`, JSON.stringify(datos.dias)); } catch {}
    }
    return true;
  } catch (e: any) { console.error('[db] saveFichaProyecto:', e?.message); return false; }
}

/**
 * Ficha del proyecto tal como está en `jornadas_proyecto`: días de entreno,
 * formador responsable y sede habitual. Es la misma fuente que usa /asistencia.
 */
export async function getInfoProyecto(proyecto: string): Promise<InfoProyecto> {
  const p = (proyecto ?? '').trim();
  const vacio: InfoProyecto = { dias: [], formador: '', sede: '', hora: '' };
  if (!p) return vacio;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/jornadas_proyecto?select=*&proyecto=eq.${encodeURIComponent(p)}&limit=1`,
      { headers: HDR_MC(), cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        const r = data[0];
        const info: InfoProyecto = {
          dias:     Array.isArray(r.dias) ? r.dias : [],
          formador: r.nombre_formador ?? '',
          sede:     r.sede ?? '',
          hora:     String(r.hora_inicio ?? ''),
        };
        if (info.dias.length) { try { localStorage.setItem(`futuro_dias_${p}`, JSON.stringify(info.dias)); } catch {} }
        return info;
      }
    }
  } catch { /* respaldo local */ }

  return { ...vacio, dias: await getDiasProyecto(p) };
}

/**
 * Días de entrenamiento base de un proyecto (0 = domingo … 6 = sábado).
 * Misma fuente que usa /asistencia: la tabla `jornadas_proyecto`.
 */
export async function getDiasProyecto(proyecto: string): Promise<number[]> {
  const p = (proyecto ?? '').trim();
  if (!p) return [];
  try {
    const res = await fetch(`/api/jornada-proyecto?proyecto=${encodeURIComponent(p)}`, { cache: 'no-store' });
    if (res.ok) {
      const { dias } = await res.json();
      if (Array.isArray(dias) && dias.length) {
        try { localStorage.setItem(`futuro_dias_${p}`, JSON.stringify(dias)); } catch {}
        return dias as number[];
      }
    }
  } catch { /* seguimos al respaldo local */ }

  try {
    const raw = localStorage.getItem(`futuro_dias_${p}`);
    const dias = raw ? JSON.parse(raw) : [];
    if (Array.isArray(dias)) return dias as number[];
  } catch {}
  return [];
}

/**
 * Crea un microciclo con sus 7 días (lunes → domingo).
 * `fechasEntreno` marca cuáles días son de entrenamiento según el calendario
 * del proyecto; los demás quedan como descanso.
 * Devuelve el id creado, o null si falló.
 */
export async function crearMicrociclo(datos: {
  proyecto: string; profesor?: string; numero?: number; mesociclo?: string;
  fecha_inicio: string; objetivo_general?: string; creado_por?: string;
  fechasEntreno?: string[];
}): Promise<string | null> {
  const proyecto = (datos.proyecto ?? '').trim();
  if (!proyecto || !datos.fecha_inicio) return null;

  const [a, m, d] = datos.fecha_inicio.split('-').map(Number);
  const inicio = lunesDeLaSemana(new Date(a, m - 1, d));
  const fin    = new Date(inicio); fin.setDate(fin.getDate() + 6);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/microciclos`, {
      method:  'POST',
      headers: { ...HDR_MC(), 'Prefer': 'return=representation' },
      body: JSON.stringify({
        proyecto,
        profesor:         datos.profesor  ?? '',
        numero:           datos.numero    ?? 1,
        mesociclo:        datos.mesociclo ?? '',
        fecha_inicio:     claveFecha(inicio),
        fecha_fin:        claveFecha(fin),
        objetivo_general: datos.objetivo_general ?? '',
        creado_por:       datos.creado_por ?? '',
        estado:           'borrador',
      }),
    });
    if (!res.ok) {
      _ultimoErrorMicrociclo = `HTTP ${res.status} · ${(await res.text().catch(() => '')).slice(0, 300)}`;
      console.error('[db] crearMicrociclo:', _ultimoErrorMicrociclo);
      return null;
    }
    const creado = await res.json();
    const id = Array.isArray(creado) ? creado[0]?.id : creado?.id;
    if (!id) return null;

    // Los 7 días de la semana. Si vino el calendario del proyecto, los días
    // sin sesión nacen marcados como descanso.
    const conCalendario = Array.isArray(datos.fechasEntreno) && datos.fechasEntreno.length > 0;
    const setEntreno = new Set(datos.fechasEntreno ?? []);
    const dias = Array.from({ length: 7 }, (_, i) => {
      const f  = new Date(inicio); f.setDate(f.getDate() + i);
      const fk = claveFecha(f);
      const entrena = conCalendario ? setEntreno.has(fk) : i < 6;
      return {
        microciclo_id: id,
        fecha:         fk,
        dia_semana:    i + 1,
        tipo_dia:      entrena ? 'entreno' : 'descanso',
        carga:         entrena ? 'media' : 'baja',
      };
    });
    await fetch(`${SUPABASE_URL}/rest/v1/microciclo_dias`, {
      method: 'POST', headers: HDR_MC(), body: JSON.stringify(dias),
    });
    return id;
  } catch (e) {
    _ultimoErrorMicrociclo = String(e).slice(0, 300);
    console.error('[db] crearMicrociclo:', e);
    return null;
  }
}



/** Actualiza la cabecera (objetivos, estado, profesor…). */
export async function guardarMicrociclo(id: string, cambios: Partial<Microciclo>): Promise<boolean> {
  if (!id) return false;
  const permitido: Record<string, unknown> = {};
  (['profesor','numero','mesociclo','objetivo_general','objetivo_tecnico','objetivo_tactico',
    'objetivo_fisico','objetivo_psico','estado'] as const)
    .forEach(k => { if (cambios[k] !== undefined) permitido[k] = cambios[k]; });
  if (!Object.keys(permitido).length) return true;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/microciclos?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: HDR_MC(), body: JSON.stringify(permitido) }
    );
    return res.ok;
  } catch (e) { console.error('[db] guardarMicrociclo:', e); return false; }
}

/** Guarda un día del microciclo (lo edita el formador). */
export async function guardarMicrocicloDia(diaId: string, cambios: Partial<MicrocicloDia>): Promise<boolean> {
  if (!diaId) return false;
  const permitido: Record<string, unknown> = {};
  (['tipo_dia','carga','escenario','hora','componentes','objetivo_dia','contenidos',
    'fase_inicial','fase_central','fase_final',
    'pizarra_inicial','pizarra_central','pizarra_final','observaciones'] as const)
    .forEach(k => { if (cambios[k] !== undefined) permitido[k] = cambios[k]; });
  if (!Object.keys(permitido).length) return true;

  /* Columnas que llegaron después (ampliación del 22/08/2026). Si la base aún
     no las tiene, no se pierde TODO lo que el formador escribió: se reintenta
     guardando el resto y se avisa qué quedó por fuera. */
  const COLS_NUEVAS = ['escenario', 'hora', 'componentes'] as const;

  const enviar = async (cuerpo: Record<string, unknown>) => fetch(
    `${SUPABASE_URL}/rest/v1/microciclo_dias?id=eq.${encodeURIComponent(diaId)}`,
    { method: 'PATCH', headers: HDR_MC(), body: JSON.stringify(cuerpo) },
  );

  try {
    const res = await enviar(permitido);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');

      /* La base no tiene las tres columnas propias. En vez de perder el dato,
         se reintenta metiéndolo empacado en `pizarra_inicial`, que sí existe.
         Para el formador esto es invisible: guarda y queda guardado. */
      const faltanNuevas = /PGRST204|schema cache/i.test(txt)
        && COLS_NUEVAS.some(c => c in permitido);
      if (faltanNuevas) {
        const resto: Record<string, unknown> = { ...permitido };
        COLS_NUEVAS.forEach(c => { delete resto[c]; });
        resto[COL_EXTRAS] = empacarExtras(
          String(cambios.escenario ?? ''),
          String(cambios.hora ?? ''),
          Array.isArray(cambios.componentes) ? cambios.componentes : [],
        );
        const res2 = await enviar(resto);
        if (res2.ok) {
          _ultimoErrorMicrociclo = '';
          return true;   // guardado completo, solo que por el camino alterno
        }
        // Si tampoco pasó, se guarda al menos el resto y se avisa.
        delete resto[COL_EXTRAS];
        if (Object.keys(resto).length) {
          const res3 = await enviar(resto);
          if (res3.ok) {
            _ultimoErrorMicrociclo = `SOLO_FALTAN_NUEVAS|${txt.slice(0, 200)}`;
            console.warn('[db] microciclo: guardado parcial (sin escenario/hora/componentes)');
            return false;
          }
        }
      }
      // PGRST204 = la columna no existe todavía (falta correr el SQL).
      _ultimoErrorMicrociclo = /PGRST204|schema cache|column/i.test(txt)
        ? 'FALTAN_COLUMNAS'
        : `HTTP ${res.status} · ${txt.slice(0, 300)}`;
      console.error('[db] guardarMicrocicloDia:', _ultimoErrorMicrociclo);
      return false;
    }
    return true;
  } catch (e) {
    _ultimoErrorMicrociclo = String(e).slice(0, 300);
    console.error('[db] guardarMicrocicloDia:', e);
    return false;
  }
}

/** Borra el microciclo completo (los días caen por cascada). */
export async function eliminarMicrociclo(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/microciclos?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: HDR_MC() }
    );
    return res.ok;
  } catch { return false; }
}

// ── ASISTENCIA LEÍDA POR EL MICROCICLO (solo lectura) ──────────

/** Presente: asistió o estaba compitiendo. */
const MC_PRESENTE = ['A', 'C'];
/** Falta con motivo — el motivo es el propio estado del formato de asistencia. */
export const MC_MOTIVO: Record<string, string> = {
  'F':  'Faltó',
  'S':  'Salud',
  'ES': 'Estudio',
  'FA': 'Familia',
  'NQ': 'No quizo',
};

export interface FaltanteDia {
  id:     string;
  nombre: string;
  codigo: string;
  motivo: string;   // Salud, Estudio, Familia, No quizo, Faltó
}

export interface ResumenAsistenciaDia {
  fecha:       string;
  convocados:  number;
  asistentes:  number;
  faltantes:   number;
  porcentaje:  number;         // 0-100
  cancelado:   boolean;        // el formador marcó CAN (sesión cancelada)
  sinRegistro: boolean;        // el formador todavía no llenó el formato
  lista:       FaltanteDia[];  // faltantes con su motivo
}

/**
 * Resumen de asistencia de un proyecto entre dos fechas.
 * Lee EXCLUSIVAMENTE la tabla `asistencia` — el microciclo no escribe nada allí.
 * Devuelve { 'YYYY-MM-DD': ResumenAsistenciaDia }.
 */
export async function getResumenAsistencia(
  proyecto: string, desde: string, hasta: string
): Promise<Record<string, ResumenAsistenciaDia>> {
  const p = (proyecto ?? '').trim();
  const out: Record<string, ResumenAsistenciaDia> = {};
  if (!p || !desde || !hasta) return out;

  let filas: any[] = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia?select=deportista_id,fecha,estado` +
      `&proyecto=eq.${encodeURIComponent(p)}&fecha=gte.${desde}&fecha=lte.${hasta}&limit=5000`,
      { headers: HDR_MC() }
    );
    if (res.ok) filas = await res.json();
  } catch { /* sin conexión → se devuelve vacío */ }

  if (!Array.isArray(filas) || !filas.length) return out;

  // Nombres y códigos para la lista de faltantes
  const nombres: Record<string, { nombre: string; codigo: string }> = {};
  try {
    const deps = await getDeportistas();
    deps.forEach(d => {
      const cols = d._columnas ?? {};
      const kCod = Object.keys(cols).find(k => /^c[oó]d/i.test(k.trim()));
      nombres[d.id] = { nombre: d._nombre, codigo: kCod ? (cols[kCod] ?? '') : '' };
    });
  } catch { /* seguimos sin nombres */ }

  for (const r of filas) {
    const fecha  = String(r.fecha ?? '');
    const estado = String(r.estado ?? '');
    if (!fecha) continue;

    if (!out[fecha]) {
      out[fecha] = { fecha, convocados: 0, asistentes: 0, faltantes: 0,
                     porcentaje: 0, cancelado: false, sinRegistro: false, lista: [] };
    }
    const dia = out[fecha];

    if (estado === 'CAN') { dia.cancelado = true; continue; }
    if (estado === 'SE' || estado === '') continue;

    if (MC_PRESENTE.includes(estado)) {
      dia.convocados++; dia.asistentes++;
    } else if (MC_MOTIVO[estado]) {
      dia.convocados++; dia.faltantes++;
      const info = nombres[r.deportista_id] ?? { nombre: r.deportista_id, codigo: '' };
      dia.lista.push({ id: r.deportista_id, nombre: info.nombre, codigo: info.codigo, motivo: MC_MOTIVO[estado] });
    }
  }

  Object.values(out).forEach(d => {
    d.porcentaje = d.convocados ? Math.round((d.asistentes / d.convocados) * 100) : 0;
    d.sinRegistro = d.convocados === 0 && !d.cancelado;
    d.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  return out;
}
