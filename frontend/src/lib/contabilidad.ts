'use client';
// ───────────────────────────────────────────────────────────────────────────
//  Contabilidad — Libro Dinámico
//  Lógica de: diccionario (cuenta/nombre → código), clasificación de conceptos,
//  transformación del extracto del banco y persistencia del libro.
// ───────────────────────────────────────────────────────────────────────────
import { createClient } from '@/lib/supabase/client';
const sb = () => createClient();

// ── Normalización (DEBE coincidir con la usada al sembrar el diccionario) ──
export function normNombre(s: any): string {
  return String(s ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function soloDigitos(s: any): string {
  return String(s ?? '').replace(/\D/g, '');
}
/** Número de cuenta normalizado: solo dígitos y SIN ceros a la izquierda.
 *  Así "00900048688" y "900048688" se tratan como la misma cuenta. */
export function normCuenta(s: any): string {
  return soloDigitos(s).replace(/^0+/, '');
}

// ── Tipos ──
export interface MovCont {
  id?: string;
  banco: string;
  fecha: string;         // YYYY-MM-DD
  descripcion: string;
  referencia: string;
  debito: number;
  credito: number;
  saldo?: number | null;
  concepto: string;
  codigo: string;
  deportista: string;
  detalle: string;
  dictado?: boolean;
  origen?: string;
  creado?: string;      // fecha de creación (orden del libro). Las divisiones la heredan de la original.
  hash: string;
  // solo en revisión (no se guarda):
  _via?: string;         // 'cuenta' | 'nombre' | 'concepto' | ''
  _pendiente?: boolean;
}
export type MapeoIdx = { cuenta: Record<string, string>; nombre: Record<string, string> };

// ── Diccionario ──
export async function getMapeoIndex(): Promise<MapeoIdx> {
  const idx: MapeoIdx = { cuenta: {}, nombre: {} };
  try {
    // Paginar por si supera el límite por defecto
    let desde = 0; const paso = 1000;
    while (true) {
      const { data, error } = await sb().from('cont_mapeo').select('tipo,clave,codigo').range(desde, desde + paso - 1);
      if (error) { console.warn('[cont] getMapeoIndex', error.message); break; }
      (data || []).forEach((r: any) => {
        if (!r.clave || !r.codigo) return;
        // Cuentas: se indexan sin ceros a la izquierda para que el cruce no falle
        if (r.tipo === 'cuenta') idx.cuenta[normCuenta(r.clave)] = String(r.codigo);
        else idx.nombre[r.clave] = String(r.codigo);
      });
      if (!data || data.length < paso) break;
      desde += paso;
    }
  } catch (e: any) { console.error('[cont] getMapeoIndex', e?.message); }
  return idx;
}

/** Lista todas las filas del diccionario (para administrarlas). */
export async function getMapeoRows(): Promise<{ id: string; tipo: string; clave: string; codigo: string }[]> {
  const out: { id: string; tipo: string; clave: string; codigo: string }[] = [];
  try {
    let desde = 0; const paso = 1000;
    while (true) {
      const { data, error } = await sb().from('cont_mapeo').select('id,tipo,clave,codigo').range(desde, desde + paso - 1);
      if (error) { console.warn('[cont] getMapeoRows', error.message); break; }
      out.push(...((data || []) as any[]));
      if (!data || data.length < paso) break;
      desde += paso;
    }
  } catch (e: any) { console.error('[cont] getMapeoRows', e?.message); }
  return out;
}

/** Elimina una entrada del diccionario (por id). */
export async function borrarMapeo(id: string): Promise<boolean> {
  try { const { error } = await sb().from('cont_mapeo').delete().eq('id', id); return !error; }
  catch { return false; }
}

export async function contarMapeo(): Promise<number> {
  try {
    const { count } = await sb().from('cont_mapeo').select('*', { count: 'exact', head: true });
    return count || 0;
  } catch { return 0; }
}

/** Guarda/actualiza entradas del diccionario (aprende). */
export async function guardarMapeo(entradas: { tipo: string; clave: string; codigo: string }[]): Promise<void> {
  const rows = entradas
    .filter(e => e.clave && e.codigo)
    .map(e => {
      // Las cuentas se guardan sin ceros a la izquierda (clave canónica)
      const clave = e.tipo === 'cuenta' ? normCuenta(e.clave) : e.clave;
      return { id: `${e.tipo[0]}_${clave}`.slice(0, 120), tipo: e.tipo, clave, codigo: String(e.codigo) };
    })
    .filter(e => e.clave);
  if (!rows.length) return;
  try {
    await sb().from('cont_mapeo').upsert(rows, { onConflict: 'tipo,clave', ignoreDuplicates: false });
  } catch (e: any) { console.error('[cont] guardarMapeo', e?.message); }
}

/** Siembra masiva del diccionario desde el JSON (una sola vez, desde el navegador). */
export async function sembrarDiccionario(arr: { t: string; k: string; c: string }[], onProg?: (n: number, tot: number) => void): Promise<number> {
  let ok = 0;
  const chunk = 500;
  for (let i = 0; i < arr.length; i += chunk) {
    const rows = arr.slice(i, i + chunk).map((e, j) => ({
      id: `seed_${i + j}`, tipo: e.t, clave: e.k, codigo: String(e.c),
    }));
    try {
      const { error } = await sb().from('cont_mapeo').upsert(rows, { onConflict: 'tipo,clave', ignoreDuplicates: true });
      if (!error) ok += rows.length;
    } catch (e: any) { console.error('[cont] sembrar', e?.message); }
    onProg?.(Math.min(i + chunk, arr.length), arr.length);
  }
  return ok;
}

// ── Catálogo de CUENTAS / conceptos (lista desplegable editable) ──
export interface Concepto { id: string; nombre: string; tipo: string; codcuenta: string; orden: number }

export async function getConceptos(): Promise<Concepto[]> {
  try {
    const { data, error } = await sb().from('cont_conceptos').select('id,nombre,tipo,codcuenta,orden').order('orden', { ascending: true });
    if (error) { console.warn('[cont] getConceptos', error.message); return []; }
    return (data || []).map((r: any) => ({ id: r.id, nombre: r.nombre || '', tipo: r.tipo || '', codcuenta: r.codcuenta || '', orden: r.orden ?? 100 }));
  } catch (e: any) { console.error('[cont] getConceptos', e?.message); return []; }
}
export async function guardarConcepto(c: Concepto): Promise<{ ok: boolean; msg?: string }> {
  const row = { id: c.id || ('con_' + Math.random().toString(36).slice(2, 8)), nombre: String(c.nombre || '').trim().toUpperCase(), tipo: c.tipo || '', codcuenta: c.codcuenta || '', orden: c.orden ?? 999 };
  if (!row.nombre) return { ok: false, msg: 'El nombre es obligatorio' };
  try {
    const { error } = await sb().from('cont_conceptos').upsert(row, { onConflict: 'id' });
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
export async function borrarConcepto(id: string): Promise<boolean> {
  try { const { error } = await sb().from('cont_conceptos').delete().eq('id', id); return !error; } catch { return false; }
}

// ── Conceptos (clasificación por descripción) ──
const PATRONES: { re: RegExp; concepto: string; tipo: string }[] = [
  { re: /4\s*X\s*1000|IMPTO GOBIERNO/i,               concepto: '4X1000',             tipo: 'gasto' },
  { re: /NOMIN/i,                                     concepto: 'NÓMINA',             tipo: 'gasto' },
  { re: /COMISION|CUOTA MANEJO|GMF|CUOTA DE MANEJO/i, concepto: 'GASTO FINANCIERO',   tipo: 'gasto' },
  { re: /ABONO INTERES|INTERESES/i,                   concepto: 'INGRESO FINANCIERO', tipo: 'ingreso' },
  { re: /A NEQUI|TRASLADO|CTA SUC VIRTUAL/i,          concepto: 'TRASLADO',           tipo: 'traslado' },
  { re: /PAGO QR|PAGO A PROVE|PROVEEDOR/i,            concepto: 'PROVEEDOR',          tipo: 'gasto' },
  { re: /PAGO PSE|PAGO TARJETA|DAVIVIENDA/i,          concepto: 'PAGO TARJETA',       tipo: 'gasto' },
];
export function clasificarConcepto(descripcion: string): { concepto: string; tipo: string } {
  const d = String(descripcion || '');
  for (const p of PATRONES) if (p.re.test(d)) return { concepto: p.concepto, tipo: p.tipo };
  return { concepto: '', tipo: '' };
}

// ── Utilidades ──
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
export function mesDesdeFecha(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || '');
  if (!m) return '';
  const mes = MESES[Number(m[2]) - 1] || '';
  return mes ? `${mes} ${m[1]}` : '';
}
export function hashMov(m: { banco: string; fecha: string; descripcion: string; referencia: string; debito: number; credito: number }): string {
  const base = `${m.banco}|${m.fecha}|${m.descripcion}|${m.referencia}|${m.debito}|${m.credito}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) { h = (h * 31 + base.charCodeAt(i)) | 0; }
  return `${m.banco}_${m.fecha}_${(h >>> 0).toString(36)}`;
}

// ── Movimientos (libro) ──
export async function ultimoSaldo(banco: string): Promise<number> {
  try {
    const { data } = await sb().from('cont_movimientos').select('saldo').eq('banco', banco).order('creado', { ascending: false }).limit(1);
    const s = data && data[0] ? Number(data[0].saldo) : 0;
    return isNaN(s) ? 0 : s;
  } catch { return 0; }
}

export async function getMovimientos(banco?: string, limite = 100000): Promise<MovCont[]> {
  // La base devuelve máx. 1000 filas por consulta. Antes paginábamos una tras otra
  // (lento). Ahora contamos primero y traemos TODAS las páginas EN PARALELO, y
  // ordenamos por fecha DESC para ver primero los movimientos más recientes.
  const paso = 1000;
  const pagina = (desde: number) => {
    let q = sb().from('cont_movimientos').select('*')
      .order('fecha', { ascending: false }).order('creado', { ascending: false }).order('id', { ascending: false })
      .range(desde, desde + paso - 1);
    if (banco) q = q.eq('banco', banco);
    return q;
  };
  try {
    // 1) contar cuántos hay
    let qc = sb().from('cont_movimientos').select('*', { count: 'exact', head: true });
    if (banco) qc = qc.eq('banco', banco);
    const { count, error: ec } = await qc;
    const total = Math.min(count ?? -1, limite);

    if (total >= 0) {
      // 2) traer todas las páginas en paralelo
      const nPags = Math.ceil(total / paso);
      const reqs = [];
      for (let p = 0; p < nPags; p++) reqs.push(pagina(p * paso));
      const results = await Promise.all(reqs);
      const out: MovCont[] = [];
      for (const r of results) { if (!(r as any).error && (r as any).data) out.push(...((r as any).data as MovCont[])); }
      return out;
    }
    if (ec) console.warn('[cont] getMovimientos count', ec.message);
  } catch (e: any) { console.error('[cont] getMovimientos parallel', e?.message); }

  // Respaldo: paginación secuencial (por si el conteo falla)
  const out: MovCont[] = [];
  try {
    for (let desde = 0; desde < limite; desde += paso) {
      const { data, error } = await pagina(desde);
      if (error) { console.warn('[cont] getMovimientos', error.message); break; }
      const lote = (data || []) as MovCont[];
      out.push(...lote);
      if (lote.length < paso) break;
    }
  } catch (e: any) { console.error('[cont] getMovimientos', e?.message); }
  return out;
}

/** Meses (Detalle) que ya tienen pago por código, para asignar el "mes pendiente". */
export async function getMesesPorCodigo(): Promise<Record<string, string[]>> {
  const acc: Record<string, Set<string>> = {};
  const paso = 1000;
  try {
    const { count } = await sb().from('cont_movimientos').select('*', { count: 'exact', head: true }).gt('credito', 0);
    const total = count ?? 0;
    const nPags = Math.ceil(total / paso);
    const reqs = [];
    for (let p = 0; p < nPags; p++) {
      reqs.push(sb().from('cont_movimientos').select('codigo,detalle').gt('credito', 0).range(p * paso, p * paso + paso - 1));
    }
    const results = await Promise.all(reqs);
    for (const r of results) {
      for (const row of (((r as any).data || []) as any[])) {
        const cod = String(row.codigo ?? '').trim();
        const det = String(row.detalle ?? '').trim();
        if (!cod || !det) continue;
        (acc[cod] = acc[cod] || new Set()).add(det);
      }
    }
  } catch (e: any) { console.error('[cont] getMesesPorCodigo', e?.message); }
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(acc)) out[k] = Array.from(acc[k]);
  return out;
}

/** Inserta movimientos evitando duplicados (por hash). Devuelve cuántos entraron. */
export async function guardarMovimientos(rows: MovCont[]): Promise<{ ok: boolean; insertados: number; msg?: string }> {
  if (!rows.length) return { ok: true, insertados: 0 };
  const limpio = rows.map(r => ({
    id: r.id || (r.hash + '_' + Math.random().toString(36).slice(2, 7)),
    banco: r.banco, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    debito: r.debito, credito: r.credito, saldo: r.saldo ?? null,
    concepto: r.concepto || '', codigo: r.codigo || '', deportista: r.deportista || '',
    detalle: r.detalle || '', dictado: !!r.dictado, origen: r.origen || '', hash: r.hash,
    // Si la fila trae `creado` (p. ej. una división que hereda el de la original),
    // lo respetamos para que quede JUNTO a su fila original; si no, la BD pone la fecha actual.
    ...(r.creado ? { creado: r.creado } : {}),
  }));
  try {
    const { error } = await sb().from('cont_movimientos').upsert(limpio, { onConflict: 'hash', ignoreDuplicates: true });
    if (error) { console.error('[cont] guardarMovimientos', error.message); return { ok: false, insertados: 0, msg: error.message }; }
    return { ok: true, insertados: limpio.length };
  } catch (e: any) { console.error('[cont] guardarMovimientos', e?.message); return { ok: false, insertados: 0, msg: String(e?.message ?? e) }; }
}

export async function borrarMovimiento(id: string): Promise<boolean> {
  try { const { error } = await sb().from('cont_movimientos').delete().eq('id', id); return !error; }
  catch { return false; }
}

/** Actualiza varios movimientos a la vez (por lista de ids) con los mismos campos. */
export async function asignarCodigoBulk(ids: string[], patch: Partial<MovCont>): Promise<boolean> {
  const limpios = ids.filter(Boolean);
  if (!limpios.length) return true;
  const campos = ['codigo', 'deportista', 'concepto', 'detalle'] as const;
  const p: any = {};
  campos.forEach(k => { if (k in patch) p[k] = (patch as any)[k]; });
  if (!Object.keys(p).length) return true;
  try {
    for (let i = 0; i < limpios.length; i += 200) {
      const lote = limpios.slice(i, i + 200);
      const { error } = await sb().from('cont_movimientos').update(p).in('id', lote);
      if (error) { console.error('[cont] asignarCodigoBulk', error.message); return false; }
    }
    return true;
  } catch (e: any) { console.error('[cont] asignarCodigoBulk', e?.message); return false; }
}

/** Actualiza los campos editables de un movimiento existente (por id). */
export async function actualizarMovimiento(id: string, patch: Partial<MovCont>): Promise<boolean> {
  if (!id) return false;
  const campos = ['fecha', 'descripcion', 'debito', 'credito', 'saldo', 'concepto', 'codigo', 'deportista', 'detalle'] as const;
  const p: any = {};
  campos.forEach(k => { if (k in patch) p[k] = (patch as any)[k]; });
  if (!Object.keys(p).length) return true;
  try {
    const { error } = await sb().from('cont_movimientos').update(p).eq('id', id);
    if (error) { console.error('[cont] actualizarMovimiento', error.message); return false; }
    return true;
  } catch (e: any) { console.error('[cont] actualizarMovimiento', e?.message); return false; }
}

export async function contarMovimientos(): Promise<number> {
  try {
    const { count } = await sb().from('cont_movimientos').select('*', { count: 'exact', head: true });
    return count || 0;
  } catch { return 0; }
}

/** Importa el LIBRO CONTABLE histórico (una sola vez) desde el JSON compacto. */
export async function importarHistorico(
  arr: { b: string; f: string; d: string; db: number; cr: number; sa: number; co: string; cd: string; dp: string; dt: string }[],
  onProg?: (n: number, tot: number) => void,
): Promise<number> {
  let ok = 0; const chunk = 400;
  for (let i = 0; i < arr.length; i += chunk) {
    const rows = arr.slice(i, i + chunk).map((e, j) => ({
      id: `H${i + j}`, hash: `H${i + j}`,
      banco: e.b || '', fecha: /^\d{4}-\d{2}-\d{2}$/.test(e.f) ? e.f : null,
      descripcion: e.d || '', referencia: '',
      debito: e.db || 0, credito: e.cr || 0, saldo: e.sa ?? null,
      concepto: e.co || '', codigo: e.cd || '', deportista: e.dp || '',
      detalle: e.dt || '', dictado: true, origen: 'histórico',
    }));
    try {
      const { error } = await sb().from('cont_movimientos').upsert(rows, { onConflict: 'hash', ignoreDuplicates: true });
      if (!error) ok += rows.length;
      else console.error('[cont] importarHistorico', error.message);
    } catch (e: any) { console.error('[cont] importarHistorico', e?.message); }
    onProg?.(Math.min(i + chunk, arr.length), arr.length);
  }
  return ok;
}

/** Cuáles hashes ya existen (para no re-insertar al revisar). */
export async function hashesExistentes(banco: string): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    let desde = 0; const paso = 1000;
    while (true) {
      const { data, error } = await sb().from('cont_movimientos').select('hash').eq('banco', banco).range(desde, desde + paso - 1);
      if (error) break;
      (data || []).forEach((r: any) => set.add(r.hash));
      if (!data || data.length < paso) break;
      desde += paso;
    }
  } catch { /* noop */ }
  return set;
}
