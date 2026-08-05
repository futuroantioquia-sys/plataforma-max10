'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Save, RefreshCw, Camera, CheckCircle, History } from 'lucide-react';
import { getDeportistas, getEvaluaciones, saveEvaluacion, getProfes } from '@/lib/db';
import type { Deportista, Evaluacion, Profe } from '@/lib/db';
import { getDescripcionesValoracion, getMetaValoracion, type FundMetaEdit } from '@/lib/valoracion-textos';

const NIVELES = ['', 'Nivel 1 (Iniciación)', 'Nivel 2 (En Desarrollo)', 'Nivel 3 (Competente)', 'Nivel 4 (Avanzado)', 'Nivel 5 (Dominante)'];

/** Textarea que crece solo con el contenido (sin scroll ni flechas). */
function AutoTextarea({ value, onChange, placeholder, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 26) + 'px';
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={1}
      style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 15, resize: 'none', overflow: 'hidden', fontFamily: 'Arial, sans-serif', color: '#333', display: 'block', lineHeight: 1.5, ...style }} />
  );
}

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
const DESC_CONTROL: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'El balón se le escapa tras el primer toque; necesita varios contactos para dominarlo.',
  'Nivel 2 (En Desarrollo)':'Detiene el balón, pero queda estático. Requiere un segundo toque para empezar a moverse.',
  'Nivel 3 (Competente)':   'Controla el balón hacia una zona libre de presión en situaciones de baja intensidad.',
  'Nivel 4 (Avanzado)':     'El primer toque ya es una ventaja: prepara el balón para el siguiente pase o tiro de inmediato.',
  'Nivel 5 (Dominante)':    'Domina el control con cualquier superficie (pecho, muslo, cabeza) y elimina rivales con el primer toque.',
};
const DESC_PASE: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Pases sin dirección; no elige bien la superficie de contacto ni al compañero receptor.',
  'Nivel 2 (En Desarrollo)':'Logra dar el pase a un compañero cercano, pero sin intención táctica ni variación de distancia.',
  'Nivel 3 (Competente)':   'Pases precisos a corta y media distancia; elige correctamente al compañero libre.',
  'Nivel 4 (Avanzado)':     'Varía la distancia, velocidad y superficie del pase con intención táctica clara.',
  'Nivel 5 (Dominante)':    'Precisión total bajo presión; ejecuta pases filtrados, de cambio de juego y de larga distancia.',
};
const DESC_CONDUCCION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Mantiene la vista fija en el balón; pierde el control al aumentar la velocidad.',
  'Nivel 2 (En Desarrollo)':'Conduce con el interior/exterior pero con trayectorias rígidas.',
  'Nivel 3 (Competente)':   'Conduce con la cabeza levantada; realiza cambios de dirección básicos.',
  'Nivel 4 (Avanzado)':     'Domina el cambio de ritmo y fintas para superar rivales en el 1vs1.',
  'Nivel 5 (Dominante)':    'Control total del espacio y el balón; utiliza ambos perfiles para desequilibrar.',
};
const DESC_DRIBLING: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Evita el duelo 1vs1; pierde el balón ante el primer contacto con el rival.',
  'Nivel 2 (En Desarrollo)':'Intenta una finta básica pero es predecible; el rival suele anticipar el movimiento.',
  'Nivel 3 (Competente)':   'Realiza uno o dos regates básicos para superar al rival en espacios amplios.',
  'Nivel 4 (Avanzado)':     'Domina 2-3 movimientos de dribling; supera al rival con cambio de ritmo y de dirección.',
  'Nivel 5 (Dominante)':    'Arsenal variado de regates; supera rivales con ambos perfiles bajo presión defensiva intensa.',
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
const DESC_GESTION_COMPETICION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Se desmoronan ante el primer gol en contra; falta de orden en la adversidad.',
  'Nivel 2 (En Desarrollo)':'Compiten bien a ratos, pero pierden la concentración en los minutos finales o tras errores.',
  'Nivel 3 (Competente)':   'Equipo competitivo que lucha hasta el final, manteniendo la calma y el orden la mayor parte del tiempo.',
  'Nivel 4 (Avanzado)':     'Gran madurez competitiva; saben manejar los tiempos del partido (cuándo acelerar y cuándo pausar).',
  'Nivel 5 (Dominante)':    'Mentalidad ganadora colectiva; el equipo crece en la dificultad y gestiona la presión con absoluta seguridad.',
};

const DESC_CLIMA_INTERNO: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Hay discusiones frecuentes, reproches ante el error o silencio absoluto.',
  'Nivel 2 (En Desarrollo)':'La comunicación es escasa o solo ocurre cuando van ganando. Hay subgrupos marcados.',
  'Nivel 3 (Competente)':   'Comunicación funcional y positiva. Se alientan entre sí y aceptan las correcciones del líder/DT.',
  'Nivel 4 (Avanzado)':     'Existe un lenguaje común en el campo; se apoyan en los momentos críticos y celebran el éxito ajeno.',
  'Nivel 5 (Dominante)':    'Fraternidad y resiliencia. El equipo es una familia donde la confianza permite máxima exigencia sin conflicto.',
};

const DESC_BLOQUE_COHESION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Equipo "partido" o estirado; mucha distancia entre defensas y delanteros.',
  'Nivel 2 (En Desarrollo)':'Hay intentos de moverse juntos, pero se generan huecos grandes al defender o atacar.',
  'Nivel 3 (Competente)':   'El equipo se mueve como un bloque; hay ayudas mutuas y las líneas mantienen distancias correctas.',
  'Nivel 4 (Avanzado)':     'Basculaciones y coberturas automáticas. El equipo se encoge y se estira con mucha fluidez.',
  'Nivel 5 (Dominante)':    'Unidad total; el bloque se mueve de forma coordinada y asfixiante. Compacto en todas sus líneas.',
};

const DESC_IDENTIDAD_ESTILO: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'No hay un estilo claro; el equipo juega al azar y depende de individualidades.',
  'Nivel 2 (En Desarrollo)':'Se intentan seguir algunas ideas del DT, pero el equipo pierde la forma rápidamente.',
  'Nivel 3 (Competente)':   'El equipo tiene una idea clara (ej: salir jugando, presionar alto) y la mantiene gran parte del tiempo.',
  'Nivel 4 (Avanzado)':     'Estilo de juego definido y reconocible. Los jugadores saben a qué juegan incluso en situaciones difíciles.',
  'Nivel 5 (Dominante)':    'El equipo domina múltiples variantes tácticas y tiene una identidad inquebrantable sin importar el rival.',
};

const DESC_COMUNICACION_ASERTIVA: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'No habla en el campo; juega de forma aislada sin interactuar con el entorno.',
  'Nivel 2 (En Desarrollo)':'Se comunica solo para pedir el balón; comunicación verbal limitada y reactiva.',
  'Nivel 3 (Competente)':   'Da indicaciones básicas ("solo", "pasa", "mío") que ayudan a la fluidez del juego.',
  'Nivel 4 (Avanzado)':     'Habla constantemente para organizar la defensa o alertar a compañeros sobre peligros.',
  'Nivel 5 (Dominante)':    'Líder comunicativo; utiliza un lenguaje positivo y técnico para coordinar al equipo en todo momento.',
};

const DESC_GESTION_FRUSTRACION: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Se rinde o llora ante el error o la derrota; se desconecta del partido si algo sale mal.',
  'Nivel 2 (En Desarrollo)':'Muestra enfado ante el error; le cuesta retomar el ritmo de juego tras una falla.',
  'Nivel 3 (Competente)':   'Acepta el error como parte del juego y sigue esforzándose, aunque le afecte el ánimo.',
  'Nivel 4 (Avanzado)':     'Utiliza el error como motivación para recuperar el balón de inmediato. Mantiene el equilibrio.',
  'Nivel 5 (Dominante)':    'Resiliencia total; contagia calma y seguridad a sus compañeros en momentos de máxima tensión.',
};

const DESC_TRABAJO_EQUIPO: Record<string, string> = {
  'Nivel 1 (Iniciación)':   'Juega de forma individualista; le cuesta seguir instrucciones grupales.',
  'Nivel 2 (En Desarrollo)':'Empieza a colaborar con compañeros cercanos; acepta las reglas.',
  'Nivel 3 (Competente)':   'Muestra compañerismo; acepta críticas constructivas y apoya al equipo.',
  'Nivel 4 (Avanzado)':     'Liderazgo positivo; se comunica activamente para ayudar al grupo.',
  'Nivel 5 (Dominante)':    'Referente dentro y fuera del campo; gestiona la frustración y motiva al resto.',
};

const POSICIONES = ['', 'PORTERO', 'CENTRAL', 'LATERAL DERECHO', 'LATERAL IZQUIERDO', 'EXTREMO DERECHO', 'EXTREMO IZQUIERDO', 'VOLANTE', 'MEDIOCAMPISTA', 'DELANTERO CENTRO'];
const PERFILES = ['', 'DERECHO', 'IZQUIERDO', 'AMBIDIESTRO'];

const C = {
  negro: '#1a1a1a', verde: '#15803d', naranja: '#e85d04',
  verdeClaro: '#166534', grisClaro: '#f0f0f0', grisAzul: '#475569',
};
const VERDE_GRAD = 'linear-gradient(135deg, #16a34a 0%, #052a10 100%)';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Valoracion = {
  fecha: string; codigo: string; nombre: string; fechaNac: string;
  programa: string; proyecto: string; perfil: string; posicion: string;
  foto: string;
  numeroInforme: string;
  periodoDesde: string; periodoHasta: string;
  fuerzaNivel: string; fuerzaDesc: string;
  velocidadNivel: string; velocidadDesc: string;
  resistenciaNivel: string; resistenciaDesc: string;
  controlNivel: string; controlDesc: string;
  paseNivel: string; paseDesc: string;
  conductaNivel: string; conductaDesc: string;
  driblingNivel: string; driblingDesc: string;
  remataNivel: string; remataDesc: string;
  cabeceoNivel: string; cabeceoDesc: string;
  quiteNivel: string; quiteDesc: string;
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
  identidadNivel: string; identidadDesc: string;
  bloqueNivel: string; bloqueDesc: string;
  climaNivel: string; climaDesc: string;
  gestionCompNivel: string; gestionCompDesc: string;
  responsabilidad: string; puntualidad: string; disciplinaComp: string; respeto: string;
  tolerancia: string; companerismo: string; liderazgo: string; trabajoEquipoComp: string; sentidoPertenencia: string;
  logrosTrimestre: string;
  objetivosTrimestre: string;
  equipoTrimestre: string;
  observaciones: string;
};

