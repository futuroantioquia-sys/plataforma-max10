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
  Loader2, AlertTriangle, Download, Save, CalendarPlus, Users, Zap,
} from 'lucide-react';

/** Donde queda apuntado el filtro que dejó puesto la dirección, para que al
 *  volver de cargar un torneo el cuadro salga igual que como lo dejó. */
const LLAVE_FILTROS = 'futuro-torneos-filtros';
import { getDeportistas, updateColumnasDeportista, type Deportista } from '@/lib/db';
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
const VERDECL = '#5BE39B';   // el verde claro, para los letreros chiquitos
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';
const BLANCO = '1px solid #ffffff';

type Estado = 'cargando' | 'sin-tabla' | 'listo';

/* ═══════════════════════════════════════════════════════════════════════════
   VER EL EQUIPO DE CADA TORNEO  ·  dirección, 31/08/2026

   "Que en Torneos nos aparezcan los deportistas que están agregados, un VER
   EQUIPO en cada renglón para examinar, ya que al parecer cargamos mal
   algunos deportistas."

   El deportista NO se guarda dentro del torneo: es al revés. Cada ficha tiene
   cuatro casillas de competencia (C1 a C4) y ahí queda escrito el NÚMERO del
   torneo que juega. Entonces para armar el equipo de un torneo hay que leer
   todas las fichas y recoger las que tengan ese número.

   Y ya que se está mirando, la pantalla misma señala lo que huele mal, que es
   justo lo que hay que cazar:
     · el deportista de otro PROGRAMA metido en este torneo
     · el de otra CATEGORÍA (un SUB 9 en un torneo SUB 8)
     · el RETIRADO o PAUSADO que quedó cargado
   ═════════════════════════════════════════════════════════════════════════ */

/** Lee una casilla de la ficha por el nombre de la columna. */
function casillaDe(dep: Deportista, rx: RegExp): string {
  const cols = (dep as any)?._columnas ?? {};
  const k = Object.keys(cols).find(k => rx.test(k.trim()));
  return k ? String(cols[k] ?? '') : '';
}

/** Las cuatro casillas de competencia de la ficha (C1..C4). */
const RX_COMPETENCIAS = [
  /^compite$|torneo.?1|^c\s*1$/i,
  /torneo.?2|^c\s*2$/i,
  /torneo.?3|^c\s*3$/i,
  /torneo.?4|^c\s*4$/i,
  /* QUINTA COMPETENCIA (dirección, 02/09/2026): en Total Afiliados se agregó
     C5 porque hay deportistas que juegan cinco torneos al año. Si esta lista
     no la mira, un torneo puesto en C5 no le armaría el equipo a nadie. */
  /torneo.?5|^c\s*5$/i,
];
const CLAVES_VIRTUALES = ['__TORNEO1__', '__TORNEO2__', '__TORNEO3__', '__TORNEO4__', '__TORNEO5__'];

