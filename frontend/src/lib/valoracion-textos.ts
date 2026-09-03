// ─────────────────────────────────────────────────────────────
//  Textos de los niveles de cada fundamento de la Valoración Deportiva.
//  Estos son los valores POR DEFECTO. El administrador puede editarlos en
//  el módulo "Gestión de Valoración" y quedan guardados en Supabase
//  (tabla config_valoracion, fila 'descripciones'). El formulario del
//  formador usa estos textos para autocompletar la descripción de cada nivel.
// ─────────────────────────────────────────────────────────────

/* ⚠ PENDIENTE 3 — ESTE ARCHIVO TODAVÍA APUNTA A LA BASE VIEJA.
   ------------------------------------------------------------------
   La plataforma se mudó al proyecto `fykdyalpuydkwfjqguip` el 18/08/2026, pero
   "Gestión de Valoración" siguió guardando en el proyecto viejo
   `gsovtgtrsqzoruvgmhed`, que ya nadie más lee.

   NO se cambió todavía a propósito: en la base buena aún no existe la tabla
   `config_valoracion`. Si se cambia antes de crearla, esta pantalla se queda
   sin poder guardar.

   PARA TERMINARLO (25/08/2026):
     1. Doble clic en  PASO-1-CREAR-TABLAS.bat          (crea las tablas)
     2. Doble clic en  PASO-2-PASAR-TEXTOS-VALORACION.bat  (trae los textos)
     3. Cambiar estas dos líneas por:
          const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
          const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
     4. Publicar con SUBIR-AHORA.bat
   ------------------------------------------------------------------ */
const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/* Guardar una fila de config_valoracion.
   Antes se usaba PATCH con ?id=eq.… : si la fila NO existía, el servidor
   respondía "todo bien" sin haber guardado nada, y la pantalla decía Guardado.
   Con upsert la fila se crea si falta, así que el guardado es de verdad. */
