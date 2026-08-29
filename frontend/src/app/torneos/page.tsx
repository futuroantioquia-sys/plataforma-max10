'use client';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  /torneos  ·  TORNEOS Y COMPETENCIAS
//
//  Rediseño 26/08/2026 (dirección): fondo gris oscuro, el mismo del resto de la
//  app, y un CUADRO de varias columnas donde lo primero es el NÚMERO DE TORNEO.
//
//  OJO — este cuadro NO sale de las fichas de Total Afiliados. Es la relación
//  propia de la dirección: qué equipos inscribe la academia en cada torneo.
//  Se escribe encima de cualquier casilla, se agregan torneos nuevos y se
//  borra el que ya no va.
//
//  GUARDADO (dirección, 26/08/2026): SIEMPRE hay un botón GUARDAR INFORMACIÓN
//  a la vista. Mientras haya algo sin guardar se pone ámbar y dice cuántos
//  renglones faltan; cuando todo está guardado se pone verde y lo dice.
//  Además se sigue guardando solo por detrás — el botón es la tranquilidad de
//  ver el dato asegurado, no la única forma de asegurarlo — y si se intenta
//  cerrar la página con algo pendiente, el navegador avisa.
//
//  Los datos viven en la tabla public.torneos_cuadro de Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Trophy, Plus, Trash2, Search, X, Check,
  Loader2, AlertTriangle, Download, Save, CalendarPlus,
} from 'lucide-react';
import { useSoloLectura } from '@/lib/permisos';
import {
  getCuadro, guardarFilas, borrarFila, nuevoId,
  PROGRAMAS, CATEGORIAS, SEMILLA, limpiar, soloPlata, enPesos,
  type FilaTorneo,
} from '@/lib/torneos';
import { agregarPartido, diaBonito } from '@/lib/programacion';

/* ── Colores oficiales (los mismos de Retiros, Afiliados y el tablero) ────── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';
const BLANCO = '1px solid #ffffff';

type Estado = 'cargando' | 'sin-tabla' | 'listo';

/* ── Una casilla que se escribe encima ───────────────────────────────────── */
/* ── LA CASILLA DE PROGRAMA ───────────────────────────────────────────────
   (dirección, 27/08/2026)

   Antes se escribía a mano y entraban "DESARROLLO", "Desarrollo", "DESARROLO"
   y "DESA" como si fueran cuatro programas distintos; después nada cuadraba
   con las fichas. Ahora se escoge de la lista oficial y ya.

   Y SE PUEDE ESCOGER MÁS DE UNO: hay torneos donde compite más de un programa
   —una ASOBDIM que junta DESARROLLO y SELECCIÓN, por ejemplo—. Se marcan los
   que sean y quedan escritos separados por coma: "DESARROLLO, SELECCIÓN".

   Se guarda EXACTAMENTE como se escribe aquí, en mayúsculas y con tilde, que
   es como están en la lista oficial. */
