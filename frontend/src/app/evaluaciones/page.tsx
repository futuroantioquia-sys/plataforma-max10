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
};

const INICIAL: Valoracion = {
  fecha: new Date().toLocaleDateString('es-CO'), codigo: '', nombre: '', fechaNac: '',
  programa: '', proyecto: '', perfil: '', posicion: '', foto: '',
  fuerzaNivel: '', fuerzaDesc: '', velocidadNivel: '', velocidadDesc: '',
  resistenciaNivel: '', resistenciaDesc: '', controlNivel: '', controlDesc: '',
  paseNivel: '', paseDesc: '', remataNivel: '', remataDesc: '',
  conductaNivel: '', conductaDesc: '', posicionNivel: '', posicionDesc: '',
  visionNivel: '', visionDesc: '', defensaNivel: '', defensaDesc: '',
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

          {/* ENCABEZADO */}
          <tbody>
            <tr>
              {/* Logo */}
              <td style={{ width: 110, padding: 10, textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ width: 88, height: 88, borderRadius: 8, background: '#e8f5e9', border: '2px solid #2d8a48', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: C.verde }}>FA</span>
                </div>
              </td>
              {/* Título */}
              <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px' }}>
                <div style={{ fontSize: 11, color: '#777', letterSpacing: 3, fontWeight: 600, textTransform: 'uppercase' }}>Seguimiento Deportivo</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: C.negro, lineHeight: 1 }}>Futuro</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: C.verde, lineHeight: 1 }}>Antioquia</div>
              </td>
              {/* Foto */}
              <td style={{ width: 110, padding: 10, textAlign: 'center', verticalAlign: 'middle' }}>
                <input ref={fotoRef} type="file" accept="image/*" onChange={onFoto} style={{ display: 'none' }} />
                <div onClick={() => fotoRef.current?.click()} className="print:hidden"
                  style={{ width: 90, height: 110, borderRadius: 8, border: '2px dashed #2d8a48', background: data.foto ? 'transparent' : '#e8f5e9', overflow: 'hidden', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {data.foto
                    ? <img src={data.foto} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ textAlign: 'center', color: C.verde, fontSize: 10 }}><Camera size={22} /><div style={{ marginTop: 3 }}>Foto</div></div>
                  }
                </div>
                {data.foto && <img src={data.foto} alt="foto" className="hidden print:block" style={{ width: 90, height: 110, objectFit: 'cover', borderRadius: 8, margin: '0 auto' }} />}
              </td>
            </tr>
          </tbody>

          {/* SEGUIMIENTO DEPORTIVO */}
          <tbody>
            <tr>{celda(C.negro, '#fff', 'SEGUIMIENTO DEPORTIVO', { colSpan: 3, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr>
              {celda(C.negro, '#fff', 'FECHA', { width: '16%' })}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>{inp('fecha')}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'CODIGO')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {inp('codigo', 'Ej: B635')}
                  {encontrado && (
                    <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '2px 8px', fontSize: 10, color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <CheckCircle size={11} /> {encontrado}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </tbody>

          {/* DATOS DEL DEPORTISTA */}
          <tbody>
            <tr>{celda(C.negro, '#fff', 'DATOS DEL DEPORTISTA', { colSpan: 3, textAlign: 'center', fontSize: 12, letterSpacing: 2 } as any)}</tr>
            <tr>
              {celda(C.negro, '#fff', 'NOMBRE')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>{inp('nombre')}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'FECHA DE NACIMIENTO')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>{inp('fechaNac', 'Auto-cargado del perfil')}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'PROGRAMA')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>{inp('programa', 'Auto-cargado del perfil')}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'PROYECTO')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '3px 8px' }}>{inp('proyecto', 'Auto-cargado del perfil')}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'PERFIL')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '2px 8px' }}>{sel('perfil', PERFILES)}</td>
            </tr>
            <tr>
              {celda(C.negro, '#fff', 'POSICIÓN')}
              <td colSpan={2} style={{ background: C.grisClaro, padding: '2px 8px' }}>{sel('posicion', POSICIONES)}</td>
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
          <BloqueAspecto titulo="REMATE A PORTERÍA" subtitulo="Potencia y Definición"
            nivel={data.remataNivel} onNivel={v => set('remataNivel', v)}
            desc={data.remataDesc}   onDesc={v => set('remataDesc', v)} />

          {/* TÁCTICA */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'TÁCTICA', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '2px 8px', fontStyle: 'italic' }}>Comprensión del juego y toma de decisiones</td></tr>
          </tbody>
          <BloqueAspecto titulo="POSICIONAMIENTO" subtitulo="Ubicación en el Campo"
            nivel={data.posicionNivel} onNivel={v => set('posicionNivel', v)}
            desc={data.posicionDesc}   onDesc={v => set('posicionDesc', v)} />
          <BloqueAspecto titulo="VISIÓN DE JUEGO" subtitulo="Lectura y Anticipación"
            nivel={data.visionNivel} onNivel={v => set('visionNivel', v)}
            desc={data.visionDesc}   onDesc={v => set('visionDesc', v)} />
          <BloqueAspecto titulo="DEFENSA" subtitulo="Recuperación y Marcaje"
            nivel={data.defensaNivel} onNivel={v => set('defensaNivel', v)}
            desc={data.defensaDesc}   onDesc={v => set('defensaDesc', v)} />

          {/* ASPECTOS FORMATIVOS */}
          <tbody>
            <tr>{celda(C.naranja, '#fff', 'ASPECTOS FORMATIVOS', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo="ACTITUD Y COMPROMISO" subtitulo="Esfuerzo y Responsabilidad"
            nivel={data.actitudNivel} onNivel={v => set('actitudNivel', v)}
            desc={data.actitudDesc}   onDesc={v => set('actitudDesc', v)} />
          <BloqueAspecto titulo="DISCIPLINA Y RESPETO" subtitulo="Comportamiento y Valores"
            nivel={data.disciplinaNivel} onNivel={v => set('disciplinaNivel', v)}
            desc={data.disciplinaDesc}   onDesc={v => set('disciplinaDesc', v)} />
          <BloqueAspecto titulo="TRABAJO EN EQUIPO" subtitulo="Compañerismo y Comunicación"
            nivel={data.trabajoNivel} onNivel={v => set('trabajoNivel', v)}
            desc={data.trabajoDesc}   onDesc={v => set('trabajoDesc', v)} />

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
