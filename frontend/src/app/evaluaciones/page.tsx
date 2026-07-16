'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Save, RefreshCw, Camera, CheckCircle, History } from 'lucide-react';
import { getDeportistas, getEvaluaciones, saveEvaluacion } from '@/lib/db';
import type { Deportista, Evaluacion } from '@/lib/db';

const NIVELES = ['', 'Nivel 1 (Iniciación)', 'Nivel 2 (En Desarrollo)', 'Nivel 3 (Competente)', 'Nivel 4 (Avanzado)', 'Nivel 5 (Dominante)'];

const DESC_FUERZA: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Presenta dificultades para mantener el equilibrio en contactos físicos. Su potencia de golpeo es limitada y suele perder la posición fácilmente en los duelos 1vs1.',
  'Nivel 2 (En Desarrollo)':'Muestra intención de utilizar su cuerpo para proteger el balón, pero carece de la estabilidad necesaria para sostener la carga del rival de forma efectiva.',
  'Nivel 3 (Competente)':   'Utiliza su fuerza de manera adecuada para disputar balones. Posee una potencia de remate y salto acorde a su edad, logrando ganar duelos físicos de intensidad media.',
  'Nivel 4 (Avanzado)':     'Domina el uso del cuerpo (brazos y tronco) para blindar el balón. Su potencia explosiva le permite ganar la mayoría de los duelos y realizar cambios de dirección firmes.',
  'Nivel 5 (Dominante)':    'Posee una fuerza explosiva superior. Es determinante en el choque, difícil de desequilibrar y sus remates o despejes tienen una potencia que marca diferencia en el partido.',
};
const DESC_PROTECCION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Pierde el balón fácilmente ante el contacto físico; no usa su cuerpo como barrera.',
  'Nivel 2 (En Desarrollo)':'Intenta interponer el cuerpo, pero pierde el equilibrio ante cargas del rival.',
  'Nivel 3 (Competente)':   'Utiliza los brazos y la cadera para mantener la posesión mientras busca una descarga.',
  'Nivel 4 (Avanzado)':     'Domina el uso del cuerpo para esconder el balón y girar sobre la presión del oponente.',
  'Nivel 5 (Dominante)':    'Protege el balón con éxito ante múltiples rivales, provocando faltas o manteniendo la posesión bajo estrés máximo.',
};
const DESC_REMATE: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Contacto impreciso con el balón; le cuesta dar dirección o potencia. Generalmente golpea con la punta o sin coordinar la carrera.',
  'Nivel 2 (En Desarrollo)':'Logra impactar con el empeine o borde interno, pero el tiro suele ir al centro o fuera. Necesita mucho tiempo y espacio para preparar el cuerpo.',
  'Nivel 3 (Competente)':   'Capaz de dirigir el remate hacia los costados en situaciones de poca presión. Empieza a diferenciar superficies de contacto según la distancia.',
  'Nivel 4 (Avanzado)':     'Ejecuta con potencia y colocación incluso en carrera. Ajusta el cuerpo rápidamente para rematar balones que vienen de diferentes ángulos.',
  'Nivel 5 (Dominante)':    'Define con ambas piernas y bajo máxima presión defensiva. Domina el remate de primera intención y utiliza recursos variados (volea, cabeza, colocación sutil).',
};
const DESC_CONTROL_ORIENTADO: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'El balón se le escapa tras el primer toque; necesita varios contactos para dominarlo.',
  'Nivel 2 (En Desarrollo)':'Detiene el balón, pero queda estático. Requiere un segundo toque para empezar a moverse.',
  'Nivel 3 (Competente)':   'Controla el balón hacia una zona libre de presión en situaciones de baja intensidad.',
  'Nivel 4 (Avanzado)':     'El primer toque ya es una ventaja: prepara el balón para el siguiente pase o tiro de inmediato.',
  'Nivel 5 (Dominante)':    'Domina el control con cualquier superficie (pecho, muslo, cabeza) y elimina rivales con el primer toque.',
};
const DESC_CONDUCCION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Mantiene la vista fija en el balón; pierde el control al aumentar la velocidad.',
  'Nivel 2 (En Desarrollo)':'Conduce con el interior/exterior pero con trayectorias rígidas.',
  'Nivel 3 (Competente)':   'Conduce con la cabeza levantada; realiza cambios de dirección básicos.',
  'Nivel 4 (Avanzado)':     'Domina el cambio de ritmo y fintas para superar rivales en el 1vs1.',
  'Nivel 5 (Dominante)':    'Control total del espacio y el balón; utiliza ambos perfiles para desequilibrar.',
};
const DESC_CONTROL_PASE: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Dificultad para amortiguar el balón; pases con poca dirección.',
  'Nivel 2 (En Desarrollo)':'Controla con varios toques; empieza a orientar el pase hacia un compañero.',
  'Nivel 3 (Competente)':   'Control efectivo en estático; pases precisos a corta y media distancia.',
  'Nivel 4 (Avanzado)':     'Control orientado (primer toque) para ganar ventaja; pases con intención táctica.',
  'Nivel 5 (Dominante)':    'Ejecución perfecta bajo presión y a máxima velocidad; precisión en pases largos.',
};
const DESC_RESISTENCIA: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Muestra signos de fatiga prematura. Su participación en el juego disminuye drásticamente después de los primeros minutos de intensidad.',
  'Nivel 2 (En Desarrollo)':'Completa los partidos, pero con una intensidad intermitente. Requiere periodos largos de recuperación tras realizar esfuerzos máximos (sprints).',
  'Nivel 3 (Competente)':   'Mantiene un ritmo de juego estable durante la mayor parte del encuentro. Logra recuperarse adecuadamente entre esfuerzos y mantiene la forma técnica a pesar del cansancio.',
  'Nivel 4 (Avanzado)':     'Posee una gran capacidad de trabajo ("box to box"). Realiza múltiples esfuerzos de alta intensidad sin que su rendimiento decaiga, manteniendo la lucidez hasta el final.',
  'Nivel 5 (Dominante)':    'Nivel de condición física sobresaliente. Es capaz de sostener un ritmo alto de presión y despliegue durante todo el partido, recuperándose casi de inmediato tras esfuerzos explosivos.',
};
const DESC_VELOCIDAD: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Su respuesta ante los estímulos del juego (balón o rival) es lenta. Le cuesta arrancar con rapidez y suele llegar tarde a las jugadas divididas.',
  'Nivel 2 (En Desarrollo)':'Muestra buena velocidad en línea recta, pero le toma tiempo reaccionar cuando el balón cambia de dirección o hay una transición rápida.',
  'Nivel 3 (Competente)':   'Reacciona de forma oportuna a las acciones de juego. Es capaz de realizar sprints efectivos y mantiene una velocidad de desplazamiento adecuada para su posición.',
  'Nivel 4 (Avanzado)':     'Posee un "arranque" potente. Su velocidad de reacción le permite anticiparse a los rivales con frecuencia y destaca por su rapidez en distancias cortas y largas.',
  'Nivel 5 (Dominante)':    'Es un jugador veloz tanto física como mentalmente. Su capacidad de aceleración y desaceleración es élite, permitiéndole desbordar o recuperar posiciones de forma excepcional.',
};
const DESC_UBICACION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Tiende a seguir el balón sin mantener una posición (efecto "enjambre").',
  'Nivel 2 (En Desarrollo)':'Reconoce su posición general (defensa/ataque) pero se desorienta fácil.',
  'Nivel 3 (Competente)':   'Mantiene su zona de juego y entiende cuándo subir o bajar.',
  'Nivel 4 (Avanzado)':     'Lee el juego; ocupa espacios libres para ofrecerse como opción de pase.',
  'Nivel 5 (Dominante)':    'Dicta el ritmo del juego; corrige la posición de sus compañeros y anticipa jugadas.',
};
const DESC_VELOCIDAD_PROC: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Se queda congelado con el balón; decide después de que la jugada ya pasó.',
  'Nivel 2 (En Desarrollo)':'Elige la opción correcta pero tarda demasiado en ejecutarla, permitiendo la reacción rival.',
  'Nivel 3 (Competente)':   'Identifica la mejor opción (pasar o conducir) en situaciones estándar de juego.',
  'Nivel 4 (Avanzado)':     'Decide y ejecuta de forma fluida; siempre tiene un "Plan B" si la jugada se cierra.',
  'Nivel 5 (Dominante)':    'Juega a "uno o dos toques"; su mente va más rápido que el balón. Anticipa el error del rival.',
};
const DESC_SUPERIORIDAD: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'No identifica ventajas numéricas; intenta la acción individual aunque tenga un compañero solo.',
  'Nivel 2 (En Desarrollo)':'Reconoce la ventaja pero elige mal el momento del pase o la conducción.',
  'Nivel 3 (Competente)':   'Aprovecha las situaciones de superioridad para fijar a un defensa y descargar en el compañero libre.',
  'Nivel 4 (Avanzado)':     'Atrae marcas de forma intencional para generar espacios en otras zonas del campo.',
  'Nivel 5 (Dominante)':    'Ejecuta con perfección táctica los doblajes y triangulaciones para romper líneas defensivas.',
};
const DESC_BASCULACION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Desconoce el movimiento del bloque; se queda solo en su zona sin ayudar al compañero.',
  'Nivel 2 (En Desarrollo)':'Sigue el balón lateralmente pero deja huecos peligrosos a su espalda o en el centro.',
  'Nivel 3 (Competente)':   'Acompaña el movimiento del equipo hacia el lado del balón; ofrece apoyo al compañero superado.',
  'Nivel 4 (Avanzado)':     'Domina las permutas (cambio de marca) y el escalonamiento defensivo para evitar pases filtrados.',
  'Nivel 5 (Dominante)':    'Lee el peligro antes de que surja; dirige el bloque defensivo y corrige desajustes de otros compañeros.',
};
const DESC_TRANSICION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Se queda parado tras perder el balón o tras un tiro a gol; tarda en reaccionar.',
  'Nivel 2 (En Desarrollo)':'Reacciona al cambio de posesión pero con trote lento; no identifica su nueva tarea de inmediato.',
  'Nivel 3 (Competente)':   'Cambia el chip rápido; si pierde el balón intenta recuperarlo o regresa a su zona defensiva.',
  'Nivel 4 (Avanzado)':     'Identifica el momento de presión tras pérdida o repliegue organizado según la instrucción.',
  'Nivel 5 (Dominante)':    'Velocidad mental de élite; anticipa la transición antes de que ocurra y organiza el balance del equipo.',
};
const DESC_AMPLITUD: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Se mantiene estático; no comprende que puede alejarse del balón para crear espacio.',
  'Nivel 2 (En Desarrollo)':'Entiende que debe ocupar bandas, pero tiende a cerrarse cuando el juego se complica.',
  'Nivel 3 (Competente)':   'Se posiciona correctamente en ataque para "estirar" la defensa rival y ofrecer líneas de pase.',
  'Nivel 4 (Avanzado)':     'Sincroniza sus movimientos con los compañeros; sabe cuándo picar al vacío o cuándo dar apoyo.',
  'Nivel 5 (Dominante)':    'Domina los conceptos de tercer hombre y desmarques de ruptura; manipula la estructura rival con su posición.',
};
const DESC_LECTURA_ALTURAS: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Corre siempre hacia el balón (atracción magnética); se amontona con sus compañeros.',
  'Nivel 2 (En Desarrollo)':'Identifica cuándo está solo, pero le cuesta ver dónde están los espacios libres para atacar.',
  'Nivel 3 (Competente)':   'Sabe cuándo dar amplitud (ir a la banda) o profundidad (picar al espacio) según la jugada.',
  'Nivel 4 (Avanzado)':     'Reconoce los momentos para acelerar el juego o pausarlo para reorganizar al equipo.',
  'Nivel 5 (Dominante)':    'Maestro de la "pausa"; atrae rivales para liberar compañeros y detecta debilidades en el sistema rival.',
};
const POSICIONES = ['', 'PORTERO', 'CENTRAL', 'LATERAL DERECHO', 'LATERAL IZQUIERDO', 'EXTREMO DERECHO', 'EXTREMO IZQUIERDO', 'VOLANTE', 'MEDIOCAMPISTA', 'DELANTERO CENTRO'];
const PERFILES = ['', 'DERECHO', 'IZQUIERDO', 'AMBIDIESTRO'];

