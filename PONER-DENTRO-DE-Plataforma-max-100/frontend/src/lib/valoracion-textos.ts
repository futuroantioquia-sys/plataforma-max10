// ─────────────────────────────────────────────────────────────
//  Textos de los niveles de cada fundamento de la Valoración Deportiva.
//  Estos son los valores POR DEFECTO. El administrador puede editarlos en
//  el módulo "Gestión de Valoración" y quedan guardados en Supabase
//  (tabla config_valoracion, fila 'descripciones'). El formulario del
//  formador usa estos textos para autocompletar la descripción de cada nivel.
// ─────────────────────────────────────────────────────────────

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

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
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.descripciones`, {
      method: 'PATCH',
      headers: { ...SB_HDR, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
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
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.meta`, {
      method: 'PATCH',
      headers: { ...SB_HDR, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
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
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_valoracion?id=eq.categorias`, {
      method: 'PATCH',
      headers: { ...SB_HDR, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}