async function guardarFila(id: string, data: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion`, {
      method: 'POST',
      headers: {
        ...SB_HDR,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) console.error('[valoracion] guardar ' + id + ':', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) { console.error('[valoracion] guardar ' + id + ':', e); return false; }
}

export const NIVELES_LABELS = [
  'Nivel 1 (Iniciación)',
  'Nivel 2 (En Desarrollo)',
  'Nivel 3 (Competente)',
  'Nivel 4 (Avanzado)',
  'Nivel 5 (Dominante)',
];

export type Desc = Record<string, string>;

const DESC_FUERZA: Desc = {
  'Nivel 1 (Iniciación)':   'Presenta dificultades para mantener el equilibrio en contactos físicos. Su potencia de golpeo es limitada y suele perder la posición fácilmente en los duelos 1vs1.',
  'Nivel 2 (En Desarrollo)':'Muestra intención de utilizar su cuerpo para proteger el balón, pero carece de la estabilidad necesaria para sostener la carga del rival de forma efectiva.',
  'Nivel 3 (Competente)':   'Utiliza su fuerza de manera adecuada para disputar balones. Posee una potencia de remate y salto acorde a su edad, logrando ganar duelos físicos de intensidad media.',
  'Nivel 4 (Avanzado)':     'Domina el uso del cuerpo (brazos y tronco) para blindar el balón. Su potencia explosiva le permite ganar la mayoría de los duelos y realizar cambios de dirección firmes.',
  'Nivel 5 (Dominante)':    'Posee una fuerza explosiva superior. Es determinante en el choque, difícil de desequilibrar y sus remates o despejes tienen una potencia que marca diferencia en el partido.',
};
const DESC_VELOCIDAD: Desc = {
  'Nivel 1 (Iniciación)':   'Su respuesta ante los estímulos del juego (balón o rival) es lenta. Le cuesta arrancar con rapidez y suele llegar tarde a las jugadas divididas.',
  'Nivel 2 (En Desarrollo)':'Muestra buena velocidad en línea recta, pero le toma tiempo reaccionar cuando el balón cambia de dirección o hay una transición rápida.',
  'Nivel 3 (Competente)':   'Reacciona de forma oportuna a las acciones de juego. Es capaz de realizar sprints efectivos y mantiene una velocidad de desplazamiento adecuada para su posición.',
  'Nivel 4 (Avanzado)':     'Posee un "arranque" potente. Su velocidad de reacción le permite anticiparse a los rivales con frecuencia y destaca por su rapidez en distancias cortas y largas.',
  'Nivel 5 (Dominante)':    'Es un jugador veloz tanto física como mentalmente. Su capacidad de aceleración y desaceleración es élite, permitiéndole desbordar o recuperar posiciones de forma excepcional.',
};
const DESC_RESISTENCIA: Desc = {
  'Nivel 1 (Iniciación)':   'Muestra signos de fatiga prematura. Su participación en el juego disminuye drásticamente después de los primeros minutos de intensidad.',
  'Nivel 2 (En Desarrollo)':'Completa los partidos, pero con una intensidad intermitente. Requiere periodos largos de recuperación tras realizar esfuerzos máximos (sprints).',
  'Nivel 3 (Competente)':   'Mantiene un ritmo de juego estable durante la mayor parte del encuentro. Logra recuperarse adecuadamente entre esfuerzos y mantiene la forma técnica a pesar del cansancio.',
  'Nivel 4 (Avanzado)':     'Posee una gran capacidad de trabajo ("box to box"). Realiza múltiples esfuerzos de alta intensidad sin que su rendimiento decaiga, manteniendo la lucidez hasta el final.',
  'Nivel 5 (Dominante)':    'Nivel de condición física sobresaliente. Es capaz de sostener un ritmo alto de presión y despliegue durante todo el partido, recuperándose casi de inmediato tras esfuerzos explosivos.',
};
const DESC_CONTROL: Desc = {
  'Nivel 1 (Iniciación)':   'El balón se le escapa tras el primer toque; necesita varios contactos para dominarlo.',
  'Nivel 2 (En Desarrollo)':'Detiene el balón, pero queda estático. Requiere un segundo toque para empezar a moverse.',
  'Nivel 3 (Competente)':   'Controla el balón hacia una zona libre de presión en situaciones de baja intensidad.',
  'Nivel 4 (Avanzado)':     'El primer toque ya es una ventaja: prepara el balón para el siguiente pase o tiro de inmediato.',
  'Nivel 5 (Dominante)':    'Domina el control con cualquier superficie (pecho, muslo, cabeza) y elimina rivales con el primer toque.',
};
const DESC_PASE: Desc = {
  'Nivel 1 (Iniciación)':   'Pases sin dirección; no elige bien la superficie de contacto ni al compañero receptor.',
  'Nivel 2 (En Desarrollo)':'Logra dar el pase a un compañero cercano, pero sin intención táctica ni variación de distancia.',
  'Nivel 3 (Competente)':   'Pases precisos a corta y media distancia; elige correctamente al compañero libre.',
  'Nivel 4 (Avanzado)':     'Varía la distancia, velocidad y superficie del pase con intención táctica clara.',
  'Nivel 5 (Dominante)':    'Precisión total bajo presión; ejecuta pases filtrados, de cambio de juego y de larga distancia.',
};
const DESC_CONDUCCION: Desc = {
  'Nivel 1 (Iniciación)':   'Mantiene la vista fija en el balón; pierde el control al aumentar la velocidad.',
  'Nivel 2 (En Desarrollo)':'Conduce con el interior/exterior pero con trayectorias rígidas.',
  'Nivel 3 (Competente)':   'Conduce con la cabeza levantada; realiza cambios de dirección básicos.',
  'Nivel 4 (Avanzado)':     'Domina el cambio de ritmo y fintas para superar rivales en el 1vs1.',
  'Nivel 5 (Dominante)':    'Control total del espacio y el balón; utiliza ambos perfiles para desequilibrar.',
};
const DESC_DRIBLING: Desc = {
  'Nivel 1 (Iniciación)':   'Carece de recursos para el desborde; tiende a chocar contra los defensas rivales o pierde el equilibrio al intentar realizar cualquier finta o amague.',
  'Nivel 2 (En Desarrollo)':'Intenta regatear en situaciones de uno contra uno, pero ejecuta los amagues muy tarde o sin la velocidad de cambio necesaria para superar al oponente.',
  'Nivel 3 (Competente)':   'Supera a rivales en duelos individuales utilizando cambios de ritmo sencillos, amagues corporales básicos o fintas hacia su perfil hábil.',
  'Nivel 4 (Avanzado)':     'Desborda con regularidad en el uno contra uno utilizando recursos técnicos variados (fintas, bicicletas, amagues en espacios reducidos) con gran explosividad.',
  'Nivel 5 (Dominante)':    'Es un desequilibrante neto; desmantela defensas completas mediante el dribling en espacios reducidos, generando superioridad numérica constante para su equipo.',
};
const DESC_REMATE: Desc = {
  'Nivel 1 (Iniciación)':   'Contacto impreciso con el balón; le cuesta dar dirección o potencia. Generalmente golpea con la punta o sin coordinar la carrera.',
  'Nivel 2 (En Desarrollo)':'Logra impactar con el empeine o borde interno, pero el tiro suele ir al centro o fuera. Necesita mucho tiempo y espacio para preparar el cuerpo.',
  'Nivel 3 (Competente)':   'Capaz de dirigir el remate hacia los costados en situaciones de poca presión. Empieza a diferenciar superficies de contacto según la distancia.',
  'Nivel 4 (Avanzado)':     'Ejecuta con potencia y colocación incluso en carrera. Ajusta el cuerpo rápidamente para rematar balones que vienen de diferentes ángulos.',
  'Nivel 5 (Dominante)':    'Define con ambas piernas y bajo máxima presión defensiva. Domina el remate de primera intención y utiliza recursos variados (volea, cabeza, colocación sutil).',
};
const DESC_CABECEO: Desc = {
  'Nivel 1 (Iniciación)':   'Evita el contacto aéreo o cierra los ojos al disputar balones por alto; su contacto con la cabeza suele ser débil, desviado o golpeando con zonas incorrectas del cráneo.',
  'Nivel 2 (En Desarrollo)':'Salta a disputar balones aéreos, pero calcula mal el tiempo del impacto o carece de la fuerza de cuello necesaria para direccionar el balón con eficacia.',
  'Nivel 3 (Competente)':   'Muestra buen timing en el salto para disputar balones aéreos estándar, logrando despejar o direccionar hacia zonas seguras en media intensidad.',
  'Nivel 4 (Avanzado)':     'Excelente técnica de impacto aéreo; utiliza los brazos para proteger el espacio en el salto y conecta frentazos con potencia y dirección certera (tanto en defensa como en ataque).',
  'Nivel 5 (Dominante)':    'Imponente en el juego aéreo; gana la gran mayoría de los duelos por arriba gracias a una potencia de salto sobresaliente y una capacidad quirúrgica para colocar el balón de cabeza donde desea.',
};
const DESC_QUITE: Desc = {
  'Nivel 1 (Iniciación)':   'Comete faltas recurrentes al intentar recuperar la pelota; va al piso de forma precipitada o pierde la posición defensiva fácilmente ante amagues simples del rival.',
  'Nivel 2 (En Desarrollo)':'Intenta meter el pie o interceptar el pase, pero calcula mal la distancia y la velocidad de la jugada; suele llegar con éxito solo en acciones pausadas o de baja intensidad.',
  'Nivel 3 (Competente)':   'Mantiene una postura defensiva equilibrada; realiza quites limpios en el momento adecuado y sabe temporizar para no regalarse ante la gambeta rival.',
  'Nivel 4 (Avanzado)':     'Posee un gran timing para la entrada defensiva; mete el pie con firmeza y elegancia para quitar el balón o cortar líneas de pase sin cometer infracción.',
  'Nivel 5 (Dominante)':    'Implacable en el duelo 1vs1 defensivo; anticipa las intenciones del atacante con precisión quirúrgica, realizando quites limpios y saliendo con la pelota controlada para iniciar el ataque.',
};
const DESC_PROTECCION: Desc = {
  'Nivel 1 (Iniciación)':   'Pierde la posición y la pelota ante el mínimo contacto físico; no utiliza los brazos ni el tronco para blindar el balón, exponiéndolo directamente al defensor.',
  'Nivel 2 (En Desarrollo)':'Muestra intención de usar el cuerpo para proteger el balón, pero carece de la estabilidad o el centro de gravedad bajo para sostener la carga del rival de forma efectiva.',
  'Nivel 3 (Competente)':   'Interpone el cuerpo de manera adecuada entre el rival y la pelota en acciones estáticas o de velocidad media, manteniendo la posesión bajo presión moderada.',
  'Nivel 4 (Avanzado)':     'Protege el esférico con solidez utilizando los brazos y la espalda como escudo; se perfila bien respecto al marcador y utiliza la fuerza de piernas para girar con ventaja.',
  'Nivel 5 (Dominante)':    'Es una muralla para proteger la pelota; domina el uso del cuerpo como escudo en máxima velocidad y en espacios reducidos, haciendo casi imposible que el rival le despoje el esférico sin cometer falta.',
};
const DESC_UBICACION: Desc = {
  'Nivel 1 (Iniciación)':   'Tiende a seguir el balón sin mantener una posición (efecto "enjambre").',
  'Nivel 2 (En Desarrollo)':'Reconoce su posición general (defensa/ataque) pero se desorienta fácil.',
  'Nivel 3 (Competente)':   'Mantiene su zona de juego y entiende cuándo subir o bajar.',
  'Nivel 4 (Avanzado)':     'Lee el juego; ocupa espacios libres para ofrecerse como opción de pase.',
  'Nivel 5 (Dominante)':    'Dicta el ritmo del juego; corrige la posición de sus compañeros y anticipa jugadas.',
};
const DESC_VELOCIDAD_PROC: Desc = {
  'Nivel 1 (Iniciación)':   'Se queda congelado con el balón; decide después de que la jugada ya pasó.',
  'Nivel 2 (En Desarrollo)':'Elige la opción correcta pero tarda demasiado en ejecutarla, permitiendo la reacción rival.',
  'Nivel 3 (Competente)':   'Identifica la mejor opción (pasar o conducir) en situaciones estándar de juego.',
  'Nivel 4 (Avanzado)':     'Decide y ejecuta de forma fluida; siempre tiene un "Plan B" si la jugada se cierra.',
  'Nivel 5 (Dominante)':    'Juega a "uno o dos toques"; su mente va más rápido que el balón. Anticipa el error del rival.',
};
const DESC_LECTURA_ALTURAS: Desc = {
  'Nivel 1 (Iniciación)':   'Corre siempre hacia el balón (atracción magnética); se amontona con sus compañeros.',
  'Nivel 2 (En Desarrollo)':'Identifica cuándo está solo, pero le cuesta ver dónde están los espacios libres para atacar.',
  'Nivel 3 (Competente)':   'Sabe cuándo dar amplitud (ir a la banda) o profundidad (picar al espacio) según la jugada.',
  'Nivel 4 (Avanzado)':     'Reconoce los momentos para acelerar el juego o pausarlo para reorganizar al equipo.',
  'Nivel 5 (Dominante)':    'Maestro de la "pausa"; atrae rivales para liberar compañeros y detecta debilidades en el sistema rival.',
};
const DESC_AMPLITUD: Desc = {
  'Nivel 1 (Iniciación)':   'Se mantiene estático; no comprende que puede alejarse del balón para crear espacio.',
  'Nivel 2 (En Desarrollo)':'Entiende que debe ocupar bandas, pero tiende a cerrarse cuando el juego se complica.',
  'Nivel 3 (Competente)':   'Se posiciona correctamente en ataque para "estirar" la defensa rival y ofrecer líneas de pase.',
  'Nivel 4 (Avanzado)':     'Sincroniza sus movimientos con los compañeros; sabe cuándo picar al vacío o cuándo dar apoyo.',
  'Nivel 5 (Dominante)':    'Domina los conceptos de tercer hombre y desmarques de ruptura; manipula la estructura rival con su posición.',
};
const DESC_TRANSICION: Desc = {
  'Nivel 1 (Iniciación)':   'Se queda parado tras perder el balón o tras un tiro a gol; tarda en reaccionar.',
  'Nivel 2 (En Desarrollo)':'Reacciona al cambio de posesión pero con trote lento; no identifica su nueva tarea de inmediato.',
  'Nivel 3 (Competente)':   'Cambia el chip rápido; si pierde el balón intenta recuperarlo o regresa a su zona defensiva.',
  'Nivel 4 (Avanzado)':     'Identifica el momento de presión tras pérdida o repliegue organizado según la instrucción.',
  'Nivel 5 (Dominante)':    'Velocidad mental de élite; anticipa la transición antes de que ocurra y organiza el balance del equipo.',
};
const DESC_SUPERIORIDAD: Desc = {
  'Nivel 1 (Iniciación)':   'No identifica ventajas numéricas; intenta la acción individual aunque tenga un compañero solo.',
  'Nivel 2 (En Desarrollo)':'Reconoce la ventaja pero elige mal el momento del pase o la conducción.',
  'Nivel 3 (Competente)':   'Aprovecha las situaciones de superioridad para fijar a un defensa y descargar en el compañero libre.',
  'Nivel 4 (Avanzado)':     'Atrae marcas de forma intencional para generar espacios en otras zonas del campo.',
  'Nivel 5 (Dominante)':    'Ejecuta con perfección táctica los doblajes y triangulaciones para romper líneas defensivas.',
};
const DESC_BASCULACION: Desc = {
  'Nivel 1 (Iniciación)':   'Desconoce el movimiento del bloque; se queda solo en su zona sin ayudar al compañero.',
  'Nivel 2 (En Desarrollo)':'Sigue el balón lateralmente pero deja huecos peligrosos a su espalda o en el centro.',
  'Nivel 3 (Competente)':   'Acompaña el movimiento del equipo hacia el lado del balón; ofrece apoyo al compañero superado.',
  'Nivel 4 (Avanzado)':     'Domina las permutas (cambio de marca) y el escalonamiento defensivo para evitar pases filtrados.',
  'Nivel 5 (Dominante)':    'Lee el peligro antes de que surja; dirige el bloque defensivo y corrige desajustes de otros compañeros.',
};
const DESC_TRABAJO_EQUIPO: Desc = {
  'Nivel 1 (Iniciación)':   'Juega de forma individualista; le cuesta seguir instrucciones grupales.',
  'Nivel 2 (En Desarrollo)':'Empieza a colaborar con compañeros cercanos; acepta las reglas.',
  'Nivel 3 (Competente)':   'Muestra compañerismo; acepta críticas constructivas y apoya al equipo.',
  'Nivel 4 (Avanzado)':     'Liderazgo positivo; se comunica activamente para ayudar al grupo.',
  'Nivel 5 (Dominante)':    'Referente dentro y fuera del campo; gestiona la frustración y motiva al resto.',
};
const DESC_GESTION_FRUSTRACION: Desc = {
  'Nivel 1 (Iniciación)':   'Se rinde o llora ante el error o la derrota; se desconecta del partido si algo sale mal.',
  'Nivel 2 (En Desarrollo)':'Muestra enfado ante el error; le cuesta retomar el ritmo de juego tras una falla.',
  'Nivel 3 (Competente)':   'Acepta el error como parte del juego y sigue esforzándose, aunque le afecte el ánimo.',
  'Nivel 4 (Avanzado)':     'Utiliza el error como motivación para recuperar el balón de inmediato. Mantiene el equilibrio.',
  'Nivel 5 (Dominante)':    'Resiliencia total; contagia calma y seguridad a sus compañeros en momentos de máxima tensión.',
};
const DESC_COMUNICACION_ASERTIVA: Desc = {
  'Nivel 1 (Iniciación)':   'No habla en el campo; juega de forma aislada sin interactuar con el entorno.',
  'Nivel 2 (En Desarrollo)':'Se comunica solo para pedir el balón; comunicación verbal limitada y reactiva.',
  'Nivel 3 (Competente)':   'Da indicaciones básicas ("solo", "pasa", "mío") que ayudan a la fluidez del juego.',
  'Nivel 4 (Avanzado)':     'Habla constantemente para organizar la defensa o alertar a compañeros sobre peligros.',
  'Nivel 5 (Dominante)':    'Líder comunicativo; utiliza un lenguaje positivo y técnico para coordinar al equipo en todo momento.',
};
const DESC_IDENTIDAD_ESTILO: Desc = {
  'Nivel 1 (Iniciación)':   'No hay un estilo claro; el equipo juega al azar y depende de individualidades.',
  'Nivel 2 (En Desarrollo)':'Se intentan seguir algunas ideas del DT, pero el equipo pierde la forma rápidamente.',
  'Nivel 3 (Competente)':   'El equipo tiene una idea clara (ej: salir jugando, presionar alto) y la mantiene gran parte del tiempo.',
  'Nivel 4 (Avanzado)':     'Estilo de juego definido y reconocible. Los jugadores saben a qué juegan incluso en situaciones difíciles.',
  'Nivel 5 (Dominante)':    'El equipo domina múltiples variantes tácticas y tiene una identidad inquebrantable sin importar el rival.',
};
const DESC_BLOQUE_COHESION: Desc = {
  'Nivel 1 (Iniciación)':   'Equipo "partido" o estirado; mucha distancia entre defensas y delanteros.',
  'Nivel 2 (En Desarrollo)':'Hay intentos de moverse juntos, pero se generan huecos grandes al defender o atacar.',
  'Nivel 3 (Competente)':   'El equipo se mueve como un bloque; hay ayudas mutuas y las líneas mantienen distancias correctas.',
  'Nivel 4 (Avanzado)':     'Basculaciones y coberturas automáticas. El equipo se encoge y se estira con mucha fluidez.',
  'Nivel 5 (Dominante)':    'Unidad total; el bloque se mueve de forma coordinada y asfixiante. Compacto en todas sus líneas.',
};
const DESC_CLIMA_INTERNO: Desc = {
  'Nivel 1 (Iniciación)':   'Hay discusiones frecuentes, reproches ante el error o silencio absoluto.',
  'Nivel 2 (En Desarrollo)':'La comunicación es escasa o solo ocurre cuando van ganando. Hay subgrupos marcados.',
  'Nivel 3 (Competente)':   'Comunicación funcional y positiva. Se alientan entre sí y aceptan las correcciones del líder/DT.',
  'Nivel 4 (Avanzado)':     'Existe un lenguaje común en el campo; se apoyan en los momentos críticos y celebran el éxito ajeno.',
  'Nivel 5 (Dominante)':    'Fraternidad y resiliencia. El equipo es una familia donde la confianza permite máxima exigencia sin conflicto.',
};
const DESC_GESTION_COMPETICION: Desc = {
  'Nivel 1 (Iniciación)':   'Se desmoronan ante el primer gol en contra; falta de orden en la adversidad.',
  'Nivel 2 (En Desarrollo)':'Compiten bien a ratos, pero pierden la concentración en los minutos finales o tras errores.',
  'Nivel 3 (Competente)':   'Equipo competitivo que lucha hasta el final, manteniendo la calma y el orden la mayor parte del tiempo.',
  'Nivel 4 (Avanzado)':     'Gran madurez competitiva; saben manejar los tiempos del partido (cuándo acelerar y cuándo pausar).',
  'Nivel 5 (Dominante)':    'Mentalidad ganadora colectiva; el equipo crece en la dificultad y gestiona la presión con absoluta seguridad.',
};

export interface FundamentoMeta {
  key: string; categoria: string; titulo: string; subtitulo: string;
}

// Orden y agrupación de los fundamentos (igual que en el formulario del formador)
export const FUNDAMENTOS: FundamentoMeta[] = [
  { key: 'fuerza',       categoria: 'Físico',   titulo: 'FUERZA',                       subtitulo: 'Potencia y Duelo' },
  { key: 'velocidad',    categoria: 'Físico',   titulo: 'VELOCIDAD',                    subtitulo: 'Reacción y Desplazamiento' },
  { key: 'resistencia',  categoria: 'Físico',   titulo: 'RESISTENCIA',                  subtitulo: 'Capacidad Aeróbica y Recuperación' },
  { key: 'control',      categoria: 'Técnica',  titulo: 'CONTROL',                      subtitulo: 'Recepción y Dominio del Balón' },
  { key: 'pase',         categoria: 'Técnica',  titulo: 'PASE',                         subtitulo: 'Precisión e Intención en la Entrega' },
  { key: 'conducta',     categoria: 'Técnica',  titulo: 'CONDUCCIÓN',                   subtitulo: 'Desplazamiento con Balón' },
  { key: 'dribling',     categoria: 'Técnica',  titulo: 'DRIBLING',                     subtitulo: 'Superación del Rival en 1vs1' },
  { key: 'remata',       categoria: 'Técnica',  titulo: 'REMATE',                       subtitulo: 'Potencia y Definición' },
  { key: 'cabeceo',      categoria: 'Técnica',  titulo: 'CABECEO',                      subtitulo: 'Juego Aéreo' },
  { key: 'quite',        categoria: 'Técnica',  titulo: 'QUITE DEL BALÓN',              subtitulo: 'Recuperación Defensiva' },
  { key: 'proteccion',   categoria: 'Técnica',  titulo: 'PROTECCIÓN DEL BALÓN',         subtitulo: 'Resguardo y Dominio' },
  { key: 'posicion',     categoria: 'Táctica',  titulo: 'UBICACIÓN ESPACIAL',           subtitulo: 'Posicionamiento y Orientación' },
  { key: 'vision',       categoria: 'Táctica',  titulo: 'VELOCIDAD DE PROCESAMIENTO',   subtitulo: 'Toma de Decisiones Rápida' },
  { key: 'defensa',      categoria: 'Táctica',  titulo: 'LECTURA DE ALTURAS Y ESPACIOS', subtitulo: 'Análisis del Terreno' },
  { key: 'amplitud',     categoria: 'Táctica',  titulo: 'AMPLITUD Y PROFUNDIDAD',       subtitulo: 'Uso del Espacio' },
  { key: 'transicion',   categoria: 'Táctica',  titulo: 'TRANSICIONES (ATAQUE-DEFENSA)', subtitulo: 'Cambio de Rol Ofensivo/Defensivo' },
  { key: 'superioridad', categoria: 'Táctica',  titulo: 'LECTURA DE SUPERIORIDAD (2vs1)', subtitulo: 'Situaciones de Ventaja Numérica' },
  { key: 'basculacion',  categoria: 'Táctica',  titulo: 'BASCULACIÓN Y COBERTURAS',     subtitulo: 'Desplazamiento Colectivo' },
  { key: 'trabajo',      categoria: 'Mental',   titulo: 'TRABAJO EN EQUIPO',            subtitulo: 'Compañerismo y Comunicación' },
  { key: 'disciplina',   categoria: 'Mental',   titulo: 'GESTIÓN DE LA FRUSTRACIÓN',    subtitulo: 'Autocontrol y Resiliencia' },
  { key: 'actitud',      categoria: 'Mental',   titulo: 'COMUNICACIÓN ASERTIVA',        subtitulo: 'Expresión y Asertividad' },
  { key: 'identidad',    categoria: 'Mental',   titulo: 'IDENTIDAD Y ESTILO DE JUEGO',  subtitulo: 'Coherencia y Modelo de Juego' },
  { key: 'bloque',       categoria: 'Mental',   titulo: 'BLOQUE Y COHESIÓN TÁCTICA',    subtitulo: 'Organización Colectiva' },
  { key: 'clima',        categoria: 'Mental',   titulo: 'CLIMA INTERNO Y COMUNICACIÓN', subtitulo: 'Ambiente y Vínculos del Grupo' },
  { key: 'gestionComp',  categoria: 'Mental',   titulo: 'GESTIÓN DE LA COMPETICIÓN',    subtitulo: 'Rendimiento Bajo Presión' },
];

// Textos POR DEFECTO por clave de fundamento
export const DESCRIPCIONES_DEFAULT: Record<string, Desc> = {
  fuerza: DESC_FUERZA, velocidad: DESC_VELOCIDAD, resistencia: DESC_RESISTENCIA,
  control: DESC_CONTROL, pase: DESC_PASE, conducta: DESC_CONDUCCION, dribling: DESC_DRIBLING,
  remata: DESC_REMATE, cabeceo: DESC_CABECEO, quite: DESC_QUITE, proteccion: DESC_PROTECCION,
  posicion: DESC_UBICACION, vision: DESC_VELOCIDAD_PROC, defensa: DESC_LECTURA_ALTURAS,
  amplitud: DESC_AMPLITUD, transicion: DESC_TRANSICION, superioridad: DESC_SUPERIORIDAD,
  basculacion: DESC_BASCULACION, trabajo: DESC_TRABAJO_EQUIPO, disciplina: DESC_GESTION_FRUSTRACION,
  actitud: DESC_COMUNICACION_ASERTIVA, identidad: DESC_IDENTIDAD_ESTILO, bloque: DESC_BLOQUE_COHESION,
  clima: DESC_CLIMA_INTERNO, gestionComp: DESC_GESTION_COMPETICION,
};

/** Lee los textos (por defecto + ediciones guardadas del admin) mezclados por fundamento y nivel. */
export async function getDescripcionesValoracion(): Promise<Record<string, Desc>> {
  let saved: Record<string, Desc> = {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.descripciones&select=data`, { headers: SB_HDR });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data && typeof d[0].data === 'object') saved = d[0].data as Record<string, Desc>;
    }
  } catch {}
  const out: Record<string, Desc> = {};
  for (const f of FUNDAMENTOS) {
    out[f.key] = { ...(DESCRIPCIONES_DEFAULT[f.key] ?? {}), ...(saved[f.key] ?? {}) };
  }
  return out;
}