const INICIAL: Valoracion = {
  fecha: new Date().toLocaleDateString('es-CO'), codigo: '', nombre: '', fechaNac: '',
  programa: '', proyecto: '', perfil: '', posicion: '', foto: '', numeroInforme: '',
  periodoDesde: '', periodoHasta: '',
  fuerzaNivel: '', fuerzaDesc: '', velocidadNivel: '', velocidadDesc: '',
  resistenciaNivel: '', resistenciaDesc: '',
  controlNivel: '', controlDesc: '',
  paseNivel: '', paseDesc: '',
  conductaNivel: '', conductaDesc: '',
  driblingNivel: '', driblingDesc: '',
  remataNivel: '', remataDesc: '',
  cabeceoNivel: '', cabeceoDesc: '',
  quiteNivel: '', quiteDesc: '',
  proteccionNivel: '', proteccionDesc: '',
  posicionNivel: '', posicionDesc: '',
  visionNivel: '', visionDesc: '', defensaNivel: '', defensaDesc: '',
  amplitudNivel: '', amplitudDesc: '',
  transicionNivel: '', transicionDesc: '',
  superioridadNivel: '', superioridadDesc: '',
  basculacionNivel: '', basculacionDesc: '',
  actitudNivel: '', actitudDesc: '', disciplinaNivel: '', disciplinaDesc: '',
  trabajoNivel: '', trabajoDesc: '',
  identidadNivel: '', identidadDesc: '',
  bloqueNivel: '', bloqueDesc: '',
  climaNivel: '', climaDesc: '',
  gestionCompNivel: '', gestionCompDesc: '',
  responsabilidad: '', puntualidad: '', disciplinaComp: '', respeto: '',
  tolerancia: '', companerismo: '', liderazgo: '', trabajoEquipoComp: '', sentidoPertenencia: '',
  logrosTrimestre: '',
  objetivosTrimestre: '',
  equipoTrimestre: '',
  observaciones: '',
};

/* ══════════════════════════════════════════════════════════════
   VISTA GAMIFICADA — PADRES / DEPORTISTA
   ══════════════════════════════════════════════════════════════ */
