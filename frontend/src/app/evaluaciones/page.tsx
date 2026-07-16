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
  identidadNivel: string; identidadDesc: string;
  bloqueNivel: string; bloqueDesc: string;
  climaNivel: string; climaDesc: string;
  gestionCompNivel: string; gestionCompDesc: string;
  responsabilidad: string; puntualidad: string; disciplinaComp: string; respeto: string;
  tolerancia: string; companerismo: string; liderazgo: string; trabajoEquipoComp: string; sentidoPertenencia: string;
  logrosTrimestre: string;
  objetivosTrimestre: string;
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
  trabajoNivel: '', trabajoDesc: '',
  identidadNivel: '', identidadDesc: '',
  bloqueNivel: '', bloqueDesc: '',
  climaNivel: '', climaDesc: '',
  gestionCompNivel: '', gestionCompDesc: '',
  responsabilidad: '', puntualidad: '', disciplinaComp: '', respeto: '',
  tolerancia: '', companerismo: '', liderazgo: '', trabajoEquipoComp: '', sentidoPertenencia: '',
  logrosTrimestre: '',
  objetivosTrimestre: '',
  observaciones: '',
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
        <td colSpan={4} style={{ background: '#fff', color: '#16a34a', textAlign: 'center', fontWeight: 900, fontSize: 13, padding: '5px 8px', letterSpacing: 1 }}>
          {titulo}
        </td>
      </tr>
      <tr>
        <td colSpan={2} style={{ background: C.grisAzul, color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px' }}>
          ({subtitulo})
        </td>
        <td colSpan={2} style={{ background: C.grisAzul, color: '#fff', padding: '2px 8px' }}>
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
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
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

  const celda = (bg: string, color: string, content: React.ReactNode, extra?: React.CSSProperties & { colSpan?: number }) => {
    const { colSpan, ...styleProps } = (extra ?? {}) as any;
    return <td colSpan={colSpan} style={{ background: bg, color, padding: '3px 8px', fontSize: 11, fontWeight: 700, ...styleProps }}>{content}</td>;
  };

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

          {/* ── ENCABEZADO ── */}
          <tbody>
            <tr>
              <td colSpan={4} style={{ padding: 0 }}>
                {/* Título - verde degradado */}
                <div style={{ background: VERDE_GRAD, color: '#fff', textAlign: 'center', fontWeight: 900, fontSize: 15, letterSpacing: 3, padding: '9px 16px', textTransform: 'uppercase', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                  Valoración Cualitativa del Deportista
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
                      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '2px solid #e5e7eb', outline: 'none', color: '#111', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Arial, sans-serif', padding: '0 0 4px 0', marginBottom: 10 }} />
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
                              style={{ background: 'transparent', border: 'none', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, fontFamily: 'Arial, sans-serif', flex: 1, padding: 0 }} />
                          </div>
                        );
                      })}
                      {/* FECHA INF. + POSICIÓN */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>FECHA INF.</span>
                          <input value={data.fecha} onChange={e => set('fecha', e.target.value)} placeholder="dd/mm/aaaa"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, fontFamily: 'Arial, sans-serif', width: 82, padding: 0 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>POSICIÓN</span>
                          <select value={data.posicion} onChange={e => set('posicion', e.target.value)}
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                            {POSICIONES.map(o => <option key={o} value={o}>{o || '— Seleccionar —'}</option>)}
                          </select>
                        </div>
                      </div>
                      {/* # INFORME + PERFIL */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 72, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}># INFORME</span>
                          <input value={data.numeroInforme} onChange={e => set('numeroInforme', e.target.value)} placeholder="01"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, fontFamily: 'Arial, sans-serif', width: 40, padding: 0 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, minWidth: 62, textAlign: 'center', flexShrink: 0, letterSpacing: 0.5 }}>PERFIL</span>
                          <select value={data.perfil} onChange={e => set('perfil', e.target.value)}
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#222', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'Arial, sans-serif', padding: 0 }}>
                            {PERFILES.map(o => <option key={o} value={o}>{o || '— Seleccionar —'}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* CÓDIGO - solo derecha, editable */}
                  <div style={{ flexShrink: 0, textAlign: 'center', alignSelf: 'flex-start' }}>
                    <div style={{ color: '#374151', fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>CÓDIGO</div>
                    <div style={{ background: VERDE_GRAD, borderRadius: 10, minWidth: 65, textAlign: 'center', padding: '8px 10px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                      <input value={data.codigo} onChange={e => set('codigo', e.target.value)} placeholder="—"
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontWeight: 900, fontSize: 20, width: 60, textAlign: 'center', fontFamily: 'Arial, sans-serif', padding: 0 }} />
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
            <tr>{celda(VERDE_GRAD, '#fff', 'TÉCNICA (RELACIONAMIENTO CON EL BALÓN)', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
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
            <tr>{celda(VERDE_GRAD, '#fff', 'TÁCTICA', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
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
            <tr>{celda(VERDE_GRAD, '#fff', 'Socio-Afectiva y Actitudinal', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo="TRABAJO EN EQUIPO" subtitulo="Compañerismo y Comunicación"
            nivel={data.trabajoNivel} onNivel={v => set('trabajoNivel', v)}
            desc={data.trabajoDesc}   onDesc={v => set('trabajoDesc', v)}
            descripciones={DESC_TRABAJO_EQUIPO} />
          <BloqueAspecto titulo="GESTIÓN DE LA FRUSTRACIÓN" subtitulo="Autocontrol y Resiliencia"
            nivel={data.disciplinaNivel} onNivel={v => set('disciplinaNivel', v)}
            desc={data.disciplinaDesc}   onDesc={v => set('disciplinaDesc', v)}
            descripciones={DESC_GESTION_FRUSTRACION} />
          <BloqueAspecto titulo="COMUNICACIÓN ACERTIVA" subtitulo="Expresión y Asertividad"
            nivel={data.actitudNivel} onNivel={v => set('actitudNivel', v)}
            desc={data.actitudDesc}   onDesc={v => set('actitudDesc', v)}
            descripciones={DESC_COMUNICACION_ASERTIVA} />

          {/* EVALUACIÓN DE DESEMPEÑO COLECTIVO */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'Evaluación de Desempeño Colectivo (El Equipo)', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
          </tbody>
          <BloqueAspecto titulo="IDENTIDAD Y ESTILO DE JUEGO" subtitulo="Coherencia y Modelo de Juego"
            nivel={data.identidadNivel} onNivel={v => set('identidadNivel', v)}
            desc={data.identidadDesc}   onDesc={v => set('identidadDesc', v)}
            descripciones={DESC_IDENTIDAD_ESTILO} />
          <BloqueAspecto titulo="BLOQUE Y COHESIÓN TÁCTICA" subtitulo="Organización Colectiva"
            nivel={data.bloqueNivel} onNivel={v => set('bloqueNivel', v)}
            desc={data.bloqueDesc}   onDesc={v => set('bloqueDesc', v)}
            descripciones={DESC_BLOQUE_COHESION} />
          <BloqueAspecto titulo="CLIMA INTERNO Y COMUNICACIÓN" subtitulo="Ambiente y Vínculos del Grupo"
            nivel={data.climaNivel} onNivel={v => set('climaNivel', v)}
            desc={data.climaDesc}   onDesc={v => set('climaDesc', v)}
            descripciones={DESC_CLIMA_INTERNO} />
          <BloqueAspecto titulo="GESTIÓN DE LA COMPETICIÓN" subtitulo="Rendimiento Bajo Presión"
            nivel={data.gestionCompNivel} onNivel={v => set('gestionCompNivel', v)}
            desc={data.gestionCompDesc}   onDesc={v => set('gestionCompDesc', v)}
            descripciones={DESC_GESTION_COMPETICION} />

          {/* LOGROS DEL TRIMESTRE */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'LOGROS DEL TRIMESTRE', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <textarea value={data.logrosTrimestre} onChange={e => set('logrosTrimestre', e.target.value)}
                  rows={4} placeholder="Describe los logros del trimestre..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
              </td>
            </tr>
          </tbody>

          {/* OBJETIVOS DEL TRIMESTRE */}
          <tbody>
            <tr>{celda(VERDE_GRAD, '#fff', 'OBJETIVOS DEL TRIMESTRE', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '5px 8px' } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <textarea value={data.objetivosTrimestre} onChange={e => set('objetivosTrimestre', e.target.value)}
                  rows={4} placeholder="Describe los objetivos del trimestre..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
              </td>
            </tr>
          </tbody>

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
              <tr key={key} style={{ background: i % 2 === 0 ? C.grisClaro : '#fff' }}>
                <td colSpan={2} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#333', letterSpacing: 1 }}>{label}</td>
                <td colSpan={2} style={{ padding: '4px 10px' }}>
                  <select value={(data as any)[key]} onChange={e => set(key as any, e.target.value)}
                    style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#333' }}>
                    <option value="">— Seleccionar —</option>
                    <option value="SIEMPRE">SIEMPRE</option>
                    <option value="CASI SIEMPRE">CASI SIEMPRE</option>
                    <option value="ALGUNAS VECES">ALGUNAS VECES</option>
                    <option value="CASI NUNCA">CASI NUNCA</option>
                    <option value="NUNCA">NUNCA</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>

          {/* PERFIL INDIVIDUAL */}
          {(() => {
            const nv = (s: string) => { const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
            const cv = (s: string) => ({'SIEMPRE':5,'CASI SIEMPRE':4,'ALGUNAS VECES':3,'CASI NUNCA':2,'NUNCA':1}[s] ?? 0);
            const avg = (vals: number[]) => {
              const filled = vals.filter(v => v > 0);
              return filled.length ? filled.reduce((a,b) => a+b, 0) / filled.length : 0;
            };
            const condicional    = avg([nv(data.fuerzaNivel), nv(data.velocidadNivel), nv(data.resistenciaNivel)]);
            const tecnico        = avg([nv(data.controlNivel), nv(data.conductaNivel), nv(data.paseNivel), nv(data.remataNivel), nv(data.proteccionNivel)]);
            const tactico        = avg([nv(data.posicionNivel), nv(data.visionNivel), nv(data.defensaNivel), nv(data.amplitudNivel), nv(data.transicionNivel), nv(data.superioridadNivel), nv(data.basculacionNivel)]);
            const socioAfectiva  = avg([nv(data.trabajoNivel), nv(data.disciplinaNivel), nv(data.actitudNivel)]);
            const comportamental = avg([cv(data.responsabilidad), cv(data.puntualidad), cv(data.disciplinaComp), cv(data.respeto), cv(data.tolerancia), cv(data.companerismo), cv(data.liderazgo), cv(data.trabajoEquipoComp), cv(data.sentidoPertenencia)]);
            const color = (v: number) => v === 0 ? '#aaa' : v >= 4 ? '#1a7c4f' : v >= 3 ? '#1d4e89' : v >= 2 ? '#e85d04' : '#c62a47';
            const etiquetaComp = (v: number) => v === 0 ? '—' : v >= 4.5 ? 'SIEMPRE' : v >= 3.5 ? 'CASI SIEMPRE' : v >= 2.5 ? 'ALGUNAS VECES' : v >= 1.5 ? 'CASI NUNCA' : 'NUNCA';
            const filas: [string, number][] = [
              ['Aspecto Condicional',            condicional],
              ['Aspecto Técnico',                tecnico],
              ['Aspecto Táctico',                tactico],
              ['Socio-Afectiva y Actitudinal',   socioAfectiva],
              ['Aspecto Comportamental',         comportamental],
            ];
            return (
              <tbody>
                <tr>{celda(C.negro, '#fff', 'PERFIL INDIVIDUAL', { colSpan: 4, textAlign: 'center', fontSize: 13, letterSpacing: 2, padding: '6px 8px' } as any)}</tr>
                <tr style={{ background: '#d0dae6' }}>
                  <td colSpan={2} style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#333', letterSpacing: 1 }}>ASPECTO</td>
                  <td colSpan={2} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#333', textAlign: 'center' }}>CALIFICACIÓN</td>
                </tr>
                {filas.map(([nombre, val], i) => {
                  return (
                    <tr key={nombre} style={{ background: i % 2 === 0 ? C.grisClaro : '#fff' }}>
                      <td colSpan={2} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: '#333' }}>{nombre}</td>
                      <td colSpan={2} style={{ padding: '7px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: color(val) }}>
                        {val === 0 ? '—' : val.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                {/* Promedio general */}
                {(() => {
                  const promedioGeneral = avg([condicional, tecnico, tactico, socioAfectiva, comportamental]);
                  return (
                    <tr>
                      <td colSpan={2} style={{ background: VERDE_GRAD, color: '#fff', padding: '9px 12px', fontSize: 12, fontWeight: 900, letterSpacing: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                        VALORACIÓN DEPORTISTA
                      </td>
                      <td colSpan={2} style={{ background: VERDE_GRAD, color: '#fff', padding: '9px 8px', textAlign: 'center', fontSize: 20, fontWeight: 900, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                        {promedioGeneral === 0 ? '—' : promedioGeneral.toFixed(2)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            );
          })()}

          {/* OBSERVACIONES */}
          <tbody>
            <tr>{celda(C.negro, '#fff', 'OBSERVACIONES GENERALES', { colSpan: 4, textAlign: 'center', fontSize: 12, letterSpacing: 2 } as any)}</tr>
            <tr>
              <td colSpan={4} style={{ background: C.grisClaro, padding: '8px 12px' }}>
                <textarea value={data.observaciones} onChange={e => set('observaciones', e.target.value)}
                  rows={4} placeholder="Observaciones generales del entrenador..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, resize: 'none', fontFamily: 'Arial, sans-serif', color: '#333' }} />
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