/** Guarda los textos editados por el administrador. */
export async function saveDescripcionesValoracion(data: Record<string, Desc>): Promise<boolean> {
  return guardarFila('descripciones', data);
}

// ── Metadatos editables de cada componente (nombre, subtítulo, definición) ──
export interface FundMetaEdit { titulo: string; subtitulo: string; definicion: string; }

/** Lee los metadatos de los componentes (por defecto + ediciones del admin). */
export async function getMetaValoracion(): Promise<Record<string, FundMetaEdit>> {
  let saved: Record<string, Partial<FundMetaEdit>> = {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.meta&select=data`, { headers: SB_HDR });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data && typeof d[0].data === 'object') saved = d[0].data as Record<string, Partial<FundMetaEdit>>;
    }
  } catch {}
  const out: Record<string, FundMetaEdit> = {};
  for (const f of FUNDAMENTOS) {
    const s = saved[f.key] ?? {};
    out[f.key] = {
      titulo:     (s.titulo     ?? f.titulo)    || f.titulo,
      subtitulo:  (s.subtitulo  ?? f.subtitulo) || f.subtitulo,
      definicion: s.definicion  ?? '',
    };
  }
  return out;
}

/** Guarda los metadatos editados de los componentes. */
export async function saveMetaValoracion(data: Record<string, FundMetaEdit>): Promise<boolean> {
  return guardarFila('meta', data);
}

// ── Nombres editables de los COMPONENTES del informe ──
// Las CLAVES coinciden con los títulos de categoría que usa la Valoración Dinámica,
// para poder buscarlos directamente por título.
export const COMPONENTES: { key: string; nombre: string }[] = [
  { key: 'Físico',               nombre: 'Físico' },
  { key: 'Técnica',              nombre: 'Técnico' },
  { key: 'Táctica',              nombre: 'Táctico' },
  { key: 'Mental y Actitudinal', nombre: 'Mental' },
  { key: 'Comportamiento',       nombre: 'Comportamental' },
  { key: 'Trabajo en Equipo',    nombre: 'Grupal' },
];

/** Lee los nombres editables de los componentes (por defecto = el nombre base). */
export async function getCategoriasValoracion(): Promise<Record<string, string>> {
  let saved: Record<string, string> = {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.categorias&select=data`, { headers: SB_HDR });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data && typeof d[0].data === 'object') saved = d[0].data as Record<string, string>;
    }
  } catch {}
  const out: Record<string, string> = {};
  for (const c of COMPONENTES) {
    const s = (saved[c.key] ?? '').toString().trim();
    out[c.key] = s || c.nombre;
  }
  return out;
}

