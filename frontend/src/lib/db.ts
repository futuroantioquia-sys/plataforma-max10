/**
 * db.ts — Capa de datos Futuro Antioquia
 * Supabase es la fuente de verdad. localStorage = caché local.
 */

import { createClient } from '@/lib/supabase/client';

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

// ── Helpers ──────────────────────────────────────────────────
function supabase() { return createClient(); }

function lsGet<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── DEPORTISTAS ───────────────────────────────────────────────

/** Lee deportistas: Supabase primero, localStorage como fallback. */
export async function getDeportistas(): Promise<Deportista[]> {
  try {
    const { data, error } = await supabase()
      .from('deportistas')
      .select('id, nombre, columnas')
      .order('nombre');

    if (error) throw error;
    if (!data || !data.length) return lsGet<Deportista[]>(LS_DEPS, []);

    const deps: Deportista[] = data.map((r: any) => ({
      id:        r.id,
      _nombre:   r.nombre,
      _columnas: r.columnas ?? {},
    }));

    lsSet(LS_DEPS, deps);
    return deps;
  } catch {
    return lsGet<Deportista[]>(LS_DEPS, []);
  }
}

/** Guarda deportistas en Supabase (upsert) y en localStorage. */
export async function saveDeportistas(deps: Deportista[]): Promise<void> {
  lsSet(LS_DEPS, deps);

  try {
    const rows = deps.map(d => ({
      id:      d.id,
      nombre:  d._nombre,
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

/** Lee todos los pagos de Supabase. Fallback: localStorage. */
export async function getPagos(): Promise<AllPagos> {
  try {
    const { data, error } = await supabase()
      .from('pagos_estado')
      .select('deportista_id, detalle, estado, v_pagado, v_cargado, destino, fecha');

    if (error) throw error;
    if (!data || !data.length) return lsGet<AllPagos>(LS_PAGOS, {});

    const all: AllPagos = {};
    for (const r of data) {
      if (!all[r.deportista_id]) all[r.deportista_id] = [];
      all[r.deportista_id].push({
        detalle:  r.detalle,
        estado:   r.estado,
        vPagado:  r.v_pagado  ?? '',
        vCargado: r.v_cargado ?? '',
        destino:  r.destino   ?? '',
        fecha:    r.fecha     ?? '',
      });
    }

    lsSet(LS_PAGOS, all);
    return all;
  } catch {
    return lsGet<AllPagos>(LS_PAGOS, {});
  }
}

/** Guarda/actualiza pagos de UN deportista en Supabase. */
export async function savePagosDeportista(depId: string, filas: FilaPago[]): Promise<void> {
  // Actualizar localStorage
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

/** Guarda todos los pagos (batch): usado al aplicar archivo banco. */
export async function saveAllPagos(all: AllPagos): Promise<void> {
  lsSet(LS_PAGOS, all);

  try {
    const rows: object[] = [];
    for (const [depId, filas] of Object.entries(all)) {
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

    // Supabase tiene límite de 1000 filas por upsert, hacemos chunks
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