const C = {
  negro: '#1a1a1a', verde: '#1a6b2e', naranja: '#e85d04',
  verdeClaro: '#2d8a48', grisClaro: '#f0f0f0',
};

type Valoracion = {
  fecha: string; codigo: string; nombre: string; fechaNac: string;
  programa: string; proyecto: string; perfil: string; posicion: string;
  foto: string;
  numeroInforme: string;
  fuerzaNivel: string; fuerzaDesc: string;
  velocidadNivel: string; velocidadDesc: string;
  resistenciaNivel: string; resistenciaDesc: string;
  controlNivel: string; controlDesc: string;
  conductaNivel: string; conductaDesc: string;
  paseNivel: string; paseDesc: string;
  remataNivel: string; remataDesc: string;
  proteccionNivel: string; proteccionDesc: string;
  posicionNivel: string; posicionDesc: string;
  visionNivel: string; visionDesc: string;
  defensaNivel: string; defensaDesc: string;
  amplitudNivel: string; amplitudDesc: string;
  transicionNivel: string; transicionDesc: string;
  superioridadNivel: string; superioridadDesc: string;
  basculacionNivel: string; basculacionDesc: string;
  actitudNivel: string; actitudDesc: string;
  disciplinaNivel: string; disciplinaDesc: string;
  trabajoNivel: string; trabajoDesc: string;
  observaciones: string;
};