/** Guarda los nombres editados de las categorías. */
export async function saveCategoriasValoracion(data: Record<string, string>): Promise<boolean> {
  return guardarFila('categorias', data);
}


/* ═══════════════════════════════════════════════════════════════════════════
   FORMATO DE PORTERO
   (dirección, 03/09/2026 — «este sería para los porteros. En gestión de
    valoración debe estar separado el de jugador de campo y portería. Cuando
    en la posición del jugador aparece que portero, le debe aparecer este
    informe»)

   El portero no se evalúa con lo mismo que un jugador de campo: no se le mide
   el dribling ni el cabeceo, se le mide el blocaje, la estirada, el achique y
   el juego aéreo. Son 22 componentes en vez de 34.

   LO QUE **NO** CAMBIA — el encabezado del informe (foto, nombre, programa,
   proyecto, posición, perfil), el diseño, los colores, el aspecto
   comportamental y el desempeño colectivo del equipo. Es el mismo informe de
   siempre; lo único distinto son los nombres de los componentes y los textos
   de cada nivel.

   NO SE TOCÓ LA BASE. Los 22 componentes del portero se guardan en las MISMAS
   casillas que ya existen para el jugador de campo —que tiene 34 y sobran
   tres—, así que no hay que crear ni una columna. La tabla de equivalencias
   es la de abajo: `fuerza` guarda la Fuerza Explosiva del portero, `control`
   guarda el Blocaje, y así.

   Los textos salen tal cual del Excel que mandó la dirección el 03/09/2026.
   ═══════════════════════════════════════════════════════════════════════════ */