/** Los números de torneo que tiene puestos el deportista en su ficha. */
function torneosDelDeportista(dep: Deportista): number[] {
  const cols = (dep as any)?._columnas ?? {};
  return RX_COMPETENCIAS
    .map((rx, i) => casillaDe(dep, rx) || String(cols[CLAVES_VIRTUALES[i]] ?? ''))
    .map(v => parseInt(String(v).trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

/** Un reparo sobre un deportista. `grave` es lo que de verdad hay que
 *  corregir; lo que no es grave se muestra en gris, como dato. */
type Aviso = { texto: string; grave: boolean };

/** Sin tildes y en mayúsculas, para poder comparar sin sorpresas. */
function norm(v: any): string {
  return limpiar(v).toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/\s+/g, ' ').trim();
}

/** "DESARROLLO SUB 9" → "9". Vacío si no dice ninguna. */
function subDe(v: any): string {
  const m = norm(v).match(/SUB\s*(\d+)/);
  return m ? m[1] : '';
}

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
/* ── EL PRIMERO ES EL DUEÑO DEL TORNEO ────────────────────────────────────
   (dirección, 02/09/2026)

   «Si bien hay torneos que tienen 2 o 3 programas, estos torneos pertenecen a
    un solo programa. Haz que solo aparezca el programa en el cual hay mayor
    cantidad de deportistas… al lado izquierdo del programa, una barra para
    subir o bajar la jerarquía.»

   QUÉ CAMBIÓ. La casilla sigue guardando varios programas separados por coma,
   pero AHORA EL ORDEN MANDA: el primero es el programa del torneo, y es el
   único que se ve —en esta columna y en el filtro de Programación—. Los demás
   quedan debajo, marcados, y siguen sirviendo para que a un deportista de ese
   otro programa se le pueda asignar el torneo. Nadie pierde acceso: esa fue la
   opción A que escogió la dirección.

   Antes el orden se reescribía solo, alfabético según la lista oficial. Eso se
   quitó: si la dirección sube un programa con la flechita, ese orden es el que
   vale y no se le vuelve a tocar.

   EL NÚMERO DE LA DERECHA es cuántos deportistas de ese programa tienen este
   torneo asignado hoy. No decide nada por sí solo —decide quien mira—, pero
   ahí se ve de una si el de arriba es el que debe ser. */
function CasillaProgramas({ valor, onChange, bloqueada, conteos }: {
  valor: string;
  onChange: (v: string) => void;
  bloqueada?: boolean;
  /** Programa (sin tildes, en mayúscula) → cuántos deportistas suyos lo juegan. */
  conteos?: Record<string, number>;
}) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  /* DÓNDE PINTAR LA LISTICA (dirección, 02/09/2026)

     «la lista desplegable no se ve cuando se abre».

     Y era cierto: se pintaba PEGADA a la casilla (position absolute), y el
     cuadro de los torneos vive dentro de un recuadro con `overflow-auto` —o
     sea, con tijeras en los bordes—. Todo lo que se saliera quedaba cortado.
     Con un solo torneo en pantalla, la listica caía justo en el borde de abajo
     y se la comía completa.

     Ahora se mide dónde quedó la casilla y la listica se pinta FIJA sobre la
     pantalla, por encima de todo: ya no hay recuadro que la corte. Si no cabe
     hacia abajo, se abre hacia arriba. Y se cierra si la pantalla se mueve. */
  const boton = useRef<HTMLButtonElement | null>(null);
  const [donde, setDonde] = useState<{ top: number; left: number } | null>(null);
  const ALTO_LISTICA = 300;   // lo que mide con los seis programas

  function medir() {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const cabeAbajo = window.innerHeight - r.bottom > ALTO_LISTICA;
    setDonde({
      top:  cabeAbajo ? r.bottom + 6 : Math.max(8, r.top - ALTO_LISTICA - 6),
      left: Math.min(Math.max(8, r.left + r.width / 2 - 160), Math.max(8, window.innerWidth - 328)),
    });
  }

  const puestos = String(valor ?? '')
    .split(',').map(p => p.trim()).filter(Boolean);

  const igual = (a: string, b: string) =>
    a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim() ===
    b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  const pelado = (p: string) =>
    p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  const cuantos = (p: string) => conteos?.[pelado(p)] ?? 0;

  /* Lo que ya estaba escrito y no está en la lista oficial NO se pierde: se
     muestra igual y se puede desmarcar. */
  const sinMarcar = PROGRAMAS.filter(o => !puestos.some(p => igual(p, o)));

  /* El orden de la listica: primero los marcados EN SU ORDEN GUARDADO —el de
     arriba es el dueño—, y debajo los que no están marcados. */
  const lista = [...puestos, ...sinMarcar];

  function marcar(prog: string) {
    const esta = puestos.some(p => igual(p, prog));
    /* Al marcar uno nuevo entra DE ÚLTIMO: nunca le quita el puesto al dueño
       sin que la dirección lo decida con la flechita. */
    const next = esta
      ? puestos.filter(p => !igual(p, prog))
      : [...puestos, prog];
    onChange(next.join(', '));
  }

  /** Sube o baja un programa en la jerarquía. Solo se mueven los marcados. */
  function mover(prog: string, paso: -1 | 1) {
    const i = puestos.findIndex(p => igual(p, prog));
    const j = i + paso;
    if (i < 0 || j < 0 || j >= puestos.length) return;
    const next = [...puestos];
    const guarda = next[i]; next[i] = next[j]; next[j] = guarda;
    onChange(next.join(', '));
  }

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false); };
    const cerrar = () => setAbierta(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', conEsc);
    /* Al correr el cuadro de lado o de arriba abajo, la listica quedaría
       despegada de su casilla. Mejor cerrarla. — 02/09/2026 */
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', conEsc);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
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
        ref={boton}
        type="button"
        onClick={() => { if (!abierta) medir(); setAbierta(a => !a); }}
        title="Escoge el programa. El de arriba es el del torneo."
        className="w-full px-1.5 py-[3px] rounded text-center text-white font-semibold text-[12.5px]
          leading-tight transition"
        style={{
          background: abierta ? CAMPO : 'transparent',
          border: `1px solid ${abierta ? VERDE : 'transparent'}`,
        }}>
        {/* SOLO EL DUEÑO (dirección, 02/09/2026). Antes salían los tres
            nombres y no se sabía cuál era el del torneo. Si hay más marcados,
            se dice con un +N chiquito al lado. */}
        {puestos.length ? (
          <>
            {puestos[0]}
            {puestos.length > 1 && (
              <span className="text-white/40 font-black ml-1">+{puestos.length - 1}</span>
            )}
          </>
        ) : <span className="text-white/25">— Escoger —</span>}
      </button>

      {/* MÁS GRANDE (dirección, 02/09/2026): «es complejo ver los programas a
          seleccionar». Cabía justo y con las flechitas quedó apretado. Se
          ensanchó a 320, se le dio aire a cada renglón y la letra creció. */}
      {abierta && donde && (
        <div className="rounded-xl overflow-hidden"
          style={{ position: 'fixed', zIndex: 90, width: 320,
                   top: donde.top, left: donde.left,
                   background: PANEL, border: `1px solid ${BORDE}`,
                   boxShadow: '0 22px 48px rgba(0,0,0,.55)' }}>
          <p className="px-3.5 py-2.5 text-[10.5px] font-black text-white/55 uppercase tracking-widest"
            style={{ borderBottom: `1px solid ${BORDE}` }}>
            El de arriba es el programa del torneo
          </p>
          {lista.map((prog, iLista) => {
            const marcado = puestos.some(p => igual(p, prog));
            const puesto  = puestos.findIndex(p => igual(p, prog));
            const esDuenio = puesto === 0;
            const n = cuantos(prog);
            return (
              <div key={prog}
                className="w-full flex items-center gap-3 px-3.5 py-2.5"
                style={{
                  background: esDuenio ? 'rgba(0,176,80,.13)' : 'transparent',
                  borderTop: iLista && !marcado && puestos.some(p => igual(p, lista[iLista - 1]))
                    ? `1px solid ${BORDE}` : undefined,
                }}>

                {/* LAS FLECHITAS: solo mandan sobre los marcados. Al que no
                    está marcado no hay para dónde moverlo. — 02/09/2026 */}
                <span className="flex flex-col gap-[2px] shrink-0">
                  <button type="button"
                    disabled={!marcado || puesto <= 0}
                    onClick={() => mover(prog, -1)}
                    title="Subirlo en la jerarquía"
                    className="leading-none disabled:opacity-25 hover:brightness-150"
                    style={{ width: 24, height: 16, fontSize: 11, background: CAMPO,
                             border: `1px solid ${BORDE}`, borderRadius: 4, color: '#C6D2DE' }}>▲</button>
                  <button type="button"
                    disabled={!marcado || puesto < 0 || puesto >= puestos.length - 1}
                    onClick={() => mover(prog, 1)}
                    title="Bajarlo en la jerarquía"
                    className="leading-none disabled:opacity-25 hover:brightness-150"
                    style={{ width: 24, height: 16, fontSize: 11, background: CAMPO,
                             border: `1px solid ${BORDE}`, borderRadius: 4, color: '#C6D2DE' }}>▼</button>
                </span>

                <button type="button" onClick={() => marcar(prog)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left hover:brightness-125 transition">
                  <span className="w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center"
                    style={{
                      background: marcado ? VERDE : 'transparent',
                      border: `1px solid ${marcado ? VERDE : BORDE}`,
                    }}>
                    {marcado && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <span className={`text-white text-[13.5px] leading-tight ${marcado ? 'font-black' : 'font-semibold'}`}>
                    {prog}
                    {esDuenio && (
                      <span className="block text-[9px] font-black tracking-widest mt-[1px]"
                        style={{ color: VERDECL }}>EL DEL TORNEO</span>
                    )}
                  </span>
                </button>

                {/* Cuántos deportistas de ese programa juegan este torneo. */}
                {n > 0 && (
                  <span className="shrink-0 text-[12px] font-black tabular-nums px-2 py-0.5 rounded"
                    style={{ color: esDuenio ? '#fff' : '#C6D2DE',
                             background: esDuenio ? VERDE : CAMPO }}>{n}</span>
                )}
              </div>
            );
          })}
          {puestos.length > 0 && (
            <button type="button"
              onClick={() => { onChange(''); setAbierta(false); }}
              style={{ borderTop: `1px solid ${BORDE}` }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-bold text-white/55 hover:text-white transition">
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
  /* FILTRAR POR FORMADOR Y POR TORNEO (dirección, 29/08/2026): el buscador
     libre servía, pero tocaba acordarse de cómo estaba escrito. Con estas dos
     listas se escoge de lo que ya existe en el cuadro. */
  const [filtroFormador, setFiltroFormador] = useState('');
  const [filtroTorneoCuadro, setFiltroTorneoCuadro] = useState('');
  /* Tercer filtro, aparte de los otros dos (dirección, 31/08/2026). */
  const [filtroPrograma, setFiltroPrograma] = useState('');

  /* ── EL FILTRO NO SE PIERDE AL SALIR Y VOLVER ───────────────────────────
     (dirección, 31/08/2026) Se filtra por un programa, se entra con el botón
     CARGAR a ponerle el torneo al equipo, y al devolverse el cuadro salía
     otra vez completo: tocaba armar el mismo filtro cada vez, para cada
     equipo. Ahora se guarda lo que haya puesto —la búsqueda y las tres
     listas— y al volver queda tal cual estaba.

     SE GUARDA EN sessionStorage A PROPÓSITO, no en localStorage: dura
     mientras el navegador esté abierto. Si se cierra y se vuelve otro día,
     el cuadro abre COMPLETO. Así nadie se asusta creyendo que se perdieron
     torneos por un filtro que quedó puesto la semana pasada.

     Y de todas formas, mientras haya filtro puesto esas listas se ven
     AMARILLAS: el aviso ya está a la vista. */
  /* CUIDADO CON ESTE INTERRUPTOR — aquí me equivoqué el 31/08/2026 y el
     filtro se seguía perdiendo. Tiene que ser un ESTADO, no un useRef.

     Con useRef pasaba esto: al abrir la pantalla corrían los dos efectos
     seguidos, uno detrás del otro. El de leer recuperaba "ASOBDIM" y prendía
     el interruptor; pero el de guardar corría de una, en ese mismo instante,
     cuando el filtro todavía estaba VACÍO en la pantalla — y guardaba el
     vacío encima de ASOBDIM. Se borraba solo, medio segundo después de
     haberlo recuperado.

     Siendo un ESTADO, React espera a repintar con las dos cosas listas —el
     filtro ya puesto Y el interruptor prendido— y solo ahí guarda. */
  const [filtrosRecuperados, setFiltrosRecuperados] = useState(false);
  useEffect(() => {
    try {
      const g = JSON.parse(sessionStorage.getItem(LLAVE_FILTROS) || '{}');
      if (typeof g.buscar   === 'string') setBuscar(g.buscar);
      if (typeof g.torneo   === 'string') setFiltroTorneoCuadro(g.torneo);
      if (typeof g.programa === 'string') setFiltroPrograma(g.programa);
      if (typeof g.formador === 'string') setFiltroFormador(g.formador);
    } catch { /* nada guardado, o ilegible: el cuadro abre limpio */ }
    setFiltrosRecuperados(true);
  }, []);
  useEffect(() => {
    /* No guardar antes de haber recuperado, o el primer repintado (todo
       vacío) borraría justo lo que veníamos a rescatar. */
    if (!filtrosRecuperados) return;
    try {
      sessionStorage.setItem(LLAVE_FILTROS, JSON.stringify({
        buscar,
        torneo:   filtroTorneoCuadro,
        programa: filtroPrograma,
        formador: filtroFormador,
      }));
    } catch { /* sin espacio o en modo incógnito: no pasa nada */ }
  }, [filtrosRecuperados, buscar, filtroTorneoCuadro, filtroPrograma, filtroFormador]);

  /* CINTURÓN Y TIRANTES: al volver, el filtro se recupera de una, pero la
     lista de torneos de la base se demora un instante en llegar. En ese
     instante la lista desplegable todavía no tiene la opción "ASOBDIM", y
     una lista sin la opción se ve VACÍA aunque el filtro sí esté puesto.
     Esto la mete de una para que se vea desde el primer momento. */
  function opcionSuelta(valor: string, lista: any[]) {
    if (!valor) return null;
    if (lista.some(t => String(t).toUpperCase() === valor)) return null;
    return <option value={valor} style={{ color: '#111827', backgroundColor: 'white' }}>{valor}</option>;
  }

  /* ── El equipo de cada torneo ───────────────────────────────────────────
     Las fichas se piden UNA vez y por detrás: el cuadro abre de una, y los
     equipos van apareciendo cuando lleguen. Si no llegan, el cuadro sigue
     sirviendo igual que siempre. */
  const [deportistas, setDeportistas] = useState<Deportista[] | null>(null);
  const [fallaDeps, setFallaDeps]     = useState('');
  /** El renglón cuyo equipo se está mirando. */
  const [verEquipo, setVerEquipo]     = useState<{ f: FilaTorneo; n: number } | null>(null);
  /** El deportista que se está sacando ahora, para el reloj de arena. */
  const [sacando, setSacando]         = useState<string>('');

  /* ═══ MARCAR PRIMERO, GUARDAR DESPUÉS ═══════════════════════════════════
     (dirección, 31/08/2026)

     PASÓ DE VERDAD Y COSTÓ CARO: este botón escribía en el momento. Un torneo
     que tenía mal el PROGRAMA hacía que salieran marcados los 15 deportistas
     buenos, y un clic los sacó a todos. Tocó devolverlos desde el respaldo.

     La dirección lo dijo mejor que yo: "por eso es bueno los botones de
     guardar info en todos los módulos". Así que ahora funciona como el resto
     de la plataforma:

       1. Se MARCA a quién sacar. Marcar no escribe nada, es solo una raya.
       2. Se ve la cuenta de cuántos van marcados.
       3. Solo al oprimir GUARDAR se escribe en las fichas, y preguntando.

     Mientras no se oprima GUARDAR, no pasa absolutamente nada. Y si se cierra
     la ventana con marcas sin guardar, se avisa antes de botarlas. */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const marcar = (id: string) => setMarcados(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  /** Cierra la ventana del equipo, avisando si hay marcas sin guardar. */
  function cerrarEquipo() {
    if (marcados.size && !confirm(
      `Hay ${marcados.size} ${marcados.size === 1 ? 'deportista marcado' : 'deportistas marcados'} sin guardar.\n\n` +
      'Si cierras, las marcas se pierden y NO se saca a nadie.\n\n¿Cerrar de todas formas?',
    )) return;
    setMarcados(new Set());
    setVerEquipo(null);
  }

  /* ── SACAR A UN DEPORTISTA DE UN TORNEO ─────────────────────────────────
     (dirección, 31/08/2026)

     OJO CON LO QUE HACE Y LO QUE NO. El número del torneo NO vive en este
     cuadro: vive en la ficha del deportista, en sus casillas de competencia
     (C1 a C4). Entonces esto va a la ficha, busca en cuál de las cuatro está
     ese número, y la deja en blanco. Las otras tres no se tocan.

     NO borra al deportista, NO le quita el proyecto y NO le toca nada más de
     la ficha. Lo único que se va es ese número. Si mañana sí tiene que jugar
     ese torneo, se le vuelve a poner desde Total Afiliados. */
  async function sacarDelTorneo(dep: Deportista, n: number): Promise<boolean> {
    const cols: Record<string, any> = { ...((dep as any)?._columnas ?? {}) };
    let toco = false;

    RX_COMPETENCIAS.forEach((rx, i) => {
      /* La casilla puede estar con su nombre de verdad (C1, TORNEO 1…) */
      const k = Object.keys(cols).find(k => rx.test(k.trim()));
      if (k && parseInt(String(cols[k] ?? '').trim(), 10) === n) { cols[k] = ''; toco = true; }
      /* …o con la llave interna que usa la plataforma. */
      const kv = CLAVES_VIRTUALES[i];
      if (kv in cols && parseInt(String(cols[kv] ?? '').trim(), 10) === n) { cols[kv] = ''; toco = true; }
    });

    if (!toco) return false;
    const ok = await updateColumnasDeportista(String((dep as any).id), cols);
    if (ok) {
      /* Se refresca la lista de esta pantalla para que el contador baje ya. */
      setDeportistas(prev => (prev ?? []).map(d =>
        String((d as any).id) === String((dep as any).id)
          ? ({ ...(d as any), _columnas: cols } as Deportista)
          : d));
    }
    return ok;
  }
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

  /* ── PONER DE PRIMERO EL PROGRAMA DE MÁS DEPORTISTAS ────────────────────
     (dirección, 02/09/2026)

     El orden de la columna PROGRAMA lo pone la dirección con las flechitas, y
     nunca se toca solo: un dato que se reescribe por su cuenta es un dato en
     el que no se puede confiar.

     Pero el cuadro venía de antes, cuando el orden no significaba nada, y hay
     torneos donde el primero NO es el programa de la mayoría —el CONCEJO SUB 11
     dice FORMACIÓN y tiene 18 de PROGRESIÓN y 1 de formación—. Este botón
     acomoda esos de un golpe: mira el conteo de deportistas y sube al que más
     tenga. Muestra primero cuáles va a cambiar y pide confirmación.

     Solo reordena. NO marca ni desmarca ningún programa: los que estaban
     marcados siguen marcados, solo cambian de puesto. */
  const [ordenandoProg, setOrdenandoProg] = useState(false);

  function acomodarProgramas() {
    const pel = (t: any) => String(t ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

    const cambios: { f: FilaTorneo; antes: string; ahora: string; n: number }[] = [];

    filas.forEach((f, i) => {
      const puestos = String(f.programa ?? '').split(',').map(p => p.trim()).filter(Boolean);
      if (puestos.length < 2) return;                 // con uno solo no hay qué ordenar
      const conteo = conteoProgramaPorTorneo.get(i + 1) ?? {};
      /* Se ordena por cuántos deportistas tiene cada uno, de mayor a menor.
         Empatados o sin deportistas: se quedan como estaban. */
      const orden = [...puestos].sort((a, b) => (conteo[pel(b)] ?? 0) - (conteo[pel(a)] ?? 0));
      const ahora = orden.join(', ');
      if (ahora !== puestos.join(', ')) {
        cambios.push({ f, antes: puestos.join(', '), ahora, n: i + 1 });
      }
    });

    if (!cambios.length) {
      window.alert(
        'No hay nada que acomodar.\n\n' +
        'En todos los torneos con varios programas, el que está de primero ya es ' +
        'el que tiene más deportistas.',
      );
      return;
    }

    const TOPE = 20;
    const detalle = cambios.slice(0, TOPE).map(c => {
      const nom = [c.f.torneo, c.f.categoria, c.f.nombre].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
      return `  N° ${c.n}  ${nom}\n        ${c.antes}\n     →  ${c.ahora}`;
    }).join('\n\n');

    if (!window.confirm(
      `SE VA A ACOMODAR EL ORDEN DE ${cambios.length} TORNEO(S)\n\n` +
      'Se sube de primero el programa que tiene más deportistas. No se marca ni ' +
      'se desmarca nada: solo cambia el orden.\n\n' +
      detalle + '\n' +
      (cambios.length > TOPE ? `\n  … y ${cambios.length - TOPE} más\n` : '') +
      '\n¿Acomodar?',
    )) return;

    setOrdenandoProg(true);
    const next = filas.map(f => {
      const c = cambios.find(x => x.f.id === f.id);
      return c ? { ...f, programa: c.ahora } : f;
    });
    setFilas(next);
    programarGuardado(next.filter(f => cambios.some(c => c.f.id === f.id)));
    setOrdenandoProg(false);
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
        /* NACE EN LA FECHA 1A (dirección, 29/08/2026). Quien programa casi
           nunca sabe de una si es la primera, la segunda o la tercera fecha,
           y un renglón sin # FECHA no se puede mandar al pospartido. Se le
           pone 1A a todos y se corrige en Programación cuando se sepa. */
        await agregarPartido({ torneo_num: String(num), fecha: diaPartido, jornada: '1A' });
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
      /* SOLO PROGRAMAS DE VERDAD (dirección, 02/09/2026): antes esta lista
         traía las combinaciones escritas en la columna —"FORMACIÓN, SELECCIÓN,
         DESARROLLO"— como si fueran un programa más. Ahora se ofrecen los seis
         oficiales y nada más; el filtro de abajo sigue mostrando el torneo si
         ese programa está en CUALQUIER puesto de su columna. */
      programa:  [...PROGRAMAS],
      categoria: junta('categoria', CATEGORIAS),
      nombre:    junta('nombre'),
      formador:  junta('formador'),
    };
  }, [filas]);

  /* ── Buscador ─────────────────────────────────────────────────────────── */
  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const igual = (a: any, b: string) => String(limpiar(a) ?? '').toUpperCase() === b;
    return filas
      .map((f, i) => ({ f, n: i + 1 }))
      .filter(({ f }) => !filtroFormador || igual(f.formador, filtroFormador))
      .filter(({ f }) => !filtroTorneoCuadro || igual(f.torneo, filtroTorneoCuadro))
      /* El torneo pasa si ese programa está en cualquiera de sus puestos, no
         solo si es el dueño: filtrando DESARROLLO se quieren ver todos los
         torneos donde juega desarrollo. — 02/09/2026 */
      .filter(({ f }) => !filtroPrograma || String(f.programa ?? '')
        .split(',').some(p => igual(p.trim(), filtroPrograma)))
      .filter(({ f }) => !q ||
        `${f.torneo} ${f.programa} ${f.categoria} ${f.nombre} ${f.formador}`
          .toUpperCase().includes(q));
  }, [filas, buscar, filtroFormador, filtroTorneoCuadro, filtroPrograma]);

  /* ── Se traen las fichas una sola vez, por detrás ───────────────────────
     No se espera a esto para pintar el cuadro: el # de deportistas aparece
     en cada renglón cuando llegue. */
  useEffect(() => {
    if (estado !== 'listo' || deportistas !== null) return;
    let vivo = true;
    getDeportistas()
      .then(ds => { if (vivo) setDeportistas(Array.isArray(ds) ? ds : []); })
      .catch(() => {
        if (!vivo) return;
        setDeportistas([]);
        setFallaDeps('No se pudieron traer las fichas de los deportistas. Vuelve a entrar a la pantalla.');
      });
    return () => { vivo = false; };
  }, [estado, deportistas]);

  /** Número de torneo → los deportistas que lo tienen escrito en su ficha. */
  const equipoPorTorneo = useMemo(() => {
    const m = new Map<number, Deportista[]>();
    (deportistas ?? []).forEach(d => {
      torneosDelDeportista(d).forEach(n => {
        const y = m.get(n);
        if (y) y.push(d); else m.set(n, [d]);
      });
    });
    /* Ordenados por código, igual que en Total Afiliados. */
    m.forEach(lista => lista.sort((a, b) => {
      const ca = parseInt(casillaDe(a, /^c[oó]d/i).replace(/\D/g, ''), 10);
      const cb = parseInt(casillaDe(b, /^c[oó]d/i).replace(/\D/g, ''), 10);
      if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
      return norm((a as any)._nombre).localeCompare(norm((b as any)._nombre), 'es');
    }));
    return m;
  }, [deportistas]);

  /* ── CUÁNTOS DEPORTISTAS DE CADA PROGRAMA JUEGAN CADA TORNEO ─────────────
     (dirección, 02/09/2026)

     Es el dato que dice cuál es DE VERDAD el programa del torneo. Se cuenta
     sobre las fichas: por cada deportista que tiene el torneo escrito en C1..C5,
     se suma uno a su programa.

     NO SE CUENTAN LOS RETIRADOS. Un torneo cuyo equipo se retiró no puede
     seguir contando como si estuviera lleno. "SOLICITA RETIRO" sí cuenta: ese
     caso está en estudio y el niño sigue entrenando —la misma regla de Total
     Afiliados y del pospartido—. */
  const conteoProgramaPorTorneo = useMemo(() => {
    const m = new Map<number, Record<string, number>>();
    (deportistas ?? []).forEach(d => {
      const est = casillaDe(d, /^estado$/i);
      if (est && !/solicit/i.test(est) && /retir/i.test(est)) return;
      const prog = norm(casillaDe(d, /^programa$/i));
      if (!prog) return;
      torneosDelDeportista(d).forEach(n => {
        const y = m.get(n) ?? {};
        y[prog] = (y[prog] ?? 0) + 1;
        m.set(n, y);
      });
    });
    return m;
  }, [deportistas]);

  /**
   * Revisa a un deportista contra el torneo donde está metido y devuelve los
   * avisos, en cristiano. Lista vacía = está donde debe estar.
   */
  function avisosDe(dep: Deportista, f: FilaTorneo): Aviso[] {
    const avisos: Aviso[] = [];

    const est = casillaDe(dep, /^estado$/i);
    /* "SOLICITA RETIRO" NO es estar retirado: está en estudio y sigue
       entrenando. Es la misma regla de Total Afiliados y del pospartido. */
    if (est && !/solicit/i.test(est) && /retir|pausa|inactiv/i.test(est)) {
      avisos.push({ texto: norm(est) || 'RETIRADO', grave: true });
    }

    const progDep = norm(casillaDe(dep, /^programa$/i));
    const progTor = norm(f.programa);
    if (progDep && progTor && !progDep.includes(progTor) && !progTor.includes(progDep)) {
      avisos.push({ texto: `ES DE ${progDep}`, grave: true });
    }

    /* ── LA CATEGORÍA: NO TODO DESCUADRE ES UN PROBLEMA ──────────────────
       (dirección, 31/08/2026)

       En fútbol subir a un niño de categoría es normal y hasta bueno: un
       SUB 8 jugando el SUB 9 es un premio, no un error. Lo que NO puede pasar
       es lo contrario: un SUB 11 metido en un torneo SUB 9 está sobre-edad, y
       eso puede costar el partido o el torneo.

       Por eso no se pintan igual:
         · MAYOR que la categoría → rojo, cuenta como problema. Es lo grave.
         · menor que la categoría → gris, solo informativo. Está subiendo.

       La comparación es por el NÚMERO del SUB, no por el texto, para que
       "SUB 1" no se confunda con "SUB 10". */
    const subDep = subDe(casillaDe(dep, /^categor/i)) || subDe(casillaDe(dep, /^proy/i));
    const subTor = subDe(f.categoria);
    if (subDep && subTor && subDep !== subTor) {
      const mayor = parseInt(subDep, 10) > parseInt(subTor, 10);
      avisos.push({
        texto: mayor ? `SOBRE-EDAD · SUB ${subDep}` : `sube de SUB ${subDep}`,
        grave: mayor,
      });
    }

    return avisos;
  }

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

      {/* PANTALLA ANCHA (dirección, 02/09/2026): las once columnas suman más
          de 1.400, y con el tope viejo de 1.250 tocaba correr el cuadro de
          lado para ver el final. En un monitor grande ahora cabe todo. */}
      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1560 }}>

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
            <div className="rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 mb-3"
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
              <select
                value={filtroTorneoCuadro}
                onChange={e => setFiltroTorneoCuadro(e.target.value)}
                title="Ver solo un torneo"
                style={{
                  height: 36,
                  background: filtroTorneoCuadro ? AMBAR : CAMPO,
                  border: `1px solid ${filtroTorneoCuadro ? AMBAR : BORDE}`,
                }}
                className="shrink-0 rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS TORNEOS</option>
                {opcionSuelta(filtroTorneoCuadro, sugerencias.torneo)}
                {sugerencias.torneo.map(t => (
                  <option key={t} value={String(t).toUpperCase()} style={{ color: '#111827', backgroundColor: 'white' }}>
                    {String(t).toUpperCase()}
                  </option>
                ))}
              </select>

              {/* PROGRAMA — el tercer filtro, en su propio botón
                  (dirección, 31/08/2026). Se prende en ámbar como los otros. */}
              <select
                value={filtroPrograma}
                onChange={e => setFiltroPrograma(e.target.value)}
                title="Ver solo los equipos de un programa"
                style={{
                  height: 36,
                  background: filtroPrograma ? AMBAR : CAMPO,
                  border: `1px solid ${filtroPrograma ? AMBAR : BORDE}`,
                }}
                className="shrink-0 rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS PROGRAMAS</option>
                {opcionSuelta(filtroPrograma, sugerencias.programa)}
                {sugerencias.programa.map(t => (
                  <option key={t} value={String(t).toUpperCase()} style={{ color: '#111827', backgroundColor: 'white' }}>
                    {String(t).toUpperCase()}
                  </option>
                ))}
              </select>

              <select
                value={filtroFormador}
                onChange={e => setFiltroFormador(e.target.value)}
                title="Ver solo los equipos de un formador"
                style={{
                  height: 36,
                  background: filtroFormador ? AMBAR : CAMPO,
                  border: `1px solid ${filtroFormador ? AMBAR : BORDE}`,
                }}
                className="shrink-0 rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS FORMADORES</option>
                {opcionSuelta(filtroFormador, sugerencias.formador)}
                {sugerencias.formador.map(t => (
                  <option key={t} value={String(t).toUpperCase()} style={{ color: '#111827', backgroundColor: 'white' }}>
                    {String(t).toUpperCase()}
                  </option>
                ))}
              </select>

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

              {/* ACOMODAR EL ORDEN DE LOS PROGRAMAS (dirección, 02/09/2026).
                  Sube de primero el programa con más deportistas en los torneos
                  que traen varios. Se corre una vez y ya. */}
              {!soloLectura && (
                <button
                  onClick={acomodarProgramas}
                  disabled={ordenandoProg || !deportistas}
                  title={deportistas
                    ? 'Sube de primero el programa que tiene más deportistas, en los torneos con varios programas'
                    : 'Espere a que carguen las fichas de los deportistas'}
                  className="ml-auto rounded-lg px-2.5 text-[11px] font-black disabled:opacity-45"
                  style={{ height: 34, background: 'transparent', color: '#5BE39B',
                           border: `1px solid ${VERDE}` }}>
                  ⇅ ACOMODAR PROGRAMAS
                </button>
              )}

              <button
                onClick={() => router.push('/programacion')}
                className={`${soloLectura ? 'ml-auto ' : ''}rounded-lg px-2.5 text-white/70 text-[11px] font-black`}
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
                style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 1460 }}>
                <thead>
                  <tr>
                    {[
                      /* CARGAR TORNEO: se va derecho a la matriz del pospartido
                         de ESTE renglón, sin tener que escribir el número allá.
                         (dirección, 31/08/2026) */
                      { h: 'CARGAR TORNEO', w: 92 },
                      /* El chulo de siempre. Ahora sí lleva título, porque nadie
                         adivinaba para qué era. (dirección, 31/08/2026) */
                      { h: 'CARGAR PROG', w: 78 },
                      { h: '# TOR', w: 62 },
                      { h: 'TORNEO', w: 200 },
                      /* PROGRAMA, ANCHA DE VERDAD (dirección, 02/09/2026).
                         Con 175 los programas se partían en dos renglones y el
                         cuadro quedaba desparejo. Un torneo puede llevar los
                         tres —"FORMACIÓN, PROGRESIÓN, SELECCIÓN"— y eso son
                         treinta y dos letras: con 300 caben en una sola línea. */
                      { h: 'PROGRAMA', w: 300 },
                      { h: 'CATEGORÍA', w: 110 },
                      { h: 'NOMBRE', w: 150 },
                      { h: 'FORMADOR', w: 165 },
                      { h: 'VALOR DEL TORNEO', w: 140 },
                      { h: 'EQUIPO', w: 104 },
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
                      {/* ── CARGAR TORNEO ──────────────────────────────────
                          (dirección, 31/08/2026) Lleva de una a la MATRIZ del
                          pospartido de ESTE torneo — la lista con la columna
                          CARGAR TORNEO y los estados PAGÓ · NO PAGA. Antes
                          tocaba irse a Post Partido y escribir el número a
                          mano; el número ya lo sabemos, es el de este renglón. */}
                      <td className="px-1 py-[5px] text-center"
                        style={{ borderRight: BLANCO, borderBottom: BLANCO, background: CAMPO }}>
                        <button
                          onClick={() => router.push(`/postpartido?matriz=${n}`)}
                          title={`Cargarle el torneo ${n} a los deportistas — abre la matriz del pospartido`}
                          className="rounded-lg px-2 mx-auto flex items-center gap-1.5 transition hover:brightness-125"
                          style={{ height: 28, background: PANEL, border: `1px solid ${VERDE}` }}>
                          <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: VERDE }} />
                          <span className="text-[10px] font-black text-white whitespace-nowrap">CARGAR</span>
                        </button>
                      </td>
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
                          conteos={conteoProgramaPorTorneo.get(n)}
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
                      {/* ── VER EQUIPO ────────────────────────────────────
                          Cuántos deportistas tienen escrito ESTE número de
                          torneo en su ficha, y cuántos de esos traen algún
                          aviso. En cero se pinta ámbar: un torneo sin nadie
                          cargado casi siempre es un error. */}
                      <td className="px-1 py-[5px] text-center"
                        style={{ borderRight: BLANCO, borderBottom: BLANCO, background: CAMPO }}>
                        {(() => {
                          if (deportistas === null) {
                            return <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" style={{ color: GRIS }} />;
                          }
                          const equipo = equipoPorTorneo.get(n) ?? [];
                          /* En rojo solo va lo GRAVE. Un niño que sube de
                             categoría no es un error y no debe asustar. */
                          const conAviso = equipo
                            .filter(d => avisosDe(d, f).some(a => a.grave)).length;
                          const vacio = equipo.length === 0;
                          return (
                            <button
                              onClick={() => { setMarcados(new Set()); setVerEquipo({ f, n }); }}
                              title={vacio
                                ? 'Este torneo no tiene ningún deportista cargado'
                                : `Ver los ${equipo.length} deportistas de este torneo`}
                              className="rounded-lg px-2 mx-auto flex items-center gap-1.5 transition hover:brightness-125"
                              style={{
                                height: 28,
                                background: PANEL,
                                border: `1px solid ${vacio ? AMBAR : conAviso ? ROJO : BORDE}`,
                              }}>
                              <Users className="w-3.5 h-3.5" style={{ color: vacio ? AMBAR : '#fff' }} />
                              <span className="text-[11.5px] font-black" style={{ color: vacio ? AMBAR : '#fff' }}>
                                {equipo.length}
                              </span>
                              {conAviso > 0 && (
                                <span className="text-[10px] font-black rounded px-1"
                                  style={{ background: ROJO, color: '#fff' }}>
                                  {conAviso}
                                </span>
                              )}
                            </button>
                          );
                        })()}
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
                      <td colSpan={11} className="py-10 text-center text-white/45 text-[13px] font-semibold"
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

        {/* ══ LA VENTANA DEL EQUIPO ══════════════════════════════════════════
            Los deportistas que tienen ESE número de torneo escrito en su
            ficha. Arriba se avisa cuántos salieron con algo raro, y esos
            quedan de primeros para no tener que buscarlos. — 31/08/2026 */}
        {verEquipo && (() => {
          const { f, n } = verEquipo;
          const equipo = equipoPorTorneo.get(n) ?? [];
          const conAvisos = equipo
            .map(d => ({ d, avisos: avisosDe(d, f) }))
            .map(x => ({ ...x, graves: x.avisos.filter(a => a.grave).length }))
            .sort((a, b) => b.graves - a.graves || b.avisos.length - a.avisos.length);
          const cuantosMal = conAvisos.filter(x => x.graves > 0).length;
          const nombreTorneo = [f.torneo, f.programa, f.categoria, f.nombre]
            .map(limpiar).filter(Boolean).join(' · ');

          /* ── CUANDO FALLAN TODOS, EL ERROR NO ES DE LOS NIÑOS ─────────────
             (dirección, 31/08/2026)

             Si de 15 deportistas los 15 salen marcados, lo más probable NO es
             que los 15 estén mal cargados: es que el RENGLÓN DEL TORNEO tiene
             mal el programa o la categoría, y entonces todo el equipo se ve
             mal contra un patrón equivocado.

             Esto importa de verdad, porque el botón de sacarlos a todos está
             ahí al lado: sin este aviso, un renglón mal escrito podía costar
             el equipo completo. Con tres o más ya se avisa. */
          const todosMal = equipo.length >= 3 && cuantosMal === equipo.length;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,.65)' }}
              onClick={cerrarEquipo}>
              <div className="rounded-2xl w-full max-w-2xl flex flex-col"
                style={{ background: PANEL, border: `1px solid ${BORDE}`, maxHeight: '86vh' }}
                onClick={e => e.stopPropagation()}>

                {/* Encabezado */}
                <div className="px-5 py-4 flex items-start gap-3 shrink-0"
                  style={{ background: `linear-gradient(to right, ${LIENZO}, #0EA142)`, borderRadius: '15px 15px 0 0' }}>
                  <Users className="w-5 h-5 text-white shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-black text-[15px] leading-tight">
                      TORNEO {n} · {equipo.length} {equipo.length === 1 ? 'DEPORTISTA' : 'DEPORTISTAS'}
                    </h3>
                    <p className="text-white/75 text-[12px] font-semibold mt-1 leading-snug">{nombreTorneo || '—'}</p>
                  </div>
                  <button onClick={cerrarEquipo} className="shrink-0 text-white/70 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* El resumen: lo primero que se quiere saber */}
                <div className="px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDE}` }}>
                  {equipo.length === 0 ? (
                    <p className="text-[12.5px] font-bold leading-relaxed" style={{ color: AMBAR }}>
                      Ningún deportista tiene el número {n} en su ficha. O el torneo todavía no se ha
                      cargado, o se cargó con otro número.
                    </p>
                  ) : cuantosMal === 0 ? (
                    <p className="text-[12.5px] font-bold" style={{ color: '#5BE39B' }}>
                      ✓ Los {equipo.length} están donde deben estar.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      {todosMal ? (
                        <p className="text-[12.5px] font-bold leading-relaxed flex-1 min-w-[240px]"
                           style={{ color: AMBAR }}>
                          ⚠ Están marcados <b>LOS {equipo.length}</b>. Cuando fallan todos, casi siempre el
                          error no está en los deportistas sino en <b>este renglón del torneo</b>: revisa que
                          el PROGRAMA diga <b>{limpiar(f.programa) || '(vacío)'}</b> y la CATEGORÍA{' '}
                          <b>{limpiar(f.categoria) || '(vacío)'}</b>. Si el renglón está mal, corrígelo
                          primero — no los saques.
                        </p>
                      ) : (
                        <p className="text-[12.5px] font-bold leading-relaxed flex-1 min-w-[240px]" style={{ color: ROJO }}>
                          ⚠ {cuantosMal} {cuantosMal === 1 ? 'deportista no cuadra' : 'deportistas no cuadran'} con
                          este torneo. Van de primeros, marcados en rojo.
                        </p>
                      )}
                      {/* MARCAR LOS QUE NO CUADRAN. Solo pone la raya: no escribe
                          nada. Lo que escribe es el GUARDAR de abajo. */}
                      {!soloLectura && (
                        <button
                          onClick={() => {
                            const ids = conAvisos.filter(x => x.graves > 0).map(x => String((x.d as any).id));
                            const todosYa = ids.every(i => marcados.has(i));
                            setMarcados(todosYa ? new Set() : new Set(ids));
                          }}
                          className="shrink-0 rounded-lg px-3 h-9 flex items-center gap-2
                            text-white text-[11px] font-black transition hover:brightness-110"
                          style={{ background: '#20293a', border: `1px solid ${ROJO}`, color: '#F08A87' }}>
                          {conAvisos.filter(x => x.graves > 0).every(x => marcados.has(String((x.d as any).id)))
                            ? 'QUITAR LAS MARCAS'
                            : `MARCAR LOS ${cuantosMal}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* La lista */}
                <div className="overflow-y-auto px-4 py-3" style={{ background: LIENZO }}>
                  {conAvisos.map(({ d, avisos }, i) => {
                    const mal = avisos.some(a => a.grave);
                    const estaMarcado = marcados.has(String((d as any).id));
                    return (
                      <div key={(d as any).id ?? i}
                        className="rounded-xl px-3 py-2.5 mb-2 flex items-center gap-3 transition"
                        style={{
                          background: estaMarcado ? 'rgba(192,80,77,.16)' : PANEL,
                          border: `1px solid ${estaMarcado ? ROJO : mal ? ROJO : BORDE}`,
                          opacity: estaMarcado ? .75 : 1,
                        }}>
                        <span className="rounded-md px-2 py-0.5 text-white font-black text-[11px] shrink-0"
                          style={{ background: mal ? ROJO : VERDE }}>
                          {limpiar(casillaDe(d, /^c[oó]d/i)) || '—'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black text-[12.5px] leading-tight truncate">
                            {limpiar((d as any)._nombre) || '—'}
                          </p>
                          <p className="text-white/50 text-[11px] font-semibold mt-0.5 truncate">
                            {[casillaDe(d, /^programa$/i), casillaDe(d, /^categor/i) || casillaDe(d, /^proy/i)]
                              .map(limpiar).filter(Boolean).join(' · ') || 'sin programa ni categoría en la ficha'}
                          </p>
                        </div>
                        {avisos.length > 0 && (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {avisos.map(a => (
                              <span key={a.texto}
                                className="rounded px-1.5 py-0.5 text-[9.5px] font-black whitespace-nowrap"
                                style={a.grave
                                  ? { background: 'rgba(192,80,77,.22)', color: '#F08A87', border: `1px solid ${ROJO}` }
                                  : { background: 'rgba(255,255,255,.07)', color: GRIS, border: `1px solid ${BORDE}` }}>
                                {a.texto}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* LA MARCA DE ESTE RENGLÓN. Marcar no escribe: solo lo
                            apunta para el GUARDAR de abajo. — 31/08/2026 */}
                        {mal && !soloLectura && (
                          <button
                            onClick={() => marcar(String((d as any).id))}
                            title={estaMarcado ? 'Quitar la marca' : 'Marcar para sacarlo de este torneo'}
                            className="shrink-0 rounded-lg px-2.5 h-8 flex items-center gap-1.5
                              text-[10.5px] font-black transition hover:brightness-125"
                            style={estaMarcado
                              ? { background: ROJO, border: `1px solid ${ROJO}`, color: '#fff' }
                              : { background: '#20293a', border: `1px solid ${BORDE}`, color: GRIS }}>
                            {estaMarcado ? <><Check className="w-3.5 h-3.5" /> MARCADO</> : 'MARCAR'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── EL PIE: AQUÍ SE GUARDA, Y SOLO AQUÍ ────────────────────
                    Mientras esta barra no se oprima, no se ha escrito nada.
                    — dirección, 31/08/2026 */}
                <div className="px-5 py-3 shrink-0"
                     style={{ borderTop: `1px solid ${BORDE}`, borderRadius: '0 0 15px 15px' }}>
                  {marcados.size > 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-white font-black text-[13px]">
                          {marcados.size} {marcados.size === 1 ? 'marcado' : 'marcados'} para sacar del torneo {n}
                        </p>
                        <p className="text-white/45 text-[11px] font-semibold mt-0.5">
                          Todavía no se ha guardado nada. Puedes seguir marcando o quitar marcas.
                        </p>
                      </div>
                      <button
                        onClick={() => setMarcados(new Set())}
                        disabled={sacando !== ''}
                        className="shrink-0 rounded-lg px-3 h-10 text-white/70 text-[11px] font-black
                          transition hover:brightness-125 disabled:opacity-50"
                        style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                        QUITAR LAS MARCAS
                      </button>
                      <button
                        onClick={async () => {
                          const malos = conAvisos.map(x => x.d)
                            .filter(d => marcados.has(String((d as any).id)));
                          if (!malos.length) return;
                          const nombres = malos.slice(0, 12)
                            .map(d => `   ·  ${(limpiar((d as any)._nombre) || '—').toUpperCase()}`).join('\n');
                          if (todosMal && !confirm(
                            `OJO: est\u00e1n marcados LOS ${equipo.length}, o sea el equipo COMPLETO.\n\n` +
                            'Cuando fallan todos, lo normal es que el error est\u00e9 en el rengl\u00f3n del ' +
                            'torneo —el PROGRAMA o la CATEGOR\u00cdA mal escritos— y no en los deportistas.\n\n' +
                            'Si los sacas a todos, el torneo queda sin nadie.\n\n' +
                            '¿De verdad quieres seguir?',
                          )) return;
                          if (!confirm(
                            `¿Sacar del torneo ${n} a ${malos.length} ${malos.length === 1 ? 'deportista' : 'deportistas'}?\n\n` +
                            `${nombreTorneo}\n\n${nombres}` +
                            (malos.length > 12 ? `\n   …y ${malos.length - 12} más` : '') +
                            '\n\nA cada uno se le quita ÚNICAMENTE el número de este torneo de su ficha.\n' +
                            'No se borra ning\u00fan deportista ni se le toca nada m\u00e1s.',
                          )) return;
                          setSacando('TODOS');
                          for (const d of malos) await sacarDelTorneo(d, n);
                          setSacando('');
                          setMarcados(new Set());
                        }}
                        disabled={sacando !== ''}
                        className="shrink-0 rounded-lg px-4 h-10 flex items-center gap-2
                          text-white text-[12px] font-black transition hover:brightness-110 disabled:opacity-50"
                        style={{ background: ROJO }}>
                        {sacando === 'TODOS'
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> GUARDANDO…</>
                          : <><Save className="w-4 h-4" /> GUARDAR — SACAR {marcados.size}</>}
                      </button>
                    </div>
                  ) : (
                    <p className="text-white/45 text-[11px] font-semibold leading-relaxed">
                      Esto sale de las fichas: cada deportista lleva el número del torneo en sus casillas de
                      competencia. <b className="text-white/70">Marcar no borra nada</b> — solo al oprimir
                      GUARDAR se toca la ficha.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {!!fallaDeps && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-xl px-4 py-2.5 flex items-center gap-2"
            style={{ background: PANEL, border: `1px solid ${AMBAR}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: AMBAR }} />
            <span className="text-white text-[12px] font-semibold">{fallaDeps}</span>
            <button onClick={() => setFallaDeps('')} className="shrink-0 text-white/50 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