function CasillaProgramas({ valor, onChange, bloqueada }: {
  valor: string;
  onChange: (v: string) => void;
  bloqueada?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  const puestos = String(valor ?? '')
    .split(',').map(p => p.trim()).filter(Boolean);

  const igual = (a: string, b: string) =>
    a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim() ===
    b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  /* Lo que ya estaba escrito y no está en la lista oficial NO se pierde: se
     muestra igual y se puede desmarcar. */
  const lista = [
    ...PROGRAMAS,
    ...puestos.filter(p => !PROGRAMAS.some(o => igual(o, p))),
  ];

  function marcar(prog: string) {
    const esta = puestos.some(p => igual(p, prog));
    const next = esta
      ? puestos.filter(p => !igual(p, prog))
      : [...puestos, prog];
    /* Se guardan en el orden oficial, no en el orden en que se fueron
       marcando: así dos torneos con los mismos programas se escriben igual. */
    next.sort((a, b) => rankProgramaLocal(a) - rankProgramaLocal(b));
    onChange(next.join(', '));
  }

  function rankProgramaLocal(p: string): number {
    const i = PROGRAMAS.findIndex(o => igual(o, p));
    return i >= 0 ? i : PROGRAMAS.length;
  }

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', conEsc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', conEsc);
    };
  }, [abierta]);

  if (bloqueada) {
    return (
      <span className="block px-1 text-center text-white font-semibold">
        {valor || <span className="text-white/25">—</span>}
      </span>
    );
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        title="Escoge el programa. Puedes marcar más de uno."
        className="w-full px-1.5 py-[3px] rounded text-center text-white font-semibold text-[12.5px]
          leading-tight transition"
        style={{
          background: abierta ? CAMPO : 'transparent',
          border: `1px solid ${abierta ? VERDE : 'transparent'}`,
        }}>
        {puestos.length
          ? puestos.join(', ')
          : <span className="text-white/25">— Escoger —</span>}
      </button>

      {abierta && (
        <div className="absolute z-50 mt-1 rounded-xl overflow-hidden left-1/2 -translate-x-1/2"
          style={{ background: PANEL, border: `1px solid ${BORDE}`, minWidth: 200,
                   boxShadow: '0 18px 40px rgba(0,0,0,.45)' }}>
          <p className="px-3 py-2 text-[9.5px] font-black text-white/45 uppercase tracking-widest"
            style={{ borderBottom: `1px solid ${BORDE}` }}>
            Marca uno o varios
          </p>
          {lista.map(prog => {
            const marcado = puestos.some(p => igual(p, prog));
            return (
              <button key={prog} type="button"
                onClick={() => marcar(prog)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition">
                <span className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                  style={{
                    background: marcado ? VERDE : 'transparent',
                    border: `1px solid ${marcado ? VERDE : BORDE}`,
                  }}>
                  {marcado && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className={`text-white text-[12px] ${marcado ? 'font-black' : 'font-semibold'}`}>
                  {prog}
                </span>
              </button>
            );
          })}
          {puestos.length > 0 && (
            <button type="button"
              onClick={() => { onChange(''); setAbierta(false); }}
              style={{ borderTop: `1px solid ${BORDE}` }}
              className="w-full text-left px-3 py-2 text-[11px] font-bold text-white/50 hover:text-white transition">
              Quitar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Casilla({
  valor, onChange, lista, ancho, centro, fuerte, bloqueada,
}: {
  valor: string;
  onChange: (v: string) => void;
  lista: string;
  ancho?: number;
  centro?: boolean;
  fuerte?: boolean;
  bloqueada?: boolean;
}) {
  const [foco, setFoco] = useState(false);
  if (bloqueada) {
    return (
      <span className={`block px-1 text-white ${centro ? 'text-center' : ''} ${fuerte ? 'font-black' : 'font-semibold'}`}>
        {valor || <span className="text-white/25">—</span>}
      </span>
    );
  }
  return (
    <>
      <input
        value={valor}
        list={lista}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        style={{
          width: ancho ?? '100%',
          background: foco ? CAMPO : 'transparent',
          border: `1px solid ${foco ? VERDE : 'transparent'}`,
          height: 28,
        }}
        className={`rounded px-1.5 text-white text-[12px] outline-none
          ${centro ? 'text-center' : ''} ${fuerte ? 'font-black' : 'font-semibold'}`}
      />
    </>
  );
}

/* ── La casilla del VALOR DEL TORNEO ──────────────────────────────────────
   Se escribe solo con números y en pantalla queda con el punto de los miles.
   El cero se ve vacío: así se distingue de un dato que todavía no se sabe. */
function CasillaPlata({ valor, onChange, bloqueada }: {
  valor: number; onChange: (n: number) => void; bloqueada?: boolean;
}) {
  const [foco, setFoco] = useState(false);
  if (bloqueada) {
    return (
      <span className="block px-1 text-white text-right font-black">
        {enPesos(valor) || <span className="text-white/25">—</span>}
      </span>
    );
  }
  return (
    <input
      inputMode="numeric"
      value={valor ? valor.toLocaleString('es-CO') : ''}
      placeholder="$"
      onChange={e => onChange(soloPlata(e.target.value))}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
      style={{
        width: '100%',
        background: foco ? CAMPO : 'transparent',
        border: `1px solid ${foco ? VERDE : 'transparent'}`,
        height: 28,
      }}
      className="rounded px-1.5 text-white text-[12px] text-right font-black outline-none placeholder:text-white/20"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function TorneosPage() {
  const router = useRouter();
  const soloLectura = useSoloLectura();

  /* ── CREAR PARTIDOS DESDE AQUÍ (dirección, 29/08/2026) ────────────────────
     Se chulean los torneos que juegan ese día —el 5, el 10, el 15…—, se
     escoge el DÍA en el calendario y con un botón quedan creados los renglones
     en PROGRAMACIÓN DE COMPETENCIA, ya con el torneo y el día puestos. Allá
     solo falta llenar hora, rival, escenario, D.T y A.T.
     El chulo NO se guarda en la base: es una marca del momento. */
  const [chuleados, setChuleados] = useState<Set<string>>(new Set());
  const [diaPartido, setDiaPartido] = useState('');
  const [creando, setCreando] = useState(false);
  const [avisoProg, setAvisoProg] = useState('');

  function chulear(id: string) {
    setChuleados(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  const [estado, setEstado]   = useState<Estado>('cargando');
  const [filas, setFilas]     = useState<FilaTorneo[]>([]);
  const [buscar, setBuscar]   = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado]   = useState(false);
  const [error, setError]     = useState('');
  const [sembrando, setSembrando] = useState(false);
  const [sinGuardar, setSinGuardar] = useState(0);   // renglones tocados y no guardados

  const pendientes  = useRef<Map<string, FilaTorneo>>(new Map());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisoTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Cargar ───────────────────────────────────────────────────────────── */
  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError('');
    try {
      const c = await getCuadro();
      if (c === null) { setEstado('sin-tabla'); return; }
      setFilas(c);
      setEstado('listo');
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el cuadro.');
      setEstado('listo');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Mandar a la base lo que esté pendiente ─────────────────────────────
     Es lo que hace el botón GUARDAR INFORMACIÓN y también lo que corre solo
     unos segundos después de dejar de escribir. Si algo falla, lo pendiente
     NO se pierde: se devuelve a la lista para poder reintentar. */
  const guardarAhora = useCallback(async () => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
    const lote = Array.from(pendientes.current.values());
    if (!lote.length) {
      // Nada pendiente: se confirma igual, para que el botón siempre responda.
      setGuardado(true);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
      avisoTimer.current = setTimeout(() => setGuardado(false), 1800);
      return;
    }
    pendientes.current.clear();
    setSinGuardar(0);
    setGuardando(true);
    setError('');
    try {
      await guardarFilas(lote);
      setGuardado(true);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
      avisoTimer.current = setTimeout(() => setGuardado(false), 1800);
    } catch (e: any) {
      // Se devuelven a pendientes para no perder lo escrito.
      lote.forEach(f => pendientes.current.set(f.id, f));
      setSinGuardar(pendientes.current.size);
      setError(e?.message ?? 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }, []);

  /* ── Guardado automático (la red de seguridad) ──────────────────────────
     Cada cambio se apunta y, dos segundos después de la última tecla, se
     manda todo junto. Así escribir un nombre no dispara doce guardadas. */
  const programarGuardado = useCallback((cambiadas: FilaTorneo[]) => {
    cambiadas.forEach(f => pendientes.current.set(f.id, f));
    setSinGuardar(pendientes.current.size);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { guardarAhora(); }, 2000);
  }, [guardarAhora]);

  /* Si se intenta cerrar la pestaña con algo sin guardar, el navegador avisa. */
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sinGuardar]);

  /* ── Editar una casilla ───────────────────────────────────────────────── */
  function editar(id: string, campo: keyof FilaTorneo, valor: string | number) {
    const next = filas.map(f => (f.id === id ? { ...f, [campo]: valor } : f));
    setFilas(next);
    const cambiada = next.find(f => f.id === id);
    if (cambiada) programarGuardado([cambiada]);
  }

  /* ── Agregar un torneo al final ───────────────────────────────────────── */
  function agregar() {
    const nueva: FilaTorneo = {
      id: nuevoId(),
      orden: (filas.length ? Math.max(...filas.map(f => f.orden)) : 0) + 1,
      torneo: '', programa: '', categoria: '', nombre: '', formador: '', valor: 0,
    };
    setFilas([...filas, nueva]);
    programarGuardado([nueva]);
    // Deja el renglón nuevo a la vista.
    setTimeout(() => {
      const fin = document.getElementById('fin-del-cuadro');
      fin?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  /* ── Borrar un renglón ────────────────────────────────────────────────── */
  async function borrar(f: FilaTorneo) {
    const cual = [f.torneo, f.categoria, f.nombre].filter(Boolean).join(' · ') || 'este renglón';
    if (!confirm(`¿Borrar ${cual}?\n\nNo se puede deshacer.`)) return;
    setFilas(filas.filter(x => x.id !== f.id));
    pendientes.current.delete(f.id);
    setSinGuardar(pendientes.current.size);
    try {
      await borrarFila(f.id);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo borrar.');
      cargar();
    }
  }

  /* ── Cargar el cuadro que entregó la dirección ────────────────────────── */
  async function sembrar() {
    setSembrando(true);
    setError('');
    try {
      const nuevas: FilaTorneo[] = SEMILLA.map((s, i) => ({ ...s, id: nuevoId(), orden: i + 1 }));
      await guardarFilas(nuevas);
      setFilas(nuevas);
      pendientes.current.clear();
      setSinGuardar(0);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el cuadro inicial.');
    } finally {
      setSembrando(false);
    }
  }

  /* ── Descargar a Excel (CSV, se abre en Excel de una) ─────────────────── */
  function descargar() {
    const cab = ['# TOR', 'TORNEO', 'PROGRAMA', 'CATEGORIA', 'NOMBRE', 'FORMADOR', 'VALOR DEL TORNEO'];
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [cab.map(esc).join(';')];
    filas.forEach((f, i) => {
      lineas.push([String(i + 1), f.torneo, f.programa, f.categoria, f.nombre, f.formador,
                   String(f.valor || 0)].map(esc).join(';'));
    });
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'torneos-y-competencias.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ── Listas de sugerencias (salen de lo que ya está escrito) ──────────── */
  /** Crea en PROGRAMACIÓN un renglón por cada torneo chuleado, con el día ya
   *  puesto. — dirección, 29/08/2026 */
  async function crearPartidosProgramados() {
    setAvisoProg('');
    if (chuleados.size === 0) {
      setAvisoProg('Primero chulea los torneos que juegan ese día.');
      return;
    }
    if (!diaPartido) {
      setAvisoProg('Escoge el DÍA DE JUEGO en el calendario.');
      return;
    }
    setCreando(true);
    try {
      /* El número del torneo es su puesto en el cuadro: el mismo que se ve en
         la columna # TOR y el que se escribe en el pospartido. */
      const numeroDe = new Map<string, number>();
      filas.forEach((f, i) => numeroDe.set(f.id, i + 1));

      let hechos = 0;
      for (const id of chuleados) {
        const num = numeroDe.get(id);
        if (!num) continue;
        await agregarPartido({ torneo_num: String(num), fecha: diaPartido });
        hechos++;
      }
      setChuleados(new Set());
      setAvisoProg(
        `Listo: se crearon ${hechos} ${hechos === 1 ? 'partido' : 'partidos'} para el ` +
        `${diaBonito(diaPartido)} en Programación de Competencia. Allá se les pone hora, rival y escenario.`,
      );
    } catch (e: any) {
      setAvisoProg(e?.message ?? 'No se pudieron crear los partidos.');
    } finally {
      setCreando(false);
    }
  }

  const sugerencias = useMemo(() => {
    const junta = (campo: keyof FilaTorneo, base: string[] = []) => {
      const s = new Set<string>(base);
      filas.forEach(f => { const v = limpiar(f[campo]); if (v) s.add(v); });
      return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
    };
    return {
      torneo:    junta('torneo'),
      programa:  junta('programa', PROGRAMAS),
      categoria: junta('categoria', CATEGORIAS),
      nombre:    junta('nombre'),
      formador:  junta('formador'),
    };
  }, [filas]);

  /* ── Buscador ─────────────────────────────────────────────────────────── */
  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    if (!q) return filas.map((f, i) => ({ f, n: i + 1 }));
    return filas
      .map((f, i) => ({ f, n: i + 1 }))
      .filter(({ f }) =>
        `${f.torneo} ${f.programa} ${f.categoria} ${f.nombre} ${f.formador}`
          .toUpperCase().includes(q));
  }, [filas, buscar]);

  const torneosDistintos = useMemo(
    () => new Set(filas.map(f => limpiar(f.torneo).toUpperCase()).filter(Boolean)).size,
    [filas],
  );

  /* Lo que suma el cuadro. Si se está buscando, suma SOLO lo que está a la
     vista: sirve para saber cuánto cuesta un torneo completo. */
  const totalVisible = useMemo(
    () => visibles.reduce((s, { f }) => s + (Number(f.valor) || 0), 0),
    [visibles],
  );

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-16" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
        <button onClick={() => router.push('/dashboard')} aria-label="Volver"
          className="rounded-xl flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-black text-base leading-tight">Torneos y Competencias</h1>
          <p className="text-white/55 text-[11px] leading-tight">
            {estado === 'listo'
              ? `${filas.length} equipos inscritos · ${torneosDistintos} torneos`
              : 'Cuadro de equipos inscritos'}
          </p>
        </div>

        {/* EL BOTÓN DE GUARDAR — siempre a la vista mientras haya cuadro.
            Ámbar cuando falta guardar algo, verde cuando ya está todo. */}
        {estado === 'listo' && filas.length > 0 && !soloLectura && (
          <button onClick={guardarAhora} disabled={guardando}
            title="Guardar la información del cuadro"
            className="flex items-center gap-2 px-4 rounded-xl text-white font-black text-[12px] shrink-0 disabled:opacity-70"
            style={{ height: 44, background: sinGuardar > 0 ? AMBAR : VERDE }}>
            {guardando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> GUARDANDO…</>
              : guardado
                ? <><Check className="w-4 h-4" /> GUARDADO</>
                : <><Save className="w-4 h-4" />
                    <span className="hidden sm:inline">GUARDAR INFORMACIÓN</span>
                    <span className="sm:hidden">GUARDAR</span>
                    {sinGuardar > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px]"
                        style={{ background: 'rgba(0,0,0,.25)' }}>{sinGuardar}</span>
                    )}
                  </>}
          </button>
        )}

        {estado === 'listo' && filas.length > 0 && (
          <button onClick={descargar} title="Bajar a Excel"
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
            <Download className="w-4 h-4 text-white" />
          </button>
        )}
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1250 }}>

        {/* ── Aviso de error ── */}
        {error && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: 'rgba(192,80,77,.18)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[12px] font-semibold">{error}</p>
          </div>
        )}

        {/* ── Cargando ── */}
        {estado === 'cargando' && (
          <div className="rounded-2xl py-16 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-white/40 animate-spin" />
            <p className="text-white/55 text-[13px] font-semibold">Abriendo el cuadro…</p>
          </div>
        )}

        {/* ── Falta la tabla ── */}
        {estado === 'sin-tabla' && (
          <div className="rounded-2xl p-8 text-center" style={{ background: PANEL, border: `1px solid ${AMBAR}` }}>
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: AMBAR }} />
            <p className="text-white font-black text-[15px]">Falta preparar la tabla.</p>
            <p className="text-white/60 text-[12.5px] mt-2 leading-relaxed">
              El cuadro de torneos guarda sus datos en su propia tabla, y esa tabla
              todavía no existe.
            </p>
            <p className="text-white text-[13px] font-black mt-4">
              Corre una sola vez el archivo
              <span style={{ color: AMBAR }}> PASO-CREAR-TABLA-TORNEOS.bat</span>
            </p>
            <p className="text-white/50 text-[12px] mt-1">
              Está en la carpeta del proyecto. Cuando termine, vuelve aquí y oprime F5.
            </p>
            <button onClick={cargar}
              className="mt-5 rounded-xl px-5 text-white font-black text-[12.5px]"
              style={{ height: 44, background: VERDE }}>
              Ya lo corrí, volver a mirar
            </button>
          </div>
        )}

        {/* ── Cuadro en blanco: cargar la relación de la dirección ── */}
        {estado === 'listo' && filas.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
            <Trophy className="w-10 h-10 mx-auto mb-3 text-white/25" />
            <p className="text-white font-black text-[15px]">El cuadro está en blanco.</p>
            <p className="text-white/60 text-[12.5px] mt-2 leading-relaxed">
              Puedes cargar de una vez la relación de {SEMILLA.length} equipos que entregó
              la dirección, y de ahí en adelante corriges y agregas lo que haga falta.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              <button onClick={sembrar} disabled={sembrando || soloLectura}
                className="rounded-xl px-5 text-white font-black text-[12.5px] disabled:opacity-50 flex items-center gap-2"
                style={{ height: 44, background: VERDE }}>
                {sembrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Cargar el cuadro inicial ({SEMILLA.length} torneos)
              </button>
              <button onClick={agregar} disabled={soloLectura}
                className="rounded-xl px-5 text-white font-black text-[12.5px] disabled:opacity-50 flex items-center gap-2"
                style={{ height: 44, background: CAMPO, border: `1px solid ${BORDE}` }}>
                <Plus className="w-4 h-4" /> Empezar en blanco
              </button>
            </div>
          </div>
        )}

        {/* ══ EL CUADRO ══ */}
        {estado === 'listo' && filas.length > 0 && (
          <>
            {/* Buscador */}
            <div className="rounded-xl px-3 py-2 flex items-center gap-2 mb-3"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: GRIS }} />
                <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)}
                  placeholder="Buscar torneo, categoría, equipo o formador…"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 36 }}
                  className="w-full pl-8 pr-3 rounded-lg text-[12px] text-white placeholder:text-white/30 outline-none" />
              </div>
              {buscar && (
                <button onClick={() => setBuscar('')}
                  className="rounded-lg flex items-center justify-center"
                  style={{ width: 36, height: 36, background: CAMPO, border: `1px solid ${BORDE}` }}>
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
              <span className="text-white/45 text-[11px] font-black shrink-0 pr-1">
                {visibles.length}/{filas.length}
              </span>
            </div>

            {/* ── CREAR PARTIDOS DESDE EL CUADRO (dirección, 29/08/2026) ─────
                Se chulean en la primera columna los torneos que juegan ese
                día, se escoge el DÍA aquí, y con el botón quedan creados los
                renglones en PROGRAMACIÓN DE COMPETENCIA con el torneo y el día
                ya puestos. Allá solo falta hora, rival, escenario, D.T y A.T. */}
            {!soloLectura && (
            <div className="rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center gap-2"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <span className="text-white/45 text-[10px] font-black uppercase tracking-widest">
                Crear partidos
              </span>

              <span className="rounded-lg px-2.5 flex items-center text-white text-[11.5px] font-black"
                style={{ height: 34, background: CAMPO, border: `1px solid ${chuleados.size ? VERDE : BORDE}` }}>
                {chuleados.size} {chuleados.size === 1 ? 'torneo chuleado' : 'torneos chuleados'}
              </span>

              <input
                type="date"
                value={diaPartido}
                onChange={e => setDiaPartido(e.target.value)}
                title="El día en que se juegan esos torneos"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 34, colorScheme: 'dark' }}
                className="rounded-lg px-2 text-white text-[12px] font-bold outline-none cursor-pointer" />

              {!!diaPartido && (
                <span className="text-white/50 text-[11.5px] font-black">{diaBonito(diaPartido)}</span>
              )}

              <button
                onClick={crearPartidosProgramados}
                disabled={creando || chuleados.size === 0 || !diaPartido}
                title="Crea los renglones en Programación de Competencia"
                className="rounded-lg px-3 flex items-center gap-1.5 text-white text-[11.5px] font-black
                  transition hover:brightness-110 disabled:opacity-45"
                style={{ height: 34, background: VERDE }}>
                {creando
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CalendarPlus className="w-3.5 h-3.5" />}
                {creando ? 'CREANDO…' : 'CREAR PARTIDO'}
              </button>

              {chuleados.size > 0 && (
                <button
                  onClick={() => setChuleados(new Set())}
                  className="rounded-lg px-2.5 text-white/60 text-[11px] font-black"
                  style={{ height: 34, background: CAMPO, border: `1px solid ${BORDE}` }}>
                  QUITAR CHULOS
                </button>
              )}

              <button
                onClick={() => router.push('/programacion')}
                className="ml-auto rounded-lg px-2.5 text-white/70 text-[11px] font-black"
                style={{ height: 34, background: CAMPO, border: `1px solid ${BORDE}` }}>
                IR A PROGRAMACIÓN
              </button>
            </div>
            )}

            {!!avisoProg && (
              <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
                style={{ background: 'rgba(0,176,80,.14)', border: `1px solid ${VERDE}` }}>
                <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#5BE39B' }} />
                <p className="text-white text-[12.5px] font-semibold leading-relaxed flex-1">{avisoProg}</p>
                <button onClick={() => setAvisoProg('')} className="shrink-0">
                  <X className="w-4 h-4 text-white/50" />
                </button>
              </div>
            )}

            {/* Las sugerencias de cada columna, una sola vez para todo el cuadro */}
            <datalist id="lista-torneo">{sugerencias.torneo.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="lista-programa">{sugerencias.programa.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="lista-categoria">{sugerencias.categoria.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="lista-nombre">{sugerencias.nombre.map(o => <option key={o} value={o} />)}</datalist>
            <datalist id="lista-formador">{sugerencias.formador.map(o => <option key={o} value={o} />)}</datalist>

            {/* Tabla */}
            <div className="rounded-xl overflow-auto"
              style={{ border: `1px solid ${BORDE}`, maxHeight: 'calc(100vh - 230px)' }}>
              <table className="text-[12px]"
                style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 960 }}>
                <thead>
                  <tr>
                    {[
                      { h: '', w: 40 },          /* el chulo */
                      { h: '# TOR', w: 62 },
                      { h: 'TORNEO', w: 200 },
                      { h: 'PROGRAMA', w: 175 },
                      { h: 'CATEGORÍA', w: 110 },
                      { h: 'NOMBRE', w: 150 },
                      { h: 'FORMADOR', w: 165 },
                      { h: 'VALOR DEL TORNEO', w: 140 },
                      { h: '', w: 52 },
                    ].map((c, i) => (
                      <th key={i}
                        className="sticky top-0 z-10 px-2 py-2 text-center font-black text-[10px] whitespace-nowrap text-white"
                        style={{
                          background: VERDE, borderRight: BLANCO, borderBottom: BLANCO, borderTop: BLANCO,
                          width: c.w,
                        }}>
                        {c.h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(({ f, n }) => (
                    <tr key={f.id} style={{ background: PANEL }}>
                      {/* EL CHULO — para escoger los torneos que juegan un día
                          y crearles el partido de una. — 29/08/2026 */}
                      <td className="px-1 py-[5px] text-center"
                        style={{ borderRight: BLANCO, borderBottom: BLANCO, background: CAMPO }}>
                        <button
                          onClick={() => chulear(f.id)}
                          disabled={soloLectura}
                          title={chuleados.has(f.id)
                            ? 'Chuleado · clic para quitarlo'
                            : 'Chulear este torneo para crearle el partido'}
                          className="rounded-md flex items-center justify-center mx-auto transition disabled:opacity-40"
                          style={{
                            width: 22, height: 22,
                            background: chuleados.has(f.id) ? VERDE : 'transparent',
                            border: `2px solid ${chuleados.has(f.id) ? VERDE : BORDE}`,
                          }}>
                          {chuleados.has(f.id) && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                        </button>
                      </td>
                      {/* # TOR — la columna fundamental */}
                      <td className="px-2 py-[6px] text-center font-black text-white text-[15px]"
                        style={{ borderRight: BLANCO, borderBottom: BLANCO, background: CAMPO }}>
                        {n}
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <Casilla valor={f.torneo} bloqueada={soloLectura} fuerte
                          lista="lista-torneo"
                          onChange={v => editar(f.id, 'torneo', v)} />
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <CasillaProgramas valor={f.programa} bloqueada={soloLectura}
                          onChange={v => editar(f.id, 'programa', v)} />
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <Casilla valor={f.categoria} bloqueada={soloLectura} centro fuerte
                          lista="lista-categoria"
                          onChange={v => editar(f.id, 'categoria', v)} />
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <Casilla valor={f.nombre} bloqueada={soloLectura}
                          lista="lista-nombre"
                          onChange={v => editar(f.id, 'nombre', v)} />
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <Casilla valor={f.formador} bloqueada={soloLectura}
                          lista="lista-formador"
                          onChange={v => editar(f.id, 'formador', v)} />
                      </td>
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
                        <CasillaPlata valor={f.valor} bloqueada={soloLectura}
                          onChange={n => editar(f.id, 'valor', n)} />
                      </td>
                      {/* Eliminar */}
                      <td className="px-1 py-[5px]" style={{ borderRight: BLANCO, borderBottom: BLANCO, background: CAMPO }}>
                        {!soloLectura && (
                          <div className="flex items-center justify-center">
                            <button onClick={() => borrar(f)} title="Borrar este renglón"
                              className="rounded-lg flex items-center justify-center"
                              style={{ width: 28, height: 28, background: PANEL, border: `1px solid ${BORDE}` }}>
                              <Trash2 className="w-3.5 h-3.5" style={{ color: ROJO }} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-white/45 text-[13px] font-semibold"
                        style={{ background: PANEL }}>
                        Ningún torneo coincide con “{buscar}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div id="fin-del-cuadro" />
            </div>

            {/* Lo que suma */}
            <div className="rounded-xl px-3 py-2 mt-2 flex items-center justify-between"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <span className="text-white/55 text-[11.5px] font-semibold">
                {buscar
                  ? `Valor de los ${visibles.length} torneos que estás viendo`
                  : 'Valor de todos los torneos del cuadro'}
              </span>
              <span className="text-white font-black text-[15px]">
                {enPesos(totalVisible) || '$ 0'}
              </span>
            </div>

            {/* Agregar */}
            {!soloLectura && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button onClick={agregar}
                  className="rounded-xl px-5 text-white font-black text-[12.5px] flex items-center gap-2"
                  style={{ height: 44, background: CAMPO, border: `1px solid ${BORDE}` }}>
                  <Plus className="w-4 h-4" /> AGREGAR TORNEO
                </button>
                <button onClick={guardarAhora} disabled={guardando}
                  className="rounded-xl px-6 text-white font-black text-[12.5px] flex items-center gap-2 disabled:opacity-70"
                  style={{ height: 44, background: sinGuardar > 0 ? AMBAR : VERDE }}>
                  {guardando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> GUARDANDO…</>
                    : <><Save className="w-4 h-4" /> GUARDAR INFORMACIÓN</>}
                </button>
                <p className="text-white/40 text-[11px]">
                  {sinGuardar > 0
                    ? `Hay ${sinGuardar} ${sinGuardar === 1 ? 'renglón' : 'renglones'} sin guardar.`
                    : 'Todo está guardado. Escribe encima de cualquier casilla para corregir.'}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