const GK_FUERZA: Desc = {
  'Nivel 1 (Iniciación)': 'Demuestra poca fuerza de empuje en el tren inferior; sus saltos son bajos y su zancada es pesada al intentar desplazarse para una estirada.',
  'Nivel 2 (En Desarrollo)': 'Muestra intenciones de despegar con fuerza, pero carece de la potencia necesaria para sostenerse en el aire o reaccionar ante tiros colocados a media altura.',
  'Nivel 3 (Competente)': 'Posee una potencia de salto acorde a su edad. Logra elevarse lo suficiente para ganar balones divididos y dar un impulso efectivo para atajadas de nivel medio.',
  'Nivel 4 (Avanzado)': 'Su fuerza explosiva le permite realizar saltos potentes y arranques rápidos desde la posición de guardameta, marcando diferencia en balones difíciles.',
  'Nivel 5 (Dominante)': 'Cuenta con una capacidad de despegue y potencia muscular sobresalientes; su batida inicial es sumamente destructiva, permitiéndole flotar y colgarse de balones que parecen inalcanzables.',
};
const GK_VELOCIDAD: Desc = {
  'Nivel 1 (Iniciación)': 'Su tiempo de respuesta ante los disparos es lento; suele reaccionar cuando el balón ya ha pasado su línea corporal o ha ingresado al arco.',
  'Nivel 2 (En Desarrollo)': 'Reacciona bien a tiros frontales y lejanos, pero se ve superado fácilmente ante desvíos inesperados en el camino, rebotes cercanos o remates a quemarropa.',
  'Nivel 3 (Competente)': 'Muestra un tiempo de reacción adecuado. Logra desviar balones potentes de media distancia y responde con efectividad ante segundas jugadas en el área chica.',
  'Nivel 4 (Avanzado)': 'Sus reflejos son excelentes; es capaz de sacar manos o pies milagrosos ante tiros inesperados a corta distancia o balones que se desvían en los defensores.',
  'Nivel 5 (Dominante)': 'Posee una velocidad de respuesta intuitiva y felina. Sus reacciones en fracciones de segundo resuelven jugadas de gol inminentes, manteniendo una concentración total.',
};
const GK_RESISTENCIA: Desc = {
  'Nivel 1 (Iniciación)': 'Se muestra descoordinado en sus desplazamientos laterales (cruza las piernas); una vez que cae al suelo tras una atajada, le toma demasiado tiempo ponerse de pie.',
  'Nivel 2 (En Desarrollo)': 'Ejecuta los pasos de lado a lado con dificultad. Si da un rebote, su reincorporación no es lo suficientemente rápida para tapar la segunda opción de tiro.',
  'Nivel 3 (Competente)': 'Se desplaza con agilidad lateral usando pasos cortos sin cruzarse. Se levanta del suelo con una velocidad aceptable para continuar en la jugada defensiva.',
  'Nivel 4 (Avanzado)': 'Muestra una gran coordinación motriz; encadena desplazamientos, giros y caídas con fluidez. Su velocidad para reincorporarse del piso tras volar es sumamente rápida.',
  'Nivel 5 (Dominante)': 'Es extremadamente ágil y elástico; maneja sus apoyos corporales a la perfección, lo que le permite corregir la posición a mitad de camino y levantarse al instante como un resorte.',
};
const GK_CONTROL: Desc = {
  'Nivel 1 (Iniciación)': 'Presenta serias dificultades para agarrar balones frontales directos. Suele dar rebotes peligrosos al centro del área por falta de fuerza en los dedos o una mala postura de las manos (no arma la "W" o la canasta).',
  'Nivel 2 (En Desarrollo)': 'Logra blocar balones suaves o pausados, pero muestra mucha inseguridad y pierde el control del esférico ante remates que llevan un poco de potencia o balones rasos que rebotan antes de llegar.',
  'Nivel 3 (Competente)': 'Asegura con firmeza los balones frontales y aéreos de intensidad media. Absorbe de manera adecuada el impacto protegiendo el balón contra el pecho (embolse) en tiros complicados.',
  'Nivel 4 (Avanzado)': 'Domina el blocaje en situaciones dinámicas y a media distancia. Sus manos son firmes, rara vez otorga segundas oportunidades y transmite seguridad a su línea defensiva.',
  'Nivel 5 (Dominante)': 'Cuenta con una técnica de agarre perfecta y magnética. Minimiza los rebotes al 100%, logrando blocar balones sumamente potentes, cruzados o con efectos difíciles en máxima velocidad.',
};
const GK_PASE: Desc = {
  'Nivel 1 (Iniciación)': 'Cuando no puede agarrar el balón, suele meter las manos flojas o rígidas, dejando la pelota muerta dentro del área chica a merced de los delanteros rivales.',
  'Nivel 2 (En Desarrollo)': 'Intenta desviar los remates colocados, pero la dirección del rechazo suele ser defectuosa (hacia el centro de la cancha) o desvía con una sola mano cuando la jugada exigía usar ambas.',
  'Nivel 3 (Competente)': 'Utiliza las palmas o los puños con la fuerza justa para desviar el balón hacia las bandas o por encima del travesaño, alejando el peligro inmediato del arco en situaciones de intensidad media.',
  'Nivel 4 (Avanzado)': 'Muestra una excelente toma de decisiones para desviar balones cuando el blocaje es riesgoso. Dirige sus rechazos intencionalmente hacia las esquinas del campo o zonas libres de atacantes.',
  'Nivel 5 (Dominante)': 'Sus desvíos son un recurso defensivo de alto nivel. Tiene la fuerza y los reflejos para cambiar por completo la trayectoria de tiros rasos o a quemarropa, mandándolos lejos del peligro con una técnica impecable (mano cambiada o palmeo tenso).',
};
const GK_CONDUCTA: Desc = {
  'Nivel 1 (Iniciación)': 'Intenta alcanzar los balones desde una posición completamente estática. No realiza pasos previos de aproximación ni utiliza el pie de apoyo para impulsarse, lo que limita su cobertura a tiros muy cercanos a su cuerpo',
  'Nivel 2 (En Desarrollo)': 'Muestra intenciones de lanzarse hacia balones colocados, pero su batida o empuje de piernas es corto. Le cuesta llegar a los balones que van a las esquinas inferiores o a los ángulos superiores del arco.',
  'Nivel 3 (Competente)': 'Utiliza los pasos de ajuste de forma adecuada antes de iniciar el vuelo. Logra un impulso efectivo que le permite llegar a balones colocados a media distancia en situaciones de intensidad media.',
  'Nivel 4 (Avanzado)': 'Domina la técnica de batida con ambas piernas. Utiliza la "mano cambiada" de forma natural y fluida para llegar a balones con trayectorias complejas o muy colgados en los ángulos',
  'Nivel 5 (Dominante)': 'Posee un alcance y una potencia de vuelo sobresalientes. Su lectura del tiro y su explosividad en el despegue le permiten cubrir la totalidad de la portería, logrando estiradas determinantes y sumamente estéticas.',
};
const GK_DRIBLING: Desc = {
  'Nivel 1 (Iniciación)': 'Se siente muy incómodo si le devuelven el balón; su técnica de control es deficiente y suele despejar sin dirección bajo presión.',
  'Nivel 2 (En Desarrollo)': 'Sirve como opción de pase atrás solo si no tiene marca cerca. Su golpeo en largo (saques de meta o de volea) carece de precisión y altura.',
  'Nivel 3 (Competente)': 'Controla y perfila de forma adecuada con su pierna hábil. Ejecuta pases rasos seguros en salida corta y logra envíos largos que alcanzan la zona media del campo',
  'Nivel 4 (Avanzado)': 'Maneja la salida con ambos perfiles ante presiones moderadas. Sus saques de volea o sobrepique tienen buena trayectoria, facilitando el inicio de las transiciones.',
  'Nivel 5 (Dominante)': 'Actúa como un líbero en la salida de balón; inicia el juego ofensivo con pases tensos entre líneas, rompe presiones con tranquilidad y sus saques largos van dirigidos al espacio del compañero.',
};
const GK_REMATA: Desc = {
  'Nivel 1 (Iniciación)': 'Cae de forma incorrecta e insegura (golpeando bruscamente la espalda o las rodillas directamente contra el suelo). Esto le genera temor al lanzarse y provoca que tarde demasiado tiempo en ponerse de pie.',
  'Nivel 2 (En Desarrollo)': 'Intenta amortiguar el impacto con las zonas laterales del cuerpo, pero su caída sigue siendo descontrolada. Si la jugada da un rebote, se le dificulta armar los apoyos rápidamente para levantarse.',
  'Nivel 3 (Competente)': 'Aplica la técnica de caída lateral de manera segura, distribuyendo el impacto de forma secuencial (pie, pantorrilla, muslo, tronco) para no lastimarse. Se reincorpora con una velocidad aceptable para la categoría.',
  'Nivel 4 (Avanzado)': 'Absorbe el golpe contra el suelo con total naturalidad y control, manteniendo el balón protegido. Su técnica de reincorporación es ágil, permitiéndole quedar de pie casi de inmediato para afrontar una segunda jugada.',
  'Nivel 5 (Dominante)': 'Su técnica de amortiguación es perfecta, pareciendo que el suelo no tuviera impacto. Funciona como un resorte: tras el vuelo y la caída, aprovecha la misma inercia para ponerse en pie de forma instantánea y reactiva ante cualquier peligro.',
};
const GK_POSICION: Desc = {
  'Nivel 1 (Iniciación)': 'Se queda estático bajo los tres palos sin importar dónde esté el balón en el campo; suele perder la noción del centro de su arco y deja pasillos evidentes.',
  'Nivel 2 (En Desarrollo)': 'Acompaña el movimiento del juego de manera tardía. Le cuesta ajustar su altura (adelantarse o retroceder) cuando el equipo rival avanza en bloque.',
  'Nivel 3 (Competente)': 'Se posiciona correctamente en su zona de arco en situaciones estándar de ataque frontal y sabe cuándo retroceder a la línea de meta si el peligro es inminente',
  'Nivel 4 (Avanzado)': 'Ajusta su posición de manera dinámica según el bloque del equipo. Sabe jugar adelantado cuando atacamos y se recoloca rápido si sufrimos una pérdida.',
  'Nivel 5 (Dominante)': 'Su ubicación es impecable y predictiva. Maneja los espacios del área con total orientación espacial, haciendo que los ataques rivales siempre parezcan controlados.',
};
const GK_VISION: Desc = {
  'Nivel 1 (Iniciación)': 'No comprende el concepto de la bisectriz; se para muy pegado a un poste o deja el segundo palo totalmente descubierto ante tiros cruzados.',
  'Nivel 2 (En Desarrollo)': 'Intenta tapar el ángulo de tiro, pero sus ajustes de pasos laterales son imprecisos, quedando mal perfilado frente a remates desde los costados del área.',
  'Nivel 3 (Competente)': 'Se posiciona adecuadamente sobre la línea imaginaria de la bisectriz en remates frontales y diagonales de media distancia, reduciendo el arco visible para el delantero.',
  'Nivel 4 (Avanzado)': 'Domina la reducción de ángulos de tiro en situaciones dinámicas. Ajusta sus perfiles corporales al milímetro según la pierna hábil del rematador rival.',
  'Nivel 5 (Dominante)': 'Cierra los ángulos de tiro de forma matemática y asfixiante. Obliga de manera sistemática al delantero a tirar el balón hacia donde el portero tiene la ventaja táctica.',
};
const GK_DEFENSA: Desc = {
  'Nivel 1 (Iniciación)': 'Tras blocar o recuperar un balón, se apresura y lo regala de inmediato tirándolo al azar, o se demora tanto que permite que el rival se repliegue por completo.',
  'Nivel 2 (En Desarrollo)': 'Busca iniciar el contraataque, pero su lectura es deficiente; suele elegir al compañero que está más presionado o lanza balones largos sin ventaja real.',
  'Nivel 3 (Competente)': 'Identifica con claridad cuándo jugar rápido con las manos/pies para iniciar una transición o cuándo asegurar la pelota en corto para darle respiro al equipo.',
  'Nivel 4 (Avanzado)': 'Inicia transiciones rápidas con mucha ventaja táctica; detecta de inmediato al compañero libre en banda y ejecuta saques tensos que rompen la primera línea de presión rival.',
  'Nivel 5 (Dominante)': 'Es el primer atacante del equipo. Lanza contragolpes letales y precisos con una lectura de juego de nivel profesional, administrando los tiempos del partido a su antojo.',
};
const GK_AMPLITUD: Desc = {
  'Nivel 1 (Iniciación)': 'Se niega rotundamente a salir de su área chica; ignora por completo los balones largos que caen a la espalda de sus defensas centrales.',
  'Nivel 2 (En Desarrollo)': 'Muestra intenciones de actuar como líbero ante pases largos del rival, pero duda en la salida, quedando a mitad de camino y desprotegiendo su arco de forma peligrosa.',
  'Nivel 3 (Competente)': 'Lee de forma adecuada los pelotazos largos y frontales del rival; sale con decisión a despejar o controlar el balón fuera de su área si sus defensas están superados.',
  'Nivel 4 (Avanzado)': 'Mide con gran timing las trayectorias de los pases en profundidad del oponente; actúa con anticipación y frialdad para interceptar balones de peligro lejos de su arco.',
  'Nivel 5 (Dominante)': 'Domina el concepto de portero-líbero a la perfección. Da cobertura total a su línea defensiva, anticipa pases al espacio con velocidad y resuelve situaciones de riesgo extremo con los pies.',
};
const GK_TRANSICION: Desc = {
  'Nivel 1 (Iniciación)': 'No organiza la barrera en tiros libres directos ni asigna marcas en tiros de esquina; se limita a pararse en la línea sin liderazgo táctico.',
  'Nivel 2 (En Desarrollo)': 'Intenta armar la barrera o dar indicaciones en los córners, pero lo hace de manera tímida o desorganizada, dejando huecos evidentes en la estructura defensiva.',
  'Nivel 3 (Competente)': 'Coloca el número de jugadores adecuado en la barrera tomando el poste como referencia y distribuye las marcas básicas de sus compañeros en las acciones de tiro de esquina.',
  'Nivel 4 (Avanzado)': 'Organiza con autoridad y voz fuerte el balón parado (marcas mixtas, hombres al poste). Se ubica en el punto óptimo para tener visión total del balón y reaccionar.',
  'Nivel 5 (Dominante)': 'Dicta cátedra en la organización táctica de la estrategia ABP (Acciones a Balón Parado). Minimiza las fallas defensivas del equipo mediante un liderazgo absoluto y una colocación defensiva perfecta.',
};
const GK_SUPERIORIDAD: Desc = {
  'Nivel 1 (Iniciación)': 'Permanece amarrado a la línea de gol en los centros de esquina o faltas laterales; muestra temor a salir del área chica a disputar el balón.',
  'Nivel 2 (En Desarrollo)': 'Intenta salir a cortar centros, pero calcula mal la trayectoria o velocidad del balón, quedando a mitad de camino ("pagando") en balones aéreos',
  'Nivel 3 (Competente)': 'Sale con decisión a cortar balones aéreos dentro del área chica. Utiliza el cuerpo para protegerse en el salto y logra rechazar con los puños o blocar con relativo éxito.',
  'Nivel 4 (Avanzado)': 'Domina el juego aéreo en toda el área de meta; salta con la rodilla arriba para protegerse en el aire y toma decisiones acertadas entre blocar el esférico o despejarlo con potencia.',
  'Nivel 5 (Dominante)': 'Es el dueño absoluto del juego aéreo en el área grande. Transmite total autoridad en los centros, impone su físico limpiamente y corta jugadas de peligro sistemáticamente.',
};
const GK_BASCULACION: Desc = {
  'Nivel 1 (Iniciación)': 'Tiende a quedarse estático en la línea de meta o sale corriendo sin control hacia el delantero, regalando el arco fácilmente en los duelos individuales.',
  'Nivel 2 (En Desarrollo)': 'Muestra intención de achicar saliendo hacia el rival, pero se "regala" antes de tiempo o va al piso de manera precipitada, permitiendo regates largos del atacante.',
  'Nivel 3 (Competente)': 'Logra aguantar la posición de pie el tiempo justo, reduciendo el ángulo de tiro del delantero y ganando duelos de intensidad media al temporizar la salida.',
  'Nivel 4 (Avanzado)': 'Domina el juego de piernas en el achique, utiliza técnicas corporales correctas (como la posición en cruz o el bloqueo de fútbol sala) y gana la mayoría de los duelos individuales.',
  'Nivel 5 (Dominante)': 'Es una muralla en el mano a mano; lee perfectamente el ritmo del delantero, se hace gigante cerrando espacios a toda velocidad y mantiene la calma mental para desarmar al rival con autoridad.',
};
const GK_TRABAJO: Desc = {
  'Nivel 1 (Iniciación)': 'Juega de forma individualista; le cuesta seguir instrucciones grupales.',
  'Nivel 2 (En Desarrollo)': 'Empieza a colaborar con compañeros cercanos; acepta las reglas',
  'Nivel 3 (Competente)': 'Muestra compañerismo; acepta críticas constructivas y apoya al equipo.',
  'Nivel 4 (Avanzado)': 'Liderazgo positivo; se comunica activamente para ayudar al grupo.',
  'Nivel 5 (Dominante)': 'Referente dentro y fuera del campo; gestiona la frustración y motiva al resto.',
};
const GK_DISCIPLINA: Desc = {
  'Nivel 1 (Iniciación)': 'Se desmorona anímicamente al recibir un gol o cometer un error técnico; agacha la cabeza y pierde la confianza por completo durante el resto del encuentro.',
  'Nivel 2 (En Desarrollo)': 'Muestra frustración evidente tras una mala jugada; aunque intenta continuar, su lenguaje corporal denota inseguridad, lo que afecta sus decisiones posteriores.',
  'Nivel 3 (Competente)': 'Acepta el error o el gol encajado como parte del juego. Muestra madurez para pasar la página rápido y mantiene un nivel de concentración adecuado.',
  'Nivel 4 (Avanzado)': 'Gestiona la frustración con un gran control emocional; tras un fallo, redobla su concentración, transmite tranquilidad a sus compañeros y no permite que afecte su rendimiento.',
  'Nivel 5 (Dominante)': 'Posee una mente inquebrantable; los errores o goles en contra no merman su seguridad. Se crece ante la adversidad y contagia tranquilidad y firmeza a todo el grupo en momentos críticos.',
};
const GK_ACTITUD: Desc = {
  'Nivel 1 (Iniciación)': 'Es completamente silencioso durante los entrenamientos y partidos; no da indicaciones a sus defensas ni reclama balones que son de su total autoría.',
  'Nivel 2 (En Desarrollo)': 'Habla ocasionalmente, pero sus indicaciones son tímidas o llegan tarde, sin generar un impacto real en el ordenamiento de la zaga defensiva.',
  'Nivel 3 (Competente)': 'Se comunica de forma activa para ordenar la línea defensiva en jugadas en movimiento y avisa con voz fuerte ("¡MÍA!" / "¡PORTERO!") al salir a cortar balones.',
  'Nivel 4 (Avanzado)': 'Ejerce un liderazgo positivo constante; organiza con autoridad la barrera en tiros libres y asigna las marcas de forma clara en los tiros de esquina o faltas en contra.',
  'Nivel 5 (Dominante)': 'Es el verdadero director técnico dentro de la cancha; guía, ordena y motiva a todo el equipo desde atrás con una comunicación clara, asertiva y una presencia imponente.',
};
const GK_IDENTIDAD: Desc = {
  'Nivel 1 (Iniciación)': 'No hay un estilo claro; el equipo juega al azar y depende de individualidades',
  'Nivel 2 (En Desarrollo)': 'Se intentan seguir algunas ideas del DT, pero el equipo pierde la forma rápidamente',
  'Nivel 3 (Competente)': 'El equipo tiene una idea clara (ej: salir jugando, presionar alto) y la mantiene gran parte del tiempo.',
  'Nivel 4 (Avanzado)': 'Estilo de juego definido y reconocible. Los jugadores saben a qué juegan incluso en situaciones difíciles.',
  'Nivel 5 (Dominante)': 'El equipo domina múltiples variantes tácticas y tiene una identidad inquebrantable sin importar el rival.',
};
const GK_BLOQUE: Desc = {
  'Nivel 1 (Iniciación)': 'Equipo "partido" o estirado; mucha distancia entre defensas y delanteros.',
  'Nivel 2 (En Desarrollo)': 'Hay intentos de moverse juntos, pero se generan huecos grandes al defender o atacar.',
  'Nivel 3 (Competente)': 'El equipo se mueve como un bloque; hay ayudas mutuas y las líneas mantienen distancias correctas.',
  'Nivel 4 (Avanzado)': 'Basculaciones y coberturas automáticas. El equipo se encoge y se estira con mucha fluidez.',
  'Nivel 5 (Dominante)': 'Unidad total; el bloque se mueve de forma coordinada y asfixiante. Compacto en todas sus líneas.',
};
const GK_CLIMA: Desc = {
  'Nivel 1 (Iniciación)': 'Hay discusiones frecuentes, reproches ante el error o silencio absoluto.',
  'Nivel 2 (En Desarrollo)': 'La comunicación es escasa o solo ocurre cuando van ganando. Hay subgrupos marcados.',
  'Nivel 3 (Competente)': 'Comunicación funcional y positiva. Se alientan entre sí y aceptan las correcciones del líder/DT.',
  'Nivel 4 (Avanzado)': 'Existe un lenguaje común en el campo; se apoyan en los momentos críticos y celebran el éxito ajeno.',
  'Nivel 5 (Dominante)': 'Fraternidad y resiliencia. El equipo es una familia donde la confianza permite máxima exigencia sin conflicto.',
};
const GK_GESTIONCOMP: Desc = {
  'Nivel 1 (Iniciación)': 'Se desmoronan ante el primer gol en contra; falta de orden en la adversidad.',
  'Nivel 2 (En Desarrollo)': 'Compiten bien a ratos, pero pierden la concentración en los minutos finales o tras errores.',
  'Nivel 3 (Competente)': 'Equipo competitivo que lucha hasta el final, manteniendo la calma y el orden la mayor parte del tiempo',
  'Nivel 4 (Avanzado)': 'Gran madurez competitiva; saben manejar los tiempos del partido (cuándo acelerar y cuándo pausar).',
  'Nivel 5 (Dominante)': 'Mentalidad ganadora colectiva; el equipo crece en la dificultad y gestiona la presión con absoluta seguridad.',
};