const NIVEL_NUM = (s: string) => { const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
const COMP_NUM = (s: string): number =>
  ({ 'SIEMPRE': 5, 'CASI SIEMPRE': 4, 'ALGUNAS VECES': 3, 'CASI NUNCA': 2, 'NUNCA': 1 } as Record<string, number>)[s] ?? 0;
const PROM_G = (vals: number[]) => {
  const f = vals.filter(v => v > 0);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
};
const LVL_COLOR = ['#555', '#ef4444', '#f97316', '#eab308', '#22c55e', '#00d4ff'];
const LVL_SHORT = ['—', 'INI', 'DEV', 'COM', 'AVZ', 'DOM'];

/* ── Radar SVG ── */
function RadarGrafico({ scores, labels }: { scores: number[]; labels: string[] }) {
  const cx = 150, cy = 155, maxR = 100, n = scores.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const gridPoly = (pct: number) =>
    Array.from({ length: n }, (_, i) => { const { x, y } = pt(i, pct * maxR); return `${x},${y}`; }).join(' ');
  const playerPoly = scores.map((s, i) => { const { x, y } = pt(i, (s / 5) * maxR); return `${x},${y}`; }).join(' ');
  return (
    <svg width="300" height="310" viewBox="0 0 300 310" style={{ overflow: 'visible' }}>
      {[0.2, 0.4, 0.6, 0.8, 1.0].map(pct => (
        <polygon key={pct} points={gridPoly(pct)} fill="none" stroke="#1e3a4a" strokeWidth={pct === 1.0 ? 1.5 : 1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const { x, y } = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1e3a4a" strokeWidth="1" />;
      })}
      <polygon points={playerPoly} fill="rgba(0,212,136,0.2)" stroke="#00d488" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,136,0.4))' }} />
      {scores.map((s, i) => {
        if (!s) return null;
        const { x, y } = pt(i, (s / 5) * maxR);
        return <circle key={i} cx={x} cy={y} r="5" fill="#00d488" style={{ filter: 'drop-shadow(0 0 4px #00d488)' }} />;
      })}
      {labels.map((lbl, i) => {
        const { x, y } = pt(i, maxR + 24);
        return (
          <g key={i}>
            <text x={x} y={y - 7} textAnchor="middle" fill="#9ca3af" fontSize="8.5" fontWeight="800" fontFamily="Arial" letterSpacing="0.5">{lbl}</text>
            <text x={x} y={y + 6} textAnchor="middle" fill={scores[i] > 0 ? '#00d488' : '#555'} fontSize="10" fontWeight="900" fontFamily="Arial">
              {scores[i] > 0 ? scores[i].toFixed(1) : '—'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Barra de habilidad ── */
function BarraHabilidad({ label, nivel }: { label: string; nivel: string }) {
  const nv = NIVEL_NUM(nivel);
  const pct = nv > 0 ? (nv / 5) * 100 : 0;
  const color = LVL_COLOR[nv] || '#555';
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 900, background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 3, padding: '1px 6px' }}>
          {nv > 0 ? LVL_SHORT[nv] : '—'}
        </span>
      </div>
      <div style={{ background: '#0f2235', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}66, ${color})`, borderRadius: 4, boxShadow: nv >= 4 ? `0 0 6px ${color}88` : 'none' }} />
      </div>
    </div>
  );
}

/* ── Sección colapsable ── */
function SeccionJuego({ icono, titulo, score, children, defaultOpen = false }: {
  icono: string; titulo: string; score: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [abierto, setAbierto] = useState(defaultOpen);
  const color = score === 0 ? '#555' : score >= 4.5 ? '#00d4ff' : score >= 3.5 ? '#22c55e' : score >= 2.5 ? '#eab308' : '#f97316';
  return (
    <div style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #1e3a4a', background: '#0d1f2e' }}>
      <button onClick={() => setAbierto(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>{icono}</span>
        <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{titulo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 60, height: 5, background: '#0f2235', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(score / 5) * 100}%`, height: '100%', background: color, boxShadow: `0 0 5px ${color}` }} />
          </div>
          <span style={{ color, fontWeight: 900, fontSize: 13, minWidth: 28 }}>{score > 0 ? score.toFixed(1) : '—'}</span>
          <span style={{ color: '#475569', fontSize: 12 }}>{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierto && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid #1e3a4a' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── VISTA PADRES COMPLETA ── */
function VistaPadres({ data, nombreEntrenador, onClose }: {
  data: Valoracion; nombreEntrenador: string; onClose: () => void;
}) {
  const fisico       = PROM_G([NIVEL_NUM(data.fuerzaNivel), NIVEL_NUM(data.velocidadNivel), NIVEL_NUM(data.resistenciaNivel)]);
  const tecnico      = PROM_G([NIVEL_NUM(data.controlNivel), NIVEL_NUM(data.paseNivel), NIVEL_NUM(data.conductaNivel), NIVEL_NUM(data.driblingNivel), NIVEL_NUM(data.remataNivel), NIVEL_NUM(data.cabeceoNivel), NIVEL_NUM(data.quiteNivel), NIVEL_NUM(data.proteccionNivel)]);
  const tactico      = PROM_G([NIVEL_NUM(data.posicionNivel), NIVEL_NUM(data.visionNivel), NIVEL_NUM(data.defensaNivel), NIVEL_NUM(data.amplitudNivel), NIVEL_NUM(data.transicionNivel), NIVEL_NUM(data.superioridadNivel), NIVEL_NUM(data.basculacionNivel)]);
  const mental       = PROM_G([NIVEL_NUM(data.trabajoNivel), NIVEL_NUM(data.disciplinaNivel), NIVEL_NUM(data.actitudNivel)]);
  const comportamiento = PROM_G([COMP_NUM(data.responsabilidad), COMP_NUM(data.puntualidad), COMP_NUM(data.disciplinaComp), COMP_NUM(data.respeto), COMP_NUM(data.tolerancia), COMP_NUM(data.companerismo), COMP_NUM(data.liderazgo), COMP_NUM(data.trabajoEquipoComp), COMP_NUM(data.sentidoPertenencia)]);
  const overall      = PROM_G([fisico, tecnico, tactico, mental, comportamiento]);
  const overallNum   = Math.round(overall * 20);
  const rankColor    = overallNum >= 85 ? '#a78bfa' : overallNum >= 75 ? '#00d4ff' : overallNum >= 65 ? '#22c55e' : overallNum >= 50 ? '#eab308' : '#f97316';
  const rankLabel    = overallNum >= 85 ? 'DIAMANTE' : overallNum >= 75 ? 'PLATINO' : overallNum >= 65 ? 'ORO' : overallNum >= 50 ? 'PLATA' : 'BRONCE';
  const iniciales    = (data.nombre || 'FA').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#060d18', overflowY: 'auto', fontFamily: 'Arial, sans-serif' }}>

      {/* Barra superior */}
      <div className="print:hidden" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #1e3a4a', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #1e3a4a', background: '#0d1f2e', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>← Volver</button>
        <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 800, fontSize: 14 }}>Vista Deportista · {data.nombre || '—'}</span>
        <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
          🖨️ Imprimir / PDF
        </button>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 50px' }}>

        {/* ── HERO CARD ── */}
        <div style={{ borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #0d2b1a 0%, #051a2e 55%, #0d1f2e 100%)', border: '1px solid #1e3a4a', marginBottom: 14 }}>
          <div style={{ padding: '20px 20px 18px', display: 'flex', gap: 16 }}>
            {/* Foto */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ width: 90, height: 114, borderRadius: 12, overflow: 'hidden', border: '2px solid #00d48840', background: 'linear-gradient(135deg, #0d4a2b, #051a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,212,136,0.2)' }}>
                {data.foto
                  ? <img src={data.foto} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                  : <span style={{ color: '#00d488', fontSize: 30, fontWeight: 900 }}>{iniciales}</span>}
              </div>
              <div style={{ marginTop: 5, textAlign: 'center', background: '#00d48820', border: '1px solid #00d48840', borderRadius: 5, padding: '2px 4px' }}>
                <span style={{ color: '#00d488', fontSize: 8, fontWeight: 900, letterSpacing: 0.5 }}>{data.posicion || '—'}</span>
              </div>
            </div>

            {/* Info principal */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, color: '#475569', fontWeight: 700, letterSpacing: 2, marginBottom: 3 }}>
                {data.fecha} · INFORME #{data.numeroInforme || '—'}
              </div>
              <div style={{ fontSize: 17, color: '#f1f5f9', fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 8, textTransform: 'uppercase' }}>
                {data.nombre || 'DEPORTISTA'}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                {data.proyecto && <span style={{ background: '#16a34a22', border: '1px solid #16a34a44', color: '#4ade80', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>{data.proyecto}</span>}
                {data.programa && <span style={{ background: '#0ea5e922', border: '1px solid #0ea5e944', color: '#38bdf8', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>{data.programa}</span>}
                {data.perfil   && <span style={{ background: '#8b5cf622', border: '1px solid #8b5cf644', color: '#c4b5fd', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>{data.perfil}</span>}
              </div>
              {/* Overall */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 54, height: 54, borderRadius: 10, background: `linear-gradient(135deg, ${rankColor}22, ${rankColor}44)`, border: `2px solid ${rankColor}66`, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 16px ${rankColor}44` }}>
                  <span style={{ color: rankColor, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{overallNum > 0 ? overallNum : '—'}</span>
                  <span style={{ color: rankColor, fontSize: 7, fontWeight: 800 }}>OVR</span>
                </div>
                <div>
                  <div style={{ color: rankColor, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{rankLabel}</div>
                  <div style={{ color: '#475569', fontSize: 9, marginBottom: 3 }}>Valoración global</div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(star => <span key={star} style={{ fontSize: 11, color: star <= Math.round(overall) ? '#fbbf24' : '#1e3a4a' }}>★</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Escudo */}
            <div style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
              <img src="/ESCUDO%20F.A%202020.png" alt="FA" style={{ width: 46, height: 46, objectFit: 'contain', opacity: 0.85 }} />
            </div>
          </div>
        </div>

        {/* ── RADAR ── */}
        <div style={{ background: '#0d1f2e', borderRadius: 16, border: '1px solid #1e3a4a', padding: '14px', marginBottom: 14, textAlign: 'center' }}>
          <div style={{ color: '#475569', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 4 }}>
            Radar de Habilidades
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadarGrafico
              scores={[fisico, tecnico, tactico, comportamiento, mental]}
              labels={['FÍSICO', 'TÉCNICA', 'TÁCTICA', 'COMPORT.', 'MENTAL']}
            />
          </div>
        </div>

        {/* ── SECCIONES COLAPSABLES ── */}
        <div style={{ color: '#475569', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
          Detalle por Categorías
        </div>

        <SeccionJuego icono="💪" titulo="Físico" score={fisico} defaultOpen={true}>
          <div style={{ paddingTop: 10 }}>
            <BarraHabilidad label="Fuerza — Potencia y Duelo" nivel={data.fuerzaNivel} />
            <BarraHabilidad label="Velocidad — Reacción y Desplazamiento" nivel={data.velocidadNivel} />
            <BarraHabilidad label="Resistencia — Capacidad Aeróbica" nivel={data.resistenciaNivel} />
          </div>
        </SeccionJuego>

        <SeccionJuego icono="⚽" titulo="Técnica" score={tecnico}>
          <div style={{ paddingTop: 10 }}>
            <BarraHabilidad label="Control" nivel={data.controlNivel} />
            <BarraHabilidad label="Pase" nivel={data.paseNivel} />
            <BarraHabilidad label="Conducción" nivel={data.conductaNivel} />
            <BarraHabilidad label="Dribling" nivel={data.driblingNivel} />
            <BarraHabilidad label="Remate" nivel={data.remataNivel} />
            <BarraHabilidad label="Cabeceo" nivel={data.cabeceoNivel} />
            <BarraHabilidad label="Quite del Balón" nivel={data.quiteNivel} />
            <BarraHabilidad label="Protección del Balón" nivel={data.proteccionNivel} />
          </div>
        </SeccionJuego>

        <SeccionJuego icono="🧠" titulo="Táctica" score={tactico}>
          <div style={{ paddingTop: 10 }}>
            <BarraHabilidad label="Ubicación Espacial" nivel={data.posicionNivel} />
            <BarraHabilidad label="Velocidad de Procesamiento" nivel={data.visionNivel} />
            <BarraHabilidad label="Lectura de Alturas y Espacios" nivel={data.defensaNivel} />
            <BarraHabilidad label="Amplitud y Profundidad" nivel={data.amplitudNivel} />
            <BarraHabilidad label="Transiciones (Ataque-Defensa)" nivel={data.transicionNivel} />
            <BarraHabilidad label="Superioridad Numérica 2vs1" nivel={data.superioridadNivel} />
            <BarraHabilidad label="Basculación y Coberturas" nivel={data.basculacionNivel} />
          </div>
        </SeccionJuego>

        <SeccionJuego icono="❤️" titulo="Mental y Actitudinal" score={mental}>
          <div style={{ paddingTop: 10 }}>
            <BarraHabilidad label="Trabajo en Equipo" nivel={data.trabajoNivel} />
            <BarraHabilidad label="Gestión de la Frustración" nivel={data.disciplinaNivel} />
            <BarraHabilidad label="Comunicación Asertiva" nivel={data.actitudNivel} />
          </div>
        </SeccionJuego>

        <SeccionJuego icono="⭐" titulo="Comportamiento" score={comportamiento}>
          <div style={{ paddingTop: 10 }}>
            {([
              ['Responsabilidad', data.responsabilidad],
              ['Puntualidad',     data.puntualidad],
              ['Disciplina',      data.disciplinaComp],
              ['Respeto',         data.respeto],
              ['Tolerancia',      data.tolerancia],
              ['Compañerismo',    data.companerismo],
              ['Liderazgo',       data.liderazgo],
              ['Trabajo en Equipo', data.trabajoEquipoComp],
              ['Sentido de Pertenencia', data.sentidoPertenencia],
            ] as [string, string][]).map(([lbl, val]) => {
              const cv = ({ 'SIEMPRE': 5, 'CASI SIEMPRE': 4, 'ALGUNAS VECES': 3, 'CASI NUNCA': 2, 'NUNCA': 1 } as Record<string, number>)[val] ?? 0;
              const color = LVL_COLOR[cv] || '#555';
              return (
                <div key={lbl} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{lbl}</span>
                    <span style={{ fontSize: 9, color, fontWeight: 900, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 5px' }}>{val || '—'}</span>
                  </div>
                  <div style={{ background: '#0f2235', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(cv / 5) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}66, ${color})`, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SeccionJuego>

        {/* ── LOGROS Y RETOS DE TU PROYECTO DEPORTIVO (un solo cuadro) ── */}
        {(data.logrosTrimestre || data.objetivosTrimestre) && (
          <div style={{ background: '#0d2b1a', border: '1px solid #16a34a33', borderRadius: 12, padding: '14px 16px', marginBottom: 10, marginTop: 8 }}>
            <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>🏆 LOGROS Y RETOS PERSONALES</div>
            {data.logrosTrimestre && <p style={{ color: '#d1fae5', fontSize: 12, lineHeight: 1.7, margin: '0 0 8px' }}><b style={{ color: '#4ade80' }}>Logros: </b>{data.logrosTrimestre}</p>}
            {data.objetivosTrimestre && <p style={{ color: '#e0f2fe', fontSize: 12, lineHeight: 1.7, margin: 0 }}><b style={{ color: '#38bdf8' }}>Retos: </b>{data.objetivosTrimestre}</p>}
          </div>
        )}
        {data.equipoTrimestre && (
          <div style={{ background: '#241a2e', border: '1px solid #8b5cf644', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>🤝 LOGROS Y RETOS DEL EQUIPO</div>
            <p style={{ color: '#ede9fe', fontSize: 12, lineHeight: 1.7, margin: 0 }}>{data.equipoTrimestre}</p>
          </div>
        )}
        {data.observaciones && (
          <div style={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>📝 OBSERVACIONES DEL ENTRENADOR</div>
            <p style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.7, margin: 0 }}>{data.observaciones}</p>
          </div>
        )}

        {/* ── PIE ── */}
        <div style={{ background: '#0d1f2e', borderRadius: 12, border: '1px solid #1e3a4a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <img src="/ESCUDO%20F.A%202020.png" alt="FA" style={{ width: 34, height: 34, objectFit: 'contain', opacity: 0.8 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#4ade80', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>FUTURO ANTIOQUIA · MAX 10 SPORT</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>
              Entrenador: {nombreEntrenador || '—'} · Directivo: STEVEN MARULANDA GRISALES
            </div>
          </div>
          <div style={{ color: '#475569', fontSize: 9, textAlign: 'right' as const }}>{data.fecha}</div>
        </div>

      </div>

      <style>{`
        @media print {
          body { background: #060d18 !important; }
          .print\\:hidden { display: none !important; }
          @page { margin: 6mm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Bloque de aspecto: definido FUERA del componente principal ── */
interface BloqueProps {
  titulo: string; subtitulo: string;
  nivel: string; onNivel: (v: string) => void;
  desc: string; onDesc: (v: string) => void;
  descripciones?: Record<string, string>;
  definicion?: string;
  showError?: boolean;
}
function BloqueAspecto({ titulo, subtitulo, nivel, onNivel, desc, onDesc, descripciones, definicion, showError }: BloqueProps) {
  const hayError = showError && !nivel;
  return (
    <tbody style={{ breakInside: 'avoid', pageBreakInside: 'avoid' } as React.CSSProperties}>
      <tr>
        <td colSpan={4} style={{ background: hayError ? '#fff5f5' : '#fff', color: hayError ? '#ef4444' : '#16a34a', textAlign: 'center', fontWeight: 900, fontSize: 13, padding: '5px 8px', letterSpacing: 1, borderLeft: hayError ? '3px solid #ef4444' : 'none' }}>
          {titulo}{hayError && ' ⚠'}
          {definicion ? <div style={{ color: '#6b7280', fontWeight: 500, fontSize: 10, letterSpacing: 0, marginTop: 2, textTransform: 'none' }}>{definicion}</div> : null}
        </td>
      </tr>
      <tr>
        <td colSpan={2} style={{ background: hayError ? '#dc2626' : C.grisAzul, color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px', textTransform: 'uppercase' }}>
          ({subtitulo})
        </td>
        <td colSpan={2} style={{ background: hayError ? '#dc2626' : C.grisAzul, color: '#fff', padding: '2px 8px' }}>
          <select value={nivel} onChange={e => {
            const v = e.target.value;
            onNivel(v);
            if (v === 'No Aplica') onDesc('No aplica — no evaluado en este periodo.');
            else if (descripciones && v && descripciones[v]) onDesc(descripciones[v]);
          }}
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            {NIVELES.map(o => <option key={o} value={o} style={{ color: '#000', background: '#fff' }}>{o || '— Seleccionar —'}</option>)}
            <option value="No Aplica" style={{ color: '#000', background: '#fff' }}>No Aplica</option>
          </select>
        </td>
      </tr>
      <tr>
        <td colSpan={4} style={{ background: C.grisClaro, padding: '6px 10px' }}>
          <textarea value={desc} onChange={e => onDesc(e.target.value)}
            rows={2} placeholder="Selecciona un nivel para ver la descripción..."
            readOnly
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333', cursor: 'default' }} />
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
function ValoracionPageInner() {
  const router  = useRouter();
  const searchParams = useSearchParams();
  const codParam = searchParams.get('cod');
  const fotoRef = useRef<HTMLInputElement>(null);
  const [data,        setData]        = useState<Valoracion>(INICIAL);
  const [guardando,   setGuardando]   = useState(false);
  const [guardado,    setGuardado]    = useState(false);
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [encontrado,  setEncontrado]  = useState('');
  const [historial,   setHistorial]   = useState<Evaluacion[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [nombreEntrenador, setNombreEntrenador] = useState('');
  const [profes, setProfes] = useState<Profe[]>([]);
  const [intentoDescarga,  setIntentoDescarga]  = useState(false);
  const [vistaGamificada, setVistaGamificada] = useState(false);
  const [textosVal, setTextosVal] = useState<Record<string, Record<string, string>>>({});
  const [metaVal, setMetaVal] = useState<Record<string, FundMetaEdit>>({});
  const err = (campo: keyof Valoracion) => intentoDescarga && !data[campo]?.trim();
  // Los calidosos (padres) aún NO tienen acceso a valoraciones
  useEffect(() => {
    if (typeof document !== 'undefined' && /futuro-session=deportista/.test(document.cookie)) {
      router.replace('/alumnos');
    }
  }, [router]);

  const codParamAplicado = useRef(false);   // aplicar ?cod= una sola vez
  const autoCargadoCod   = useRef('');       // código cuya última evaluación ya se auto-cargó
  const textosManual     = useRef(false);    // el profe editó a mano logros/objetivos → no auto-generar
  useEffect(() => {
    try {
      const raw = localStorage.getItem('futuro-profe-nombre');
      if (raw) setNombreEntrenador(JSON.parse(raw) as string);
    } catch {}
  }, []);

  useEffect(() => {
    getDeportistas().then(setDeportistas);
    getProfes().then(setProfes);
    getDescripcionesValoracion().then(setTextosVal).catch(() => {});
    getMetaValoracion().then(setMetaVal).catch(() => {});
  }, []);

  useEffect(() => {
    const cod = data.codigo.trim().toUpperCase();
    if (cod.length >= 2) {
      getEvaluaciones(cod).then(setHistorial);
    } else {
      setHistorial([]);
    }
  }, [data.codigo]);

  // Si se llega con ?cod= desde la ficha del deportista, precargar el código (una sola vez)
  useEffect(() => {
    if (codParamAplicado.current) return;
    const cod = (codParam ?? '').trim().toUpperCase();
    if (!cod) return;
    codParamAplicado.current = true;
    setData(p => ({ ...p, codigo: cod }));
  }, [codParam]);

  // Auto-cargar la ÚLTIMA evaluación guardada del deportista para que NO aparezca en blanco.
  // saveEvaluacion siempre inserta, así que editar y guardar crea un nuevo informe (el historial se conserva).
  // La numeración de la valoración es automática: = cantidad de valoraciones ya guardadas del deportista.
  useEffect(() => {
    const cod = data.codigo.trim().toUpperCase();
    if (cod.length < 2) return;
    if (autoCargadoCod.current === cod) return;   // ya cargamos este código; no pisar ediciones
    if (historial.length > 0) {
      autoCargadoCod.current = cod;
      textosManual.current = true;   // respetar los logros/objetivos ya guardados
      const { id, ...resto } = historial[0];
      const infoGuardado = String((resto as any).numeroInforme ?? '').trim();
      setData(prev => ({ ...prev, ...resto, numeroInforme: infoGuardado || String(Math.min(historial.length, 4)) }));
    } else {
      // Sin valoraciones previas → la próxima será la #1
      setData(prev => ({ ...prev, numeroInforme: prev.numeroInforme || '1' }));
    }
  }, [historial, data.codigo]);

  // Buscar deportista cuando cambia el código O cuando cargan los deportistas
  useEffect(() => {
    if (deportistas.length === 0) return;
    const cod = data.codigo.trim().toUpperCase();
    if (cod.length < 2) return;
    const dep = deportistas.find(d =>
      Object.entries(d._columnas ?? {}).some(([key, val]) =>
        /^c[oó]d/i.test(key.trim()) && String(val).trim().toUpperCase() === cod
      )
    );
    if (dep) {
      const proyecto = buscarCampo(dep, /^proy/i);
      const programa = buscarCampo(dep, /^program/i) || buscarCampo(dep, /^categ/i) || buscarCampo(dep, /^sub/i);
      const posicion = buscarCampo(dep, /^posici[oó]n/i) || buscarCampo(dep, /^pos$/i);
      const fechaNac = construirFechaNac(dep);
      setData(p => ({
        ...p,
        nombre: dep._nombre ?? p.nombre,
        proyecto: proyecto || p.proyecto,
        programa: programa || p.programa,
        fechaNac: fechaNac || p.fechaNac,
        ...(posicion ? { posicion } : {}),
      }));
      // Buscar entrenador según el proyecto del deportista
      if (proyecto && profes.length > 0) {
        const profe = profes.find(p =>
          p.proyectos.some(pr => pr.trim().toUpperCase() === proyecto.trim().toUpperCase())
        );
        if (profe) setNombreEntrenador((profe.nombre && profe.nombre.trim()) ? profe.nombre.trim() : profe.usuario);
      }
      setEncontrado(dep._nombre ?? '');
      setTimeout(() => setEncontrado(''), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.codigo, deportistas]);

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

  // Lista de campos que faltan por llenar. Como existe "No Aplica", todo se puede completar.
  const camposFaltantes = (): string[] => {
    const f: string[] = [];
    if (!data.codigo.trim())        f.push('Código');
    if (!data.nombre.trim())        f.push('Nombre');
    if (!data.programa.trim())      f.push('Programa');
    if (!data.proyecto.trim())      f.push('Proyecto');
    if (!data.fecha.trim())         f.push('Fecha Informe');
    if (!data.posicion.trim())      f.push('Posición');
    if (!data.perfil.trim())        f.push('Perfil');
    if (!data.fuerzaNivel)      f.push('Fuerza');
    if (!data.velocidadNivel)   f.push('Velocidad');
    if (!data.resistenciaNivel) f.push('Resistencia');
    if (!data.controlNivel)    f.push('Control');
    if (!data.paseNivel)       f.push('Pase');
    if (!data.conductaNivel)   f.push('Conducción');
    if (!data.driblingNivel)   f.push('Dribling');
    if (!data.remataNivel)     f.push('Remate');
    if (!data.cabeceoNivel)    f.push('Cabeceo');
    if (!data.quiteNivel)      f.push('Quite del Balón');
    if (!data.proteccionNivel) f.push('Protección del Balón');
    if (!data.posicionNivel)    f.push('Ubicación Espacial');
    if (!data.visionNivel)      f.push('Velocidad de Procesamiento');
    if (!data.defensaNivel)     f.push('Lectura de Alturas');
    if (!data.amplitudNivel)    f.push('Amplitud y Profundidad');
    if (!data.transicionNivel)  f.push('Transiciones');
    if (!data.superioridadNivel)f.push('Superioridad Numérica');
    if (!data.basculacionNivel) f.push('Basculación y Coberturas');
    if (!data.trabajoNivel)    f.push('Trabajo en Equipo (Mental)');
    if (!data.disciplinaNivel) f.push('Gestión de la Frustración');
    if (!data.actitudNivel)    f.push('Comunicación Asertiva');
    if (!data.identidadNivel)   f.push('Identidad y Estilo');
    if (!data.bloqueNivel)      f.push('Bloque y Cohesión');
    if (!data.climaNivel)       f.push('Clima Interno');
    if (!data.gestionCompNivel) f.push('Gestión de Competición');
    if (!data.responsabilidad)    f.push('Responsabilidad');
    if (!data.puntualidad)        f.push('Puntualidad');
    if (!data.disciplinaComp)     f.push('Disciplina');
    if (!data.respeto)            f.push('Respeto');
    if (!data.tolerancia)         f.push('Tolerancia');
    if (!data.companerismo)       f.push('Compañerismo');
    if (!data.liderazgo)          f.push('Liderazgo');
    if (!data.trabajoEquipoComp)  f.push('Trabajo en Equipo (Comport.)');
    if (!data.sentidoPertenencia) f.push('Sentido de Pertenencia');
    if (!data.logrosTrimestre.trim())    f.push('Logros del Trimestre');
    if (!data.objetivosTrimestre.trim()) f.push('Objetivos del Trimestre');
    return f;
  };

  const guardar = async () => {
    if (!data.codigo.trim()) { alert('Ingresa el código del deportista antes de guardar.'); return; }
    setIntentoDescarga(true);   // resalta en rojo los campos vacíos
    const faltan = camposFaltantes();
    if (faltan.length > 0) {
      alert(`No se puede guardar: faltan campos por completar.\nUsa "No Aplica" en los que no evaluaste.\n\n• ${faltan.join('\n• ')}`);
      return;
    }
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

  // Volver a la FICHA del deportista (no al listado de proyectos), para poder ver sus otras secciones.
  const volverAlDeportista = () => {
    const cod = data.codigo.trim().toUpperCase();
    const dep = deportistas.find(d =>
      Object.entries(d._columnas ?? {}).some(([k, v]) =>
        /^c[oó]d/i.test(k.trim()) && String(v).trim().toUpperCase() === cod
      )
    );
    if (dep?.id) router.push(`/alumnos/${dep.id}`);
    else router.back();
  };

  // Inicia una NUEVA valoración conservando la identidad del deportista y numerándola automáticamente.
  const nuevaValoracion = () => {
    if (historial.length > 0 && !confirm('¿Crear una NUEVA valoración en blanco para este deportista? Las anteriores quedan guardadas en el historial.')) return;
    textosManual.current = false;   // permitir auto-generar en la nueva
    setData(p => ({
      ...INICIAL,
      fecha: new Date().toLocaleDateString('es-CO'),
      codigo: p.codigo, nombre: p.nombre, fechaNac: p.fechaNac,
      programa: p.programa, proyecto: p.proyecto, perfil: p.perfil, posicion: p.posicion,
      foto: p.foto,
      numeroInforme: String(Math.min(historial.length + 1, 4)),
    }));
  };

  // Genera automáticamente Logros (lo bueno) y Objetivos (motivar a mejorar lo bajo) según los niveles.
  const generarTextos = () => {
    const esNA = (s: string) => (s ?? '').trim().toUpperCase() === 'NO APLICA';
    const nvl = (s: string) => { if (esNA(s)) return -1; const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
    const cmp = (s: string) => { if (esNA(s)) return -1; return ({ 'SIEMPRE': 5, 'CASI SIEMPRE': 4, 'ALGUNAS VECES': 3, 'CASI NUNCA': 2, 'NUNCA': 1 } as Record<string, number>)[s] ?? 0; };
    const items: { label: string; n: number }[] = [
      { label: 'la fuerza',                 n: nvl(data.fuerzaNivel) },
      { label: 'la velocidad',              n: nvl(data.velocidadNivel) },
      { label: 'la resistencia',            n: nvl(data.resistenciaNivel) },
      { label: 'el control del balón',      n: nvl(data.controlNivel) },
      { label: 'el pase',                   n: nvl(data.paseNivel) },
      { label: 'la conducción',             n: nvl(data.conductaNivel) },
      { label: 'el dribling',               n: nvl(data.driblingNivel) },
      { label: 'el remate',                 n: nvl(data.remataNivel) },
      { label: 'el cabeceo',                n: nvl(data.cabeceoNivel) },
      { label: 'el quite del balón',        n: nvl(data.quiteNivel) },
      { label: 'la protección del balón',   n: nvl(data.proteccionNivel) },
      { label: 'la ubicación en el campo',  n: nvl(data.posicionNivel) },
      { label: 'la toma de decisiones',     n: nvl(data.visionNivel) },
      { label: 'la lectura de espacios',    n: nvl(data.defensaNivel) },
      { label: 'la amplitud y profundidad', n: nvl(data.amplitudNivel) },
      { label: 'las transiciones',          n: nvl(data.transicionNivel) },
      { label: 'el juego en superioridad',  n: nvl(data.superioridadNivel) },
      { label: 'las coberturas',            n: nvl(data.basculacionNivel) },
      { label: 'el trabajo en equipo',      n: nvl(data.trabajoNivel) },
      { label: 'el manejo de la frustración', n: nvl(data.disciplinaNivel) },
      { label: 'la comunicación',           n: nvl(data.actitudNivel) },
      { label: 'la identidad de juego',     n: nvl(data.identidadNivel) },
      { label: 'la cohesión con el equipo', n: nvl(data.bloqueNivel) },
      { label: 'el buen ambiente en el grupo', n: nvl(data.climaNivel) },
      { label: 'la actitud en competencia', n: nvl(data.gestionCompNivel) },
      { label: 'la responsabilidad',        n: cmp(data.responsabilidad) },
      { label: 'la puntualidad',            n: cmp(data.puntualidad) },
      { label: 'la disciplina',             n: cmp(data.disciplinaComp) },
      { label: 'el respeto',                n: cmp(data.respeto) },
      { label: 'la tolerancia',             n: cmp(data.tolerancia) },
      { label: 'el compañerismo',           n: cmp(data.companerismo) },
      { label: 'el liderazgo',              n: cmp(data.liderazgo) },
      { label: 'el sentido de pertenencia', n: cmp(data.sentidoPertenencia) },
    ];
    const dedup = (arr: string[]) => Array.from(new Set(arr));
    const fuertes = dedup(items.filter(i => i.n >= 4).map(i => i.label));
    const debiles = dedup(items.filter(i => i.n >= 1 && i.n <= 2).map(i => i.label));
    const nom = (data.nombre.trim().split(/\s+/)[0] || 'El deportista');
    const nombre = nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase();
    const listar = (arr: string[], max: number) => {
      const a = arr.slice(0, max);
      if (a.length === 0) return '';
      if (a.length === 1) return a[0];
      return a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
    };

    // Textos individuales SIMPLIFICADOS y de longitud pareja (máx. 3 aspectos)
    const logros = fuertes.length
      ? `${nombre} se destacó en ${listar(fuertes, 3)}, con buen compromiso y actitud en el trimestre.`
      : `${nombre} mostró compromiso, buena disposición y actitud en los entrenamientos del trimestre.`;

    const objetivos = debiles.length
      ? `El reto para el próximo periodo es mejorar ${listar(debiles, 3)}. ¡Con constancia lo lograrás, ${nombre}!`
      : `El reto para el próximo periodo es mantener el nivel y seguir creciendo cada día. ¡Vamos, ${nombre}!`;

    // Texto del EQUIPO — a partir de los 4 fundamentos colectivos
    const eqItems = [
      { label: 'la identidad de juego',          n: nvl(data.identidadNivel) },
      { label: 'la cohesión del bloque',         n: nvl(data.bloqueNivel) },
      { label: 'el clima interno del grupo',     n: nvl(data.climaNivel) },
      { label: 'la gestión de la competición',   n: nvl(data.gestionCompNivel) },
    ];
    const eqFuertes = dedup(eqItems.filter(i => i.n >= 4).map(i => i.label));
    const eqDebiles = dedup(eqItems.filter(i => i.n >= 1 && i.n <= 2).map(i => i.label));
    const eqLogro = eqFuertes.length
      ? `Como equipo, se destaca en ${listar(eqFuertes, 4)}.`
      : `El equipo avanza en su consolidación colectiva.`;
    const eqReto = eqDebiles.length
      ? `El reto grupal es fortalecer ${listar(eqDebiles, 4)}.`
      : `El reto grupal es sostener el buen funcionamiento colectivo.`;

    set('logrosTrimestre', logros);
    set('objetivosTrimestre', objetivos);
    set('equipoTrimestre', `${eqLogro} ${eqReto}`);
  };

  // Cuando se completa el ÚLTIMO campo de evaluación, se generan solos los Logros y Objetivos.
  const camposEvaluacion = [
    data.fuerzaNivel, data.velocidadNivel, data.resistenciaNivel,
    data.controlNivel, data.paseNivel, data.conductaNivel, data.driblingNivel, data.remataNivel,
    data.cabeceoNivel, data.quiteNivel, data.proteccionNivel,
    data.posicionNivel, data.visionNivel, data.defensaNivel, data.amplitudNivel, data.transicionNivel,
    data.superioridadNivel, data.basculacionNivel,
    data.trabajoNivel, data.disciplinaNivel, data.actitudNivel, data.identidadNivel,
    data.bloqueNivel, data.climaNivel, data.gestionCompNivel,
    data.responsabilidad, data.puntualidad, data.disciplinaComp, data.respeto, data.tolerancia,
    data.companerismo, data.liderazgo, data.trabajoEquipoComp, data.sentidoPertenencia,
  ];
  const evaluacionCompleta = camposEvaluacion.every(v => !!v);
  const evaluacionKey = camposEvaluacion.join('|');
  useEffect(() => {
    if (textosManual.current) return;
    if (evaluacionCompleta) generarTextos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluacionKey]);

  // Rellena SOLO el texto del equipo si está vacío (para valoraciones ya guardadas sin ese campo).
  const colectivosListos = !!(data.identidadNivel && data.bloqueNivel && data.climaNivel && data.gestionCompNivel);
  useEffect(() => {
    if (data.equipoTrimestre.trim() || !colectivosListos) return;
    const nvl = (s: string) => { if ((s ?? '').trim().toUpperCase() === 'NO APLICA') return -1; const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
    const dedup = (arr: string[]) => Array.from(new Set(arr));
    const listar = (a: string[]) => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
    const it = [
      { label: 'la identidad de juego',        n: nvl(data.identidadNivel) },
      { label: 'la cohesión del bloque',       n: nvl(data.bloqueNivel) },
      { label: 'el clima interno del grupo',   n: nvl(data.climaNivel) },
      { label: 'la gestión de la competición', n: nvl(data.gestionCompNivel) },
    ];
    const f = dedup(it.filter(i => i.n >= 4).map(i => i.label));
    const d = dedup(it.filter(i => i.n >= 1 && i.n <= 2).map(i => i.label));
    const lo = f.length ? `Como equipo, se destaca en ${listar(f)}.` : 'El equipo avanza en su consolidación colectiva.';
    const re = d.length ? `El reto grupal es fortalecer ${listar(d)}.` : 'El reto grupal es sostener el buen funcionamiento colectivo.';
    set('equipoTrimestre', `${lo} ${re}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colectivosListos, data.equipoTrimestre, data.identidadNivel, data.bloqueNivel, data.climaNivel, data.gestionCompNivel]);

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

  const celda = (bg: string, color: string, content: React.ReactNode, extra?: React.CSSProperties & { colSpan?: number }) => {
    const { colSpan, ...styleProps } = (extra ?? {}) as any;
    return <td colSpan={colSpan} style={{ background: bg, color, padding: '3px 8px', fontSize: 11, fontWeight: 700, ...styleProps }}>{content}</td>;
  };

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}>
      {vistaGamificada && (
        <VistaPadres data={data} nombreEntrenador={nombreEntrenador} onClose={() => setVistaGamificada(false)} />
      )}

      {/* Barra herramientas */}
      <div className="print:hidden" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={volverAlDeportista} style={{ color: '#6b7280', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Volver al deportista</button>
        <span style={{ fontWeight: 800, color: '#111', flex: 1, fontSize: 15 }}>Valoración del Deportista</span>
        {historial.length > 0 && (
          <button onClick={() => setVerHistorial(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <History size={13} /> Historial ({historial.length})
          </button>
        )}
        <button onClick={nuevaValoracion} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#ecfdf5', color: '#166534', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          ＋ Nueva valoración
        </button>
        <button onClick={limpiar} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <RefreshCw size={13} /> Limpiar
        </button>
        <button onClick={() => { textosManual.current = false; generarTextos(); }} title="Rellena Logros, Retos y Logros y Retos del Equipo según la valoración"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#ecfdf5', color: '#166534', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <RefreshCw size={13} /> Regenerar textos
        </button>
        <button onClick={guardar} disabled={guardando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: C.verde, color: '#fff', cursor: guardando ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, opacity: guardando ? 0.7 : 1 }}>
          <Save size={13} /> {guardado ? '¡Guardado!' : guardando ? 'Guardando...' : 'Guardar'}
        </button>
        <button onClick={() => {
          setIntentoDescarga(true);
          const camposVacios = camposFaltantes();
          if (camposVacios.length > 0) {
            alert(`Completa los siguientes campos antes de descargar:\n\n• ${camposVacios.join('\n• ')}`);
            return;
          }
          const codigo  = data.codigo.trim();
          const nombre  = data.nombre.trim().replace(/\s+/g, '-');
          const informe = data.numeroInforme.trim();
          const titulo  = `${codigo}_${nombre}_Informe-${informe}`;
          const prev    = document.title;
          document.title = titulo;
          window.print();
          setTimeout(() => { document.title = prev; }, 1000);
        }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: C.naranja, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Download size={13} /> Descargar
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

          {/* ── ENCABEZADO ── */}
          <tbody>
            <tr>
              <td colSpan={4} style={{ padding: 0 }}>
                {/* Título - verde degradado */}
                <div style={{ background: VERDE_GRAD, display: 'flex', alignItems: 'center', padding: '7px 14px', gap: 10, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                  {/* Logo Max10 izquierda */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <img src="/MAX%2010.png" alt="Max10 Sport" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
                    <span style={{ color: '#fff', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Conecta, Gestiona, Gana</span>
                  </div>
                  {/* Título derecha */}
                  <div style={{ flex: 1, textAlign: 'right', color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Valoración Integral del Deportista
                  </div>
                </div>
                {/* Hero - fondo blanco */}
                <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Foto proporcional */}
                  <div style={{ flexShrink: 0 }}>
                    <input ref={fotoRef} type="file" accept="image/*" onChange={onFoto} style={{ display: 'none' }} />
                    <div onClick={() => fotoRef.current?.click()}
                      style={{ width: 90, height: 118, borderRadius: 8, overflow: 'hidden', background: VERDE_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                      {data.foto
                        ? <img src={data.foto} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                        : <span style={{ color: '#fff', fontWeight: 900, fontSize: 30, lineHeight: 1 }}>
                            {data.nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FA'}
                          </span>
                      }
                    </div>
                  </div>
                  {/* Nombre + filas */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input value={data.nombre} onChange={e => set('nombre', e.target.value)}
                      placeholder="NOMBRE DEL DEPORTISTA"
                      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: `2px solid ${err('nombre') ? '#ef4444' : '#e5e7eb'}`, outline: 'none', color: '#111', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Arial, sans-serif', padding: '0 0 4px 0', marginBottom: 10 }} />
                    {encontrado && (
                      <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dcfce7', borderRadius: 5, padding: '2px 6px', fontSize: 9, color: '#16a34a', fontWeight: 700, marginBottom: 6, width: 'fit-content' }}>
                        <CheckCircle size={10} /> {encontrado}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {/* PROGRAMA */}
                      {(['PROGRAMA', 'PROYECTO'] as const).map(lbl => {
                        const field = lbl === 'PROGRAMA' ? 'programa' : 'proyecto';
                        return (
                          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>{lbl}</span>
                            <input value={data[field as keyof Valoracion]} onChange={e => set(field as keyof Valoracion, e.target.value)} placeholder="Auto-cargado del perfil"
                              style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${err(field as keyof Valoracion) ? '#ef4444' : 'transparent'}`, outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, fontFamily: 'Arial, sans-serif', flex: 1, padding: 0 }} />
                          </div>
                        );
                      })}
                      {/* FECHA INF. + POSICIÓN */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>FECHA INF.</span>
                          <input value={data.fecha} onChange={e => set('fecha', e.target.value)} placeholder="dd/mm/aaaa"
                            style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${err('fecha') ? '#ef4444' : 'transparent'}`, outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, fontFamily: 'Arial, sans-serif', width: 82, padding: 0 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>POSICIÓN</span>
                          <select value={data.posicion} onChange={e => set('posicion', e.target.value)}
                            style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${err('posicion') ? '#ef4444' : 'transparent'}`, outline: 'none', color: err('posicion') ? '#ef4444' : '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                            {POSICIONES.map(o => <option key={o} value={o}>{o || '— Seleccionar —'}</option>)}
                          </select>
                        </div>
                      </div>
                      {/* INFORME + PERFIL */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>INFORME</span>
                          <select value={data.numeroInforme} onChange={e => set('numeroInforme', e.target.value)}
                            style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${err('numeroInforme') ? '#ef4444' : 'transparent'}`, outline: 'none', color: '#222', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                            <option value="">—</option>
                            {[1, 2, 3, 4].map(n => <option key={n} value={String(n)}>Informe {n}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>PERFIL</span>
                          <select value={data.perfil} onChange={e => set('perfil', e.target.value)}
                            style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${err('perfil') ? '#ef4444' : 'transparent'}`, outline: 'none', color: err('perfil') ? '#ef4444' : '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                            {PERFILES.map(o => <option key={o} value={o}>{o || '— Seleccionar —'}</option>)}
                          </select>
                        </div>
                      </div>
                      {/* PERIODO EVALUADO (de mes a mes) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>PERIODO</span>
                        <select value={data.periodoDesde} onChange={e => set('periodoDesde', e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #cbd5e1', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                          <option value="">Mes inicial</option>
                          {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>a</span>
                        <select value={data.periodoHasta} onChange={e => set('periodoHasta', e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #cbd5e1', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                          <option value="">Mes final</option>
                          {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* LOGO + CÓDIGO - derecha */}
                  <div style={{ flexShrink: 0, textAlign: 'center', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <img src="/ESCUDO%20F.A%202020.png" alt="Futuro Antioquia" style={{ width: 72, height: 72, objectFit: 'contain' }} />
                    <div style={{ color: '#374151', fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>CÓDIGO</div>
                    <div style={{ background: VERDE_GRAD, borderRadius: 10, minWidth: 65, textAlign: 'center', padding: '8px 10px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', outline: err('codigo') ? '2px solid #ef4444' : 'none' } as React.CSSProperties}>
                      <input value={data.codigo} onChange={e => set('codigo', e.target.value)} placeholder="—"
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 900, fontSize: 20, width: 85, textAlign: 'center', fontFamily: 'Arial, sans-serif', padding: 0 }} />
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>

          {/* ASPECTOS CONDICIONALES */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'ASPECTOS CONDICIONALES', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo={metaVal.fuerza?.titulo ?? "FUERZA"} subtitulo={metaVal.fuerza?.subtitulo ?? "Potencia y Duelo"} definicion={metaVal.fuerza?.definicion}
            nivel={data.fuerzaNivel} onNivel={v => set('fuerzaNivel', v)} showError={intentoDescarga}
            desc={data.fuerzaDesc}   onDesc={v => set('fuerzaDesc', v)}
            descripciones={textosVal.fuerza ?? DESC_FUERZA} />
          <BloqueAspecto titulo={metaVal.velocidad?.titulo ?? "VELOCIDAD"} subtitulo={metaVal.velocidad?.subtitulo ?? "Reacción y Desplazamiento"} definicion={metaVal.velocidad?.definicion}
            nivel={data.velocidadNivel} onNivel={v => set('velocidadNivel', v)} showError={intentoDescarga}
            desc={data.velocidadDesc}   onDesc={v => set('velocidadDesc', v)}
            descripciones={textosVal.velocidad ?? DESC_VELOCIDAD} />
          <BloqueAspecto titulo={metaVal.resistencia?.titulo ?? "RESISTENCIA"} subtitulo={metaVal.resistencia?.subtitulo ?? "Capacidad Aeróbica y Recuperación"} definicion={metaVal.resistencia?.definicion}
            nivel={data.resistenciaNivel} onNivel={v => set('resistenciaNivel', v)} showError={intentoDescarga}
            desc={data.resistenciaDesc}   onDesc={v => set('resistenciaDesc', v)}
            descripciones={textosVal.resistencia ?? DESC_RESISTENCIA} />

          {/* TÉCNICA */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'TÉCNICA (RELACIONAMIENTO CON EL BALÓN)', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '2px 8px', fontStyle: 'italic' }}>Evalúa la ejecución de los fundamentos básicos del juego</td></tr>
          </tbody>
          <BloqueAspecto titulo={metaVal.control?.titulo ?? "CONTROL"} subtitulo={metaVal.control?.subtitulo ?? "Recepción y Dominio del Balón"} definicion={metaVal.control?.definicion}
            nivel={data.controlNivel} onNivel={v => set('controlNivel', v)} showError={intentoDescarga}
            desc={data.controlDesc}   onDesc={v => set('controlDesc', v)}
            descripciones={textosVal.control ?? DESC_CONTROL} />
          <BloqueAspecto titulo={metaVal.pase?.titulo ?? "PASE"} subtitulo={metaVal.pase?.subtitulo ?? "Precisión e Intención en la Entrega"} definicion={metaVal.pase?.definicion}
            nivel={data.paseNivel} onNivel={v => set('paseNivel', v)} showError={intentoDescarga}
            desc={data.paseDesc}   onDesc={v => set('paseDesc', v)}
            descripciones={textosVal.pase ?? DESC_PASE} />
          <BloqueAspecto titulo={metaVal.conducta?.titulo ?? "CONDUCCIÓN"} subtitulo={metaVal.conducta?.subtitulo ?? "Desplazamiento con Balón"} definicion={metaVal.conducta?.definicion}
            nivel={data.conductaNivel} onNivel={v => set('conductaNivel', v)} showError={intentoDescarga}
            desc={data.conductaDesc}   onDesc={v => set('conductaDesc', v)}
            descripciones={textosVal.conducta ?? DESC_CONDUCCION} />
          <BloqueAspecto titulo={metaVal.dribling?.titulo ?? "DRIBLING"} subtitulo={metaVal.dribling?.subtitulo ?? "Superación del Rival en 1vs1"} definicion={metaVal.dribling?.definicion}
            nivel={data.driblingNivel} onNivel={v => set('driblingNivel', v)} showError={intentoDescarga}
            desc={data.driblingDesc}   onDesc={v => set('driblingDesc', v)}
            descripciones={textosVal.dribling ?? DESC_DRIBLING} />
          <BloqueAspecto titulo={metaVal.remata?.titulo ?? "REMATE"} subtitulo={metaVal.remata?.subtitulo ?? "Potencia y Definición"} definicion={metaVal.remata?.definicion}
            nivel={data.remataNivel} onNivel={v => set('remataNivel', v)} showError={intentoDescarga}
            desc={data.remataDesc}   onDesc={v => set('remataDesc', v)}
            descripciones={textosVal.remata ?? DESC_REMATE} />
          <BloqueAspecto titulo={metaVal.cabeceo?.titulo ?? "CABECEO"} subtitulo={metaVal.cabeceo?.subtitulo ?? "Juego Aéreo"} definicion={metaVal.cabeceo?.definicion}
            nivel={data.cabeceoNivel} onNivel={v => set('cabeceoNivel', v)} showError={intentoDescarga}
            desc={data.cabeceoDesc}   onDesc={v => set('cabeceoDesc', v)}
            descripciones={textosVal.cabeceo ?? {}} />
          <BloqueAspecto titulo={metaVal.quite?.titulo ?? "QUITE DEL BALÓN"} subtitulo={metaVal.quite?.subtitulo ?? "Recuperación Defensiva"} definicion={metaVal.quite?.definicion}
            nivel={data.quiteNivel} onNivel={v => set('quiteNivel', v)} showError={intentoDescarga}
            desc={data.quiteDesc}   onDesc={v => set('quiteDesc', v)}
            descripciones={textosVal.quite ?? {}} />
          <BloqueAspecto titulo={metaVal.proteccion?.titulo ?? "PROTECCIÓN DEL BALÓN"} subtitulo={metaVal.proteccion?.subtitulo ?? "Resguardo y Dominio"} definicion={metaVal.proteccion?.definicion}
            nivel={data.proteccionNivel} onNivel={v => set('proteccionNivel', v)} showError={intentoDescarga}
            desc={data.proteccionDesc}   onDesc={v => set('proteccionDesc', v)}
            descripciones={textosVal.proteccion ?? DESC_PROTECCION} />

          {/* TÁCTICA */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'TÁCTICA', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '2px 8px', fontStyle: 'italic' }}>Comprensión del juego y toma de decisiones</td></tr>
          </tbody>
          <BloqueAspecto titulo={metaVal.posicion?.titulo ?? "UBICACIÓN ESPACIAL"} subtitulo={metaVal.posicion?.subtitulo ?? "Posicionamiento y Orientación"} definicion={metaVal.posicion?.definicion}
            nivel={data.posicionNivel} onNivel={v => set('posicionNivel', v)} showError={intentoDescarga}
            desc={data.posicionDesc}   onDesc={v => set('posicionDesc', v)}
            descripciones={textosVal.posicion ?? DESC_UBICACION} />
          <BloqueAspecto titulo={metaVal.vision?.titulo ?? "VELOCIDAD DE PROCESAMIENTO"} subtitulo={metaVal.vision?.subtitulo ?? "Toma de Decisiones Rápida"} definicion={metaVal.vision?.definicion}
            nivel={data.visionNivel} onNivel={v => set('visionNivel', v)} showError={intentoDescarga}
            desc={data.visionDesc}   onDesc={v => set('visionDesc', v)}
            descripciones={textosVal.vision ?? DESC_VELOCIDAD_PROC} />
          <BloqueAspecto titulo={metaVal.defensa?.titulo ?? "LECTURA DE ALTURAS Y ESPACIOS"} subtitulo={metaVal.defensa?.subtitulo ?? "Análisis del Terreno"} definicion={metaVal.defensa?.definicion}
            nivel={data.defensaNivel} onNivel={v => set('defensaNivel', v)} showError={intentoDescarga}
            desc={data.defensaDesc}   onDesc={v => set('defensaDesc', v)}
            descripciones={textosVal.defensa ?? DESC_LECTURA_ALTURAS} />
          <BloqueAspecto titulo={metaVal.amplitud?.titulo ?? "AMPLITUD Y PROFUNDIDAD"} subtitulo={metaVal.amplitud?.subtitulo ?? "Uso del Espacio"} definicion={metaVal.amplitud?.definicion}
            nivel={data.amplitudNivel} onNivel={v => set('amplitudNivel', v)} showError={intentoDescarga}
            desc={data.amplitudDesc}   onDesc={v => set('amplitudDesc', v)}
            descripciones={textosVal.amplitud ?? DESC_AMPLITUD} />
          <BloqueAspecto titulo={metaVal.transicion?.titulo ?? "TRANSICIONES (ATAQUE-DEFENSA)"} subtitulo={metaVal.transicion?.subtitulo ?? "Cambio de Rol Ofensivo/Defensivo"} definicion={metaVal.transicion?.definicion}
            nivel={data.transicionNivel} onNivel={v => set('transicionNivel', v)} showError={intentoDescarga}
            desc={data.transicionDesc}   onDesc={v => set('transicionDesc', v)}
            descripciones={textosVal.transicion ?? DESC_TRANSICION} />
          <BloqueAspecto titulo={metaVal.superioridad?.titulo ?? "LECTURA DE SUPERIORIDAD (2vs1)"} subtitulo={metaVal.superioridad?.subtitulo ?? "Situaciones de Ventaja Numérica"} definicion={metaVal.superioridad?.definicion}
            nivel={data.superioridadNivel} onNivel={v => set('superioridadNivel', v)} showError={intentoDescarga}
            desc={data.superioridadDesc}   onDesc={v => set('superioridadDesc', v)}
            descripciones={textosVal.superioridad ?? DESC_SUPERIORIDAD} />
          <BloqueAspecto titulo={metaVal.basculacion?.titulo ?? "BASCULACIÓN Y COBERTURAS"} subtitulo={metaVal.basculacion?.subtitulo ?? "Desplazamiento Colectivo"} definicion={metaVal.basculacion?.definicion}
            nivel={data.basculacionNivel} onNivel={v => set('basculacionNivel', v)} showError={intentoDescarga}
            desc={data.basculacionDesc}   onDesc={v => set('basculacionDesc', v)}
            descripciones={textosVal.basculacion ?? DESC_BASCULACION} />

          {/* SOCIO-AFECTIVA Y ACTITUDINAL */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'Socio-Afectiva y Actitudinal', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo={metaVal.trabajo?.titulo ?? "TRABAJO EN EQUIPO"} subtitulo={metaVal.trabajo?.subtitulo ?? "Compañerismo y Comunicación"} definicion={metaVal.trabajo?.definicion}
            nivel={data.trabajoNivel} onNivel={v => set('trabajoNivel', v)} showError={intentoDescarga}
            desc={data.trabajoDesc}   onDesc={v => set('trabajoDesc', v)}
            descripciones={textosVal.trabajo ?? DESC_TRABAJO_EQUIPO} />
          <BloqueAspecto titulo={metaVal.disciplina?.titulo ?? "GESTIÓN DE LA FRUSTRACIÓN"} subtitulo={metaVal.disciplina?.subtitulo ?? "Autocontrol y Resiliencia"} definicion={metaVal.disciplina?.definicion}
            nivel={data.disciplinaNivel} onNivel={v => set('disciplinaNivel', v)} showError={intentoDescarga}
            desc={data.disciplinaDesc}   onDesc={v => set('disciplinaDesc', v)}
            descripciones={textosVal.disciplina ?? DESC_GESTION_FRUSTRACION} />
          <BloqueAspecto titulo={metaVal.actitud?.titulo ?? "COMUNICACIÓN ACERTIVA"} subtitulo={metaVal.actitud?.subtitulo ?? "Expresión y Asertividad"} definicion={metaVal.actitud?.definicion}
            nivel={data.actitudNivel} onNivel={v => set('actitudNivel', v)} showError={intentoDescarga}
            desc={data.actitudDesc}   onDesc={v => set('actitudDesc', v)}
            descripciones={textosVal.actitud ?? DESC_COMUNICACION_ASERTIVA} />

          {/* EVALUACIÓN DE DESEMPEÑO COLECTIVO */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'Evaluación de Desempeño Colectivo (El Equipo)', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo={metaVal.identidad?.titulo ?? "IDENTIDAD Y ESTILO DE JUEGO"} subtitulo={metaVal.identidad?.subtitulo ?? "Coherencia y Modelo de Juego"} definicion={metaVal.identidad?.definicion}
            nivel={data.identidadNivel} onNivel={v => set('identidadNivel', v)} showError={intentoDescarga}
            desc={data.identidadDesc}   onDesc={v => set('identidadDesc', v)}
            descripciones={textosVal.identidad ?? DESC_IDENTIDAD_ESTILO} />
          <BloqueAspecto titulo={metaVal.bloque?.titulo ?? "BLOQUE Y COHESIÓN TÁCTICA"} subtitulo={metaVal.bloque?.subtitulo ?? "Organización Colectiva"} definicion={metaVal.bloque?.definicion}
            nivel={data.bloqueNivel} onNivel={v => set('bloqueNivel', v)} showError={intentoDescarga}
            desc={data.bloqueDesc}   onDesc={v => set('bloqueDesc', v)}
            descripciones={textosVal.bloque ?? DESC_BLOQUE_COHESION} />
          <BloqueAspecto titulo={metaVal.clima?.titulo ?? "CLIMA INTERNO Y COMUNICACIÓN"} subtitulo={metaVal.clima?.subtitulo ?? "Ambiente y Vínculos del Grupo"} definicion={metaVal.clima?.definicion}
            nivel={data.climaNivel} onNivel={v => set('climaNivel', v)} showError={intentoDescarga}
            desc={data.climaDesc}   onDesc={v => set('climaDesc', v)}
            descripciones={textosVal.clima ?? DESC_CLIMA_INTERNO} />
          <BloqueAspecto titulo={metaVal.gestionComp?.titulo ?? "GESTIÓN DE LA COMPETICIÓN"} subtitulo={metaVal.gestionComp?.subtitulo ?? "Rendimiento Bajo Presión"} definicion={metaVal.gestionComp?.definicion}
            nivel={data.gestionCompNivel} onNivel={v => set('gestionCompNivel', v)} showError={intentoDescarga}
            desc={data.gestionCompDesc}   onDesc={v => set('gestionCompDesc', v)}
            descripciones={textosVal.gestionComp ?? DESC_GESTION_COMPETICION} />

          {/* ASPECTO COMPORTAMENTAL */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'ASPECTO COMPORTAMENTAL', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            {([
              ['responsabilidad',    'RESPONSABILIDAD'],
              ['puntualidad',        'PUNTUALIDAD'],
              ['disciplinaComp',     'DISCIPLINA'],
              ['respeto',            'RESPETO'],
              ['tolerancia',         'TOLERANCIA'],
              ['companerismo',       'COMPAÑERISMO'],
              ['liderazgo',          'LIDERAZGO'],
              ['trabajoEquipoComp',  'TRABAJO EN EQUIPO'],
              ['sentidoPertenencia', 'SENTIDO DE PERTENENCIA'],
            ] as [string, string][]).map(([key, label], i) => (
              <tr key={key} style={{ background: (intentoDescarga && !(data as any)[key]) ? '#fff5f5' : i % 2 === 0 ? C.grisClaro : '#fff' }}>
                <td colSpan={2} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: (intentoDescarga && !(data as any)[key]) ? '#ef4444' : '#333', letterSpacing: 1 }}>{label}{(intentoDescarga && !(data as any)[key]) && ' ⚠'}</td>
                <td colSpan={2} style={{ padding: '4px 10px' }}>
                  <select value={(data as any)[key]} onChange={e => set(key as any, e.target.value)}
                    style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: `1px solid ${(intentoDescarga && !(data as any)[key]) ? '#ef4444' : '#ccc'}`, borderRadius: 4, background: (intentoDescarga && !(data as any)[key]) ? '#fee2e2' : '#fff', color: '#333' }}>
                    <option value="">— Seleccionar —</option>
                    <option value="SIEMPRE">SIEMPRE</option>
                    <option value="CASI SIEMPRE">CASI SIEMPRE</option>
                    <option value="ALGUNAS VECES">ALGUNAS VECES</option>
                    <option value="CASI NUNCA">CASI NUNCA</option>
                    <option value="NUNCA">NUNCA</option>
                    <option value="No Aplica">No Aplica</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>

          {/* PERFIL INDIVIDUAL */}
          {(() => {
            const esNA = (s: string) => (s ?? '').trim().toUpperCase() === 'NO APLICA';
            const nv = (s: string) => { if (esNA(s)) return 5; const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
            const cv = (s: string) => { if (esNA(s)) return 5; return ({'SIEMPRE':5,'CASI SIEMPRE':4,'ALGUNAS VECES':3,'CASI NUNCA':2,'NUNCA':1}[s] ?? 0); };
            const avg = (vals: number[]) => {
              const filled = vals.filter(v => v > 0);
              return filled.length ? filled.reduce((a,b) => a+b, 0) / filled.length : 0;
            };
            const condicional    = avg([nv(data.fuerzaNivel), nv(data.velocidadNivel), nv(data.resistenciaNivel)]);
            const tecnico        = avg([nv(data.controlNivel), nv(data.paseNivel), nv(data.conductaNivel), nv(data.driblingNivel), nv(data.remataNivel), nv(data.cabeceoNivel), nv(data.quiteNivel), nv(data.proteccionNivel)]);
            const tactico        = avg([nv(data.posicionNivel), nv(data.visionNivel), nv(data.defensaNivel), nv(data.amplitudNivel), nv(data.transicionNivel), nv(data.superioridadNivel), nv(data.basculacionNivel)]);
            const socioAfectiva  = avg([nv(data.trabajoNivel), nv(data.disciplinaNivel), nv(data.actitudNivel)]);
            const comportamental = avg([cv(data.responsabilidad), cv(data.puntualidad), cv(data.disciplinaComp), cv(data.respeto), cv(data.tolerancia), cv(data.companerismo), cv(data.liderazgo), cv(data.trabajoEquipoComp), cv(data.sentidoPertenencia)]);
            const color = (v: number) => v === 0 ? '#aaa' : v >= 4 ? '#1a7c4f' : v >= 3 ? '#1d4e89' : v >= 2 ? '#e85d04' : '#c62a47';
            const etiquetaComp = (v: number) => v === 0 ? '—' : v >= 4.5 ? 'SIEMPRE' : v >= 3.5 ? 'CASI SIEMPRE' : v >= 2.5 ? 'ALGUNAS VECES' : v >= 1.5 ? 'CASI NUNCA' : 'NUNCA';
            const trabajoEquipo  = avg([nv(data.identidadNivel), nv(data.bloqueNivel), nv(data.climaNivel), nv(data.gestionCompNivel)]);
            const promedioGeneral = avg([
              nv(data.fuerzaNivel), nv(data.velocidadNivel), nv(data.resistenciaNivel),
              nv(data.controlNivel), nv(data.paseNivel), nv(data.conductaNivel), nv(data.driblingNivel),
              nv(data.remataNivel), nv(data.cabeceoNivel), nv(data.quiteNivel), nv(data.proteccionNivel),
              nv(data.posicionNivel), nv(data.visionNivel), nv(data.defensaNivel), nv(data.amplitudNivel),
              nv(data.transicionNivel), nv(data.superioridadNivel), nv(data.basculacionNivel),
              nv(data.trabajoNivel), nv(data.disciplinaNivel), nv(data.actitudNivel), nv(data.identidadNivel),
              nv(data.bloqueNivel), nv(data.climaNivel), nv(data.gestionCompNivel),
              cv(data.responsabilidad), cv(data.puntualidad), cv(data.disciplinaComp), cv(data.respeto),
              cv(data.tolerancia), cv(data.companerismo), cv(data.liderazgo), cv(data.trabajoEquipoComp), cv(data.sentidoPertenencia),
            ]);
            const filas: [string, number][] = [
              ['Físico',               condicional],
              ['Técnico',              tecnico],
              ['Táctico',              tactico],
              ['Mental y Actitudinal', socioAfectiva],
              ['Trabajo en Equipo',    trabajoEquipo],
              ['Comportamental',       comportamental],
            ];
            const barra = (val: number, alto: number) => (
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: alto, flex: 1, overflow: 'hidden', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                <div style={{ width: `${(val / 5) * 100}%`, height: '100%', background: color(val), borderRadius: 4, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
              </div>
            );
            return (
              <tbody>
                <tr>{celda(VERDE_GRAD, '#fff', 'VALORACIÓN POR COMPONENTES', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '6px 8px' } as any)}</tr>
                {filas.map(([nombre, val], i) => (
                  <tr key={nombre} style={{ background: i % 2 === 0 ? C.grisClaro : '#fff' }}>
                    <td colSpan={2} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: 0.5 }}>{nombre}</td>
                    <td colSpan={2} style={{ padding: '7px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {barra(val, 10)}
                        <span style={{ minWidth: 30, textAlign: 'right', fontSize: 13, fontWeight: 900, color: color(val) }}>{val === 0 ? '—' : val.toFixed(1)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* VALORACIÓN DEL DEPORTISTA — nota final (promedio de TODOS los fundamentos; No Aplica = 5) */}
                <tr>
                  <td colSpan={2} style={{ background: VERDE_GRAD, color: '#fff', padding: '8px 12px', fontSize: 12, fontWeight: 900, letterSpacing: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                    VALORACIÓN DEL DEPORTISTA
                  </td>
                  <td colSpan={2} style={{ background: VERDE_GRAD, padding: '8px 10px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 4, height: 12, flex: 1, overflow: 'hidden' }}>
                        <div style={{ width: `${(promedioGeneral / 5) * 100}%`, height: '100%', background: '#fff', borderRadius: 4, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
                      </div>
                      <span style={{ minWidth: 34, textAlign: 'right', fontSize: 18, fontWeight: 900, color: '#fff' }}>{promedioGeneral === 0 ? '—' : promedioGeneral.toFixed(1)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            );
          })()}

          {/* LOGROS Y RETOS DE TU PROYECTO DEPORTIVO (un solo cuadro) */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'LOGROS Y RETOS PERSONALES', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', letterSpacing: 1, marginBottom: 2 }}>LOGROS</div>
                <AutoTextarea value={data.logrosTrimestre} onChange={v => { textosManual.current = true; set('logrosTrimestre', v); }}
                  placeholder="Se genera automáticamente al completar la valoración (puedes editarlo)…" />
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0' }} />
                <div style={{ fontSize: 10, fontWeight: 800, color: '#0ea5e9', letterSpacing: 1, marginBottom: 2 }}>RETOS</div>
                <AutoTextarea value={data.objetivosTrimestre} onChange={v => { textosManual.current = true; set('objetivosTrimestre', v); }}
                  placeholder="Se genera automáticamente al completar la valoración (puedes editarlo)…" />
              </td>
            </tr>
          </tbody>

          {/* LOGROS Y RETOS DEL EQUIPO */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'LOGROS Y RETOS DEL EQUIPO', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <AutoTextarea value={data.equipoTrimestre} onChange={v => { textosManual.current = true; set('equipoTrimestre', v); }}
                  placeholder="Se genera desde los fundamentos colectivos (Identidad, Bloque, Clima y Gestión de la Competición)…" />
              </td>
            </tr>
          </tbody>

          {/* FIRMAS */}
          <tbody style={{ breakInside: 'avoid', pageBreakInside: 'avoid', breakBefore: 'avoid', pageBreakBefore: 'avoid' } as React.CSSProperties}>
            <tr>
              <td colSpan={2} style={{ padding: '8px 24px 6px', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#111', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {nombreEntrenador || '___________________________'}
                </div>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#555' }}>Nombre del Formador</div>
              </td>
              <td colSpan={2} style={{ padding: '8px 24px 6px', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#111', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  STEVEN MARULANDA GRISALES
                </div>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#555' }}>Nombre del Coordinador</div>
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
          tbody { break-inside: avoid; page-break-inside: avoid; }
          select { -webkit-appearance: none; -moz-appearance: none; appearance: none; }
        }
      `}</style>
    </div>
  );
}

export default function ValoracionPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#e5e7eb' }} />}>
      <ValoracionPageInner />
    </Suspense>
  );
}