const INICIAL: Valoracion = {
  fecha: new Date().toLocaleDateString('es-CO'), codigo: '', nombre: '', fechaNac: '',
  programa: '', proyecto: '', perfil: '', posicion: '', foto: '', numeroInforme: '',
  fuerzaNivel: '', fuerzaDesc: '', velocidadNivel: '', velocidadDesc: '',
  resistenciaNivel: '', resistenciaDesc: '', controlNivel: '', controlDesc: '',
  conductaNivel: '', conductaDesc: '', paseNivel: '', paseDesc: '',
  remataNivel: '', remataDesc: '', proteccionNivel: '', proteccionDesc: '',
  posicionNivel: '', posicionDesc: '',
  visionNivel: '', visionDesc: '', defensaNivel: '', defensaDesc: '',
  amplitudNivel: '', amplitudDesc: '',
  transicionNivel: '', transicionDesc: '',
  superioridadNivel: '', superioridadDesc: '',
  basculacionNivel: '', basculacionDesc: '',
  actitudNivel: '', actitudDesc: '', disciplinaNivel: '', disciplinaDesc: '',
  trabajoNivel: '', trabajoDesc: '', observaciones: '',
};

/* ── Bloque de aspecto: definido FUERA del componente principal ── */
interface BloqueProps {
  titulo: string; subtitulo: string;
  nivel: string; onNivel: (v: string) => void;
  desc: string; onDesc: (v: string) => void;
  descripciones?: Record<string, string>;
}
function BloqueAspecto({ titulo, subtitulo, nivel, onNivel, desc, onDesc, descripciones }: BloqueProps) {
  return (
    <tbody>
      <tr>
        <td colSpan={4} style={{ background: C.negro, color: '#fff', textAlign: 'center', fontWeight: 900, fontSize: 12, padding: '4px 8px', letterSpacing: 1 }}>
          {titulo}
        </td>
      </tr>
      <tr>
        <td colSpan={2} style={{ background: C.verdeClaro, color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px' }}>
          ({subtitulo})
        </td>
        <td colSpan={2} style={{ background: C.verde, color: '#fff', padding: '2px 8px' }}>
          <select value={nivel} onChange={e => {
            const v = e.target.value;
            onNivel(v);
            if (descripciones && v && descripciones[v]) onDesc(descripciones[v]);
          }}
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            {NIVELES.map(o => <option key={o} value={o} style={{ color: '#000', background: '#fff' }}>{o || '— Seleccionar —'}</option>)}
          </select>
        </td>
      </tr>
      <tr>
        <td colSpan={4} style={{ background: C.grisClaro, padding: '6px 10px' }}>
          <textarea value={desc} onChange={e => onDesc(e.target.value)}
            rows={2} placeholder="Descripción del desempeño..."
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
        </td>
      </tr>
    </tbody>
  );
}

/* ── Helpers de búsqueda en deportista ── */
function buscarCampo(dep: Deportista, regex: RegExp): string {
  const cols = dep._columnas ?? {};
  const key = Object.keys(cols).find(k => regex.test(k.trim()));
  return key ? cols[key].trim() : '';
}

const MESES_NOMBRE: Record<string, string> = {
  '1':'Enero','2':'Febrero','3':'Marzo','4':'Abril','5':'Mayo','6':'Junio',
  '7':'Julio','8':'Agosto','9':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
  'enero':'Enero','febrero':'Febrero','marzo':'Marzo','abril':'Abril','mayo':'Mayo','junio':'Junio',
  'julio':'Julio','agosto':'Agosto','septiembre':'Septiembre','octubre':'Octubre',
  'noviembre':'Noviembre','diciembre':'Diciembre',
};

function construirFechaNac(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const entries = Object.entries(cols);
  // Buscar campo fecha_nac directo
  const keyFecha = entries.find(([k]) => /fecha.*nac|nac.*fecha|f\.?nac/i.test(k.trim()))?.[0];
  if (keyFecha && cols[keyFecha].trim()) return cols[keyFecha].trim();
  // Construir desde dia/mes/año
  const keyAnio = entries.find(([k]) => /^a[ñn]o$/i.test(k.trim()))?.[0];
  const keyMes  = entries.find(([k]) => /^mes$/i.test(k.trim()))?.[0];
  const keyDia  = entries.find(([k]) => /^d[ií]a$/i.test(k.trim()))?.[0];
  if (!keyAnio && !keyMes && !keyDia) return '';
  const anio   = keyAnio ? cols[keyAnio].trim() : '';
  const mesRaw = keyMes  ? cols[keyMes].trim()  : '';
  const dia    = keyDia  ? cols[keyDia].trim()   : '';
  const mes    = MESES_NOMBRE[mesRaw] ?? MESES_NOMBRE[mesRaw.toLowerCase()] ?? mesRaw;
  return [dia && `${dia}`, mes, anio].filter(Boolean).join(' de ');
}

/* ════════════════════════════════════════════════════════════════ */
export default function ValoracionPage() {
  const router  = useRouter();
  const fotoRef = useRef<HTMLInputElement>(null);
  const [data,        setData]        = useState<Valoracion>(INICIAL);
  const [guardando,   setGuardando]   = useState(false);
  const [guardado,    setGuardado]    = useState(false);
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [encontrado,  setEncontrado]  = useState('');
  const [historial,   setHistorial]   = useState<Evaluacion[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);

  useEffect(() => {
    getDeportistas().then(setDeportistas);
  }, []);

  useEffect(() => {
    const cod = data.codigo.trim().toUpperCase();
    if (cod.length >= 2) {
      getEvaluaciones(cod).then(setHistorial);
    } else {
      setHistorial([]);
    }
  }, [data.codigo]);

  /* set genérico — sin definir componentes dentro */
  const set = (k: keyof Valoracion, v: string) => {
    let extra: Partial<Valoracion> = {};

    if (k === 'codigo') {
      const cod = v.trim().toUpperCase();
      if (cod.length >= 2) {
        const dep = deportistas.find(d =>
          Object.entries(d._columnas ?? {}).some(([key, val]) =>
            /^c[oó]d/i.test(key.trim()) && String(val).trim().toUpperCase() === cod
          )
        );
        if (dep) {
          const proyecto  = buscarCampo(dep, /^proy/i);
          const programa  = buscarCampo(dep, /^program/i)
            || buscarCampo(dep, /^categ/i)
            || buscarCampo(dep, /^sub/i);
          const posicion  = buscarCampo(dep, /^posici[oó]n/i) || buscarCampo(dep, /^pos$/i);
          const fechaNac  = construirFechaNac(dep);
          extra = {
            nombre: dep._nombre ?? '',
            proyecto,
            programa,
            fechaNac,
            ...(posicion ? { posicion } : {}),
          };
          setEncontrado(dep._nombre ?? '');
          setTimeout(() => setEncontrado(''), 3000);
        }
      }
    }

    setData(p => ({ ...p, [k]: v, ...extra }));
  };

  const guardar = async () => {
    if (!data.codigo.trim()) { alert('Ingresa el código del deportista antes de guardar.'); return; }
    setGuardando(true);
    try {
      await saveEvaluacion(data);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      getEvaluaciones(data.codigo).then(setHistorial);
    } finally {
      setGuardando(false);
    }
  };

  const limpiar = () => {
    if (confirm('¿Limpiar el formulario? (el historial guardado en Supabase no se borra)')) {
      setData({ ...INICIAL, fecha: new Date().toLocaleDateString('es-CO') });
    }
  };

  const cargarDeHistorial = (ev: Evaluacion) => {
    const { id, ...resto } = ev;
    setData(resto);
    setVerHistorial(false);
  };

  const onFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => set('foto', ev.target?.result as string);
    r.readAsDataURL(f);
  };

  /* ── Render helpers — funciones, NO componentes ── */
  const inp = (campo: keyof Valoracion, placeholder = '', type = 'text') => (
    <input type={type} value={data[campo]} onChange={e => set(campo, e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', fontWeight: 700, fontSize: 12, fontFamily: 'Arial, sans-serif' }} />
  );

  const sel = (campo: keyof Valoracion, opts: string[]) => (
    <select value={data[campo]} onChange={e => set(campo, e.target.value)}
      style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
      {opts.map(o => <option key={o} value={o}>{o || '— Seleccionar —'}</option>)}
    </select>
  );

  const celda = (bg: string, color: string, content: React.ReactNode, extra?: React.CSSProperties) => (
    <td style={{ background: bg, color, padding: '3px 8px', fontSize: 11, fontWeight: 700, ...extra }}>{content}</td>
  );

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}>

      {/* Barra herramientas */}
      <div className="print:hidden" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push('/dashboard')} style={{ color: '#6b7280', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontWeight: 800, color: '#111', flex: 1, fontSize: 15 }}>Valoración del Deportista</span>
        {historial.length > 0 && (
          <button onClick={() => setVerHistorial(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <History size={13} /> Historial ({historial.length})
          </button>
        )}
        <button onClick={limpiar} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <RefreshCw size={13} /> Limpiar
        </button>
        <button onClick={guardar} disabled={guardando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: C.verde, color: '#fff', cursor: guardando ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, opacity: guardando ? 0.7 : 1 }}>
          <Save size={13} /> {guardado ? '¡Guardado!' : guardando ? 'Guardando...' : 'Guardar'}
        </button>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: C.naranja, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Printer size={13} /> Imprimir / PDF
        </button>
      </div>

      {/* HISTORIAL DE EVALUACIONES DEL DEPORTISTA */}
      {verHistorial && historial.length > 0 && (
        <div className="print:hidden" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Evaluaciones anteriores de {data.nombre || data.codigo}:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {historial.map(ev => (
              <button key={ev.id} onClick={() => cargarDeHistorial(ev)}
                style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 12 }}>
                <span>{ev.fecha}</span>
                <span style={{ color: '#6b7280' }}>{ev.proyecto || ev.programa || ev.perfil || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FORMULARIO */}
      <div style={{ maxWidth: 780, margin: '16px auto', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.12)', fontFamily: 'Arial, sans-serif' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>

          {/* ── ENCABEZADO REDISEÑADO ── */}
          <tbody>
            <tr>
              <td colSpan={3} style={{ padding: 0 }}>
                {/* Título superior */}
                <div style={{ background: '#111', color: '#fff', textAlign: 'center', fontWeight: 900, fontSize: 13, letterSpacing: 3, padding: '7px 16px', textTransform: 'uppercase' }}>
                  Valoración Cuantitativa del Deportista
                </div>

                {/* Tarjeta hero verde oscura */}
                <div style={{ background: 'linear-gradient(135deg, #0a2e12 0%, #052a10 55%, #000 100%)', padding: 12, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

                    {/* Foto 3×4 */}
                    <div style={{ flexShrink: 0 }}>
                      <input ref={fotoRef} type="file" accept="image/*" onChange={onFoto} style={{ display: 'none' }} />
                      <div onClick={() => fotoRef.current?.click()}
                        style={{ width: 68, height: 90, borderRadius: 10, overflow: 'hidden', background: '#0d3d1a', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {data.foto
                          ? <img src={data.foto} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                          : <>
                              <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, lineHeight: 1 }}>
                                {data.nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FA'}
                              </span>
                              <Camera size={13} color="rgba(255,255,255,0.4)" style={{ marginTop: 4 }} />
                            </>
                        }
                      </div>
                    </div>

                    {/* Nombre + filas de datos */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre */}
                      <div style={{ color: '#fff', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, lineHeight: 1.2 }}>
                        <input value={data.nombre} onChange={e => set('nombre', e.target.value)}
                          placeholder="NOMBRE DEL DEPORTISTA"
                          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Arial, sans-serif', padding: 0 }} />
                      </div>
                      {/* Código (pantalla) + encontrado */}
                      <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>CÓDIGO</span>
                        <input value={data.codigo} onChange={e => set('codigo', e.target.value)}
                          placeholder="Ej: 24228"
                          style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 700, fontSize: 10, fontFamily: 'Arial, sans-serif', width: 70, padding: 0 }} />
                        {encontrado && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dcfce7', borderRadius: 5, padding: '2px 6px', fontSize: 9, color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <CheckCircle size={10} /> {encontrado}
                          </div>
                        )}
                      </div>
                      {/* Filas de info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {([
                          { label: 'PROGRAMA',    field: 'programa',      placeholder: 'Auto-cargado del perfil', editable: true  },
                          { label: 'PROYECTO',    field: 'proyecto',      placeholder: 'Auto-cargado del perfil', editable: true  },
                          { label: 'FECHA INF.',  field: 'fecha',         placeholder: 'dd/mm/aaaa',             editable: true  },
                          { label: '# INFORME',   field: 'numeroInforme', placeholder: '01',                     editable: true  },
                        ] as { label: string; field: keyof Valoracion; placeholder: string; editable: boolean }[]).map(({ label, field, placeholder }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>
                              {label}
                            </span>
                            <input value={data[field]} onChange={e => set(field, e.target.value)}
                              placeholder={placeholder}
                              style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 600, fontSize: 10, fontFamily: 'Arial, sans-serif', flex: 1, padding: 0 }} />
                          </div>
                        ))}
                        {/* POSICIÓN y PERFIL con selects */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          {([
                            { label: 'POSICIÓN', field: 'posicion' as keyof Valoracion, opts: POSICIONES },
                            { label: 'PERFIL',   field: 'perfil'   as keyof Valoracion, opts: PERFILES   },
                          ]).map(({ label, field, opts }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>
                                {label}
                              </span>
                              <select value={data[field]} onChange={e => set(field, e.target.value)}
                                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 600, fontSize: 10, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                                {opts.map(o => <option key={o} value={o} style={{ color: '#000', background: '#fff' }}>{o || '— Seleccionar —'}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* CÓDIGO badge (para imprimir) */}
                    <div style={{ flexShrink: 0, textAlign: 'center', alignSelf: 'flex-start' }}>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 }}>CÓDIGO</div>
                      <div style={{ background: '#16a34a', color: '#fff', fontWeight: 900, fontSize: 17, padding: '8px 10px', borderRadius: 10, minWidth: 55, textAlign: 'center', lineHeight: 1 }}>
                        {data.codigo || '—'}
                      </div>
                    </div>

                  </div>
                </div>
              </td>
            </tr>
          </tbody>

          {/* ASPECTOS CONDICIONALES */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'ASPECTOS CONDICIONALES', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo="FUERZA" subtitulo="Potencia y Duelo"
            nivel={data.fuerzaNivel} onNivel={v => set('fuerzaNivel', v)}
            desc={data.fuerzaDesc}   onDesc={v => set('fuerzaDesc', v)}
            descripciones={DESC_FUERZA} />
          <BloqueAspecto titulo="VELOCIDAD" subtitulo="Reacción y Desplazamiento"
            nivel={data.velocidadNivel} onNivel={v => set('velocidadNivel', v)}
            desc={data.velocidadDesc}   onDesc={v => set('velocidadDesc', v)}
            descripciones={DESC_VELOCIDAD} />
          <BloqueAspecto titulo="RESISTENCIA" subtitulo="Capacidad Aeróbica y Recuperación"
            nivel={data.resistenciaNivel} onNivel={v => set('resistenciaNivel', v)}
            desc={data.resistenciaDesc}   onDesc={v => set('resistenciaDesc', v)}
            descripciones={DESC_RESISTENCIA} />

          {/* TÉCNICA */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'TÉCNICA (RELACIONAMIENTO CON EL BALÓN)', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '2px 8px', fontStyle: 'italic' }}>Evalúa la ejecución de los fundamentos básicos del juego</td></tr>
          </tbody>
          <BloqueAspecto titulo="CONTROL Y PASE" subtitulo="Recepción, Manejo y Precisión"
            nivel={data.controlNivel} onNivel={v => set('controlNivel', v)}
            desc={data.controlDesc}   onDesc={v => set('controlDesc', v)}
            descripciones={DESC_CONTROL_PASE} />
          <BloqueAspecto titulo="CONDUCCIÓN Y DRIBBLING" subtitulo="Desplazamiento con Balón"
            nivel={data.conductaNivel} onNivel={v => set('conductaNivel', v)}
            desc={data.conductaDesc}   onDesc={v => set('conductaDesc', v)}
            descripciones={DESC_CONDUCCION} />
          <BloqueAspecto titulo="CONTROL ORIENTADO" subtitulo="Primer Toque y Salida"
            nivel={data.paseNivel} onNivel={v => set('paseNivel', v)}
            desc={data.paseDesc}   onDesc={v => set('paseDesc', v)}
            descripciones={DESC_CONTROL_ORIENTADO} />
          <BloqueAspecto titulo="REMATE A PORTERÍA" subtitulo="Potencia y Definición"
            nivel={data.remataNivel} onNivel={v => set('remataNivel', v)}
            desc={data.remataDesc}   onDesc={v => set('remataDesc', v)}
            descripciones={DESC_REMATE} />
          <BloqueAspecto titulo="PROTECCIÓN DEL BALÓN" subtitulo="Resguardo y Dominio"
            nivel={data.proteccionNivel} onNivel={v => set('proteccionNivel', v)}
            desc={data.proteccionDesc}   onDesc={v => set('proteccionDesc', v)}
            descripciones={DESC_PROTECCION} />

          {/* TÁCTICA */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'TÁCTICA', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '2px 8px', fontStyle: 'italic' }}>Comprensión del juego y toma de decisiones</td></tr>
          </tbody>
          <BloqueAspecto titulo="UBICACIÓN ESPACIAL" subtitulo="Posicionamiento y Orientación"
            nivel={data.posicionNivel} onNivel={v => set('posicionNivel', v)}
            desc={data.posicionDesc}   onDesc={v => set('posicionDesc', v)}
            descripciones={DESC_UBICACION} />
          <BloqueAspecto titulo="VELOCIDAD DE PROCESAMIENTO" subtitulo="Toma de Decisiones Rápida"
            nivel={data.visionNivel} onNivel={v => set('visionNivel', v)}
            desc={data.visionDesc}   onDesc={v => set('visionDesc', v)}
            descripciones={DESC_VELOCIDAD_PROC} />
          <BloqueAspecto titulo="LECTURA DE ALTURAS Y ESPACIOS" subtitulo="Análisis del Terreno"
            nivel={data.defensaNivel} onNivel={v => set('defensaNivel', v)}
            desc={data.defensaDesc}   onDesc={v => set('defensaDesc', v)}
            descripciones={DESC_LECTURA_ALTURAS} />
          <BloqueAspecto titulo="AMPLITUD Y PROFUNDIDAD" subtitulo="Uso del Espacio"
            nivel={data.amplitudNivel} onNivel={v => set('amplitudNivel', v)}
            desc={data.amplitudDesc}   onDesc={v => set('amplitudDesc', v)}
            descripciones={DESC_AMPLITUD} />
          <BloqueAspecto titulo="TRANSICIONES (ATAQUE-DEFENSA)" subtitulo="Cambio de Rol Ofensivo/Defensivo"
            nivel={data.transicionNivel} onNivel={v => set('transicionNivel', v)}
            desc={data.transicionDesc}   onDesc={v => set('transicionDesc', v)}
            descripciones={DESC_TRANSICION} />
          <BloqueAspecto titulo="LECTURA DE SUPERIORIDAD (2vs1)" subtitulo="Situaciones de Ventaja Numérica"
            nivel={data.superioridadNivel} onNivel={v => set('superioridadNivel', v)}
            desc={data.superioridadDesc}   onDesc={v => set('superioridadDesc', v)}
            descripciones={DESC_SUPERIORIDAD} />
          <BloqueAspecto titulo="BASCULACIÓN Y COBERTURAS" subtitulo="Desplazamiento Colectivo"
            nivel={data.basculacionNivel} onNivel={v => set('basculacionNivel', v)}
            desc={data.basculacionDesc}   onDesc={v => set('basculacionDesc', v)}
            descripciones={DESC_BASCULACION} />

          {/* SOCIO-AFECTIVA Y ACTITUDINAL */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'Socio-Afectiva y Actitudinal', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo="TRABAJO EN EQUIPO" subtitulo="Compañerismo y Comunicación"
            nivel={data.trabajoNivel} onNivel={v => set('trabajoNivel', v)}
            desc={data.trabajoDesc}   onDesc={v => set('trabajoDesc', v)} />
          <BloqueAspecto titulo="GESTIÓN DE LA FRUSTRACIÓN" subtitulo="Autocontrol y Resiliencia"
            nivel={data.disciplinaNivel} onNivel={v => set('disciplinaNivel', v)}
            desc={data.disciplinaDesc}   onDesc={v => set('disciplinaDesc', v)} />
          <BloqueAspecto titulo="COMUNICACIÓN ACERTIVA" subtitulo="Expresión y Asertividad"
            nivel={data.actitudNivel} onNivel={v => set('actitudNivel', v)}
            desc={data.actitudDesc}   onDesc={v => set('actitudDesc', v)} />

          {/* OBSERVACIONES */}
          <tbody>
            <tr>{celda(C.negro, '#fff', 'OBSERVACIONES GENERALES', { colSpan: 4, textAlign: 'center', fontSize: 12, letterSpacing: 2 } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <textarea value={data.observaciones} onChange={e => set('observaciones', e.target.value)}
                  rows={4} placeholder="Observaciones generales del entrenador..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
              </td>
            </tr>
          </tbody>

          {/* FIRMAS */}
          <tbody>
            <tr>
              <td colSpan={2} style={{ padding: '24px 24px 10px', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#555' }}>Firma del Entrenador</div>
              </td>
              <td colSpan={2} style={{ padding: '24px 24px 10px', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#555' }}>Firma del Directivo</div>
              </td>
            </tr>
            <tr>
              <td colSpan={4} style={{ background: C.verde, color: '#fff', textAlign: 'center', fontSize: 10, padding: 6, fontWeight: 700, letterSpacing: 1 }}>
                FUTURO ANTIOQUIA — MAX 10 SPORT · Conecta, Gestiona, Gana
              </td>
            </tr>
          </tbody>

        </table>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block  { display: block  !important; }
          .hidden { display: none !important; }
          @page { margin: 8mm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