/** Los 22 componentes del portero, en el orden del formato.
 *  La `key` es la MISMA del jugador de campo a propósito: así se guarda en la
 *  casilla que ya existe y no hay que tocar la base. */
export const FUNDAMENTOS_PORTERO: FundamentoMeta[] = [
  { key: 'fuerza',       categoria: 'Físico',  titulo: 'FUERZA EXPLOSIVA',              subtitulo: 'Potencia de Salto' },
  { key: 'velocidad',    categoria: 'Físico',  titulo: 'VELOCIDAD DE REACCIÓN',         subtitulo: 'Reflejos' },
  { key: 'resistencia',  categoria: 'Físico',  titulo: 'AGILIDAD Y COORDINACIÓN',       subtitulo: 'Desplazamientos y Reincorporación' },
  { key: 'control',      categoria: 'Técnica', titulo: 'BLOCAJE',                       subtitulo: 'Seguridad y Agarre' },
  { key: 'pase',         categoria: 'Técnica', titulo: 'DESVÍO',                        subtitulo: 'Rechazo y Dirección' },
  { key: 'conducta',     categoria: 'Técnica', titulo: 'ESTIRADA',                      subtitulo: 'Impulso y Alcance' },
  { key: 'dribling',     categoria: 'Técnica', titulo: 'JUEGO DE PIES',                 subtitulo: 'Distribución' },
  { key: 'remata',       categoria: 'Técnica', titulo: 'CAÍDA Y REINCORPORACIÓN',       subtitulo: 'Amortiguación y Segunda Jugada' },
  { key: 'posicion',     categoria: 'Táctica', titulo: 'UBICACIÓN POSICIONAL',          subtitulo: 'Macro-colocación' },
  { key: 'vision',       categoria: 'Táctica', titulo: 'ÁNGULO Y BISECTRIZ',            subtitulo: 'Micro-colocación de Tiro' },
  { key: 'defensa',      categoria: 'Táctica', titulo: 'TRANSICIÓN OFENSIVA',           subtitulo: 'Decisiones tras Recuperar' },
  { key: 'amplitud',     categoria: 'Táctica', titulo: 'CONTROL DEL ESPACIO DEFENSIVO', subtitulo: 'Rol de Líbero' },
  { key: 'transicion',   categoria: 'Táctica', titulo: 'GESTIÓN DEL BALÓN PARADO',      subtitulo: 'Organización Táctica' },
  { key: 'superioridad', categoria: 'Táctica', titulo: 'JUEGO AÉREO',                   subtitulo: 'Salidas' },
  { key: 'basculacion',  categoria: 'Táctica', titulo: 'FASE DE ACHIQUE',               subtitulo: '1vs1' },
  { key: 'trabajo',      categoria: 'Mental',  titulo: 'TRABAJO EN EQUIPO',             subtitulo: 'Compañerismo y Comunicación' },
  { key: 'disciplina',   categoria: 'Mental',  titulo: 'RESILIENCIA',                   subtitulo: 'Gestión del Error' },
  { key: 'actitud',      categoria: 'Mental',  titulo: 'LIDERAZGO Y COMUNICACIÓN',      subtitulo: 'Voz de Mando desde el Arco' },
  { key: 'identidad',    categoria: 'Mental',  titulo: 'IDENTIDAD Y ESTILO DE JUEGO',   subtitulo: 'Coherencia y Modelo de Juego' },
  { key: 'bloque',       categoria: 'Mental',  titulo: 'BLOQUE Y COHESIÓN TÁCTICA',     subtitulo: 'Organización Colectiva' },
  { key: 'clima',        categoria: 'Mental',  titulo: 'CLIMA INTERNO Y COMUNICACIÓN',  subtitulo: 'Ambiente y Vínculos del Grupo' },
  { key: 'gestionComp',  categoria: 'Mental',  titulo: 'GESTIÓN DE LA COMPETICIÓN',     subtitulo: 'Rendimiento Bajo Presión' },
];

export const DESCRIPCIONES_PORTERO_DEFAULT: Record<string, Desc> = {
  fuerza: GK_FUERZA, velocidad: GK_VELOCIDAD, resistencia: GK_RESISTENCIA,
  control: GK_CONTROL, pase: GK_PASE, conducta: GK_CONDUCTA,
  dribling: GK_DRIBLING, remata: GK_REMATA,
  posicion: GK_POSICION, vision: GK_VISION, defensa: GK_DEFENSA,
  amplitud: GK_AMPLITUD, transicion: GK_TRANSICION, superioridad: GK_SUPERIORIDAD,
  basculacion: GK_BASCULACION,
  trabajo: GK_TRABAJO, disciplina: GK_DISCIPLINA, actitud: GK_ACTITUD,
  identidad: GK_IDENTIDAD, bloque: GK_BLOQUE, clima: GK_CLIMA,
  gestionComp: GK_GESTIONCOMP,
};

/* ── CUÁL DE LOS DOS FORMATOS ─────────────────────────────────────────── */

export type FormatoValoracion = 'campo' | 'portero';

/** ¿La posición del deportista dice portero? Se aceptan las cuatro maneras en
 *  que se escribe en la academia: portero, arquero, golero y guardameta. */
export function esPosicionPortero(posicion: string | null | undefined): boolean {
  return /portero|arquer|golero|guardameta/i.test(String(posicion ?? ''));
}

export function formatoDePosicion(posicion: string | null | undefined): FormatoValoracion {
  return esPosicionPortero(posicion) ? 'portero' : 'campo';
}

/** Los componentes del formato que toque. */
export function fundamentosDe(formato: FormatoValoracion): FundamentoMeta[] {
  return formato === 'portero' ? FUNDAMENTOS_PORTERO : FUNDAMENTOS;
}

/** Los textos de fábrica del formato que toque. */
export function descripcionesDefaultDe(formato: FormatoValoracion): Record<string, Desc> {
  return formato === 'portero' ? DESCRIPCIONES_PORTERO_DEFAULT : DESCRIPCIONES_DEFAULT;
}

/* Cada formato guarda sus ediciones en su propia fila de `config_valoracion`:
   los textos del portero no pisan los del jugador de campo aunque compartan
   la misma casilla en la base. */
const FILA_DESC = (f: FormatoValoracion) => f === 'portero' ? 'descripciones_portero' : 'descripciones';
const FILA_META = (f: FormatoValoracion) => f === 'portero' ? 'meta_portero'          : 'meta';

/** Lee los textos del formato pedido: los de fábrica más lo que haya editado
 *  la dirección en Gestión de Valoración. */
export async function getDescripcionesDe(formato: FormatoValoracion): Promise<Record<string, Desc>> {
  let saved: Record<string, Desc> = {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.${FILA_DESC(formato)}&select=data`, { headers: SB_HDR });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data && typeof d[0].data === 'object') saved = d[0].data as Record<string, Desc>;
    }
  } catch { /* sin conexión: quedan los de fábrica */ }
  const base = descripcionesDefaultDe(formato);
  const out: Record<string, Desc> = {};
  for (const f of fundamentosDe(formato)) {
    out[f.key] = { ...(base[f.key] ?? {}), ...(saved[f.key] ?? {}) };
  }
  return out;
}

export async function saveDescripcionesDe(formato: FormatoValoracion, data: Record<string, Desc>): Promise<boolean> {
  return guardarFila(FILA_DESC(formato), data);
}

/** Nombre, subtítulo y definición de cada componente, del formato pedido. */
export async function getMetaDe(formato: FormatoValoracion): Promise<Record<string, FundMetaEdit>> {
  let saved: Record<string, Partial<FundMetaEdit>> = {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.${FILA_META(formato)}&select=data`, { headers: SB_HDR });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data && typeof d[0].data === 'object') saved = d[0].data as Record<string, Partial<FundMetaEdit>>;
    }
  } catch { /* sin conexión: quedan los de fábrica */ }
  const out: Record<string, FundMetaEdit> = {};
  for (const f of fundamentosDe(formato)) {
    const s = saved[f.key] ?? {};
    out[f.key] = {
      titulo:     (s.titulo    ?? f.titulo)    || f.titulo,
      subtitulo:  (s.subtitulo ?? f.subtitulo) || f.subtitulo,
      definicion: s.definicion ?? '',
    };
  }
  return out;
}

export async function saveMetaDe(formato: FormatoValoracion, data: Record<string, FundMetaEdit>): Promise<boolean> {
  return guardarFila(FILA_META(formato), data);
}
