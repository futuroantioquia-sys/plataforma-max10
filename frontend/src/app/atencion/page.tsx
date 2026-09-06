'use client';

/**
 * MOTOR DE ATENCIÓN POR WHATSAPP  ·  Futuro Antioquia — MAX 10 SPORT
 *
 * (dirección, 04/09/2026 — «vamos a crear un motor de atención al cliente vía
 *  WhatsApp». Alcance escogido: SOLO INFORMAR. El motor no toca la cuenta de
 *  ningún deportista. Y ante cualquier duda, pasa a una persona.)
 *
 * ── POR QUÉ ESTE MOTOR NO ADIVINA ─────────────────────────────────────────
 * Un contestador que "inventa" en una academia con 975 familias es un
 * problema, no una ayuda: basta que le diga un valor equivocado a un papá para
 * que eso se vuelva un reclamo. Por eso este motor NO redacta: solo repite
 * respuestas que la dirección escribió, palabra por palabra.
 *
 * Funciona así, y no de otra forma:
 *   1. Llega un mensaje.
 *   2. Se le buscan PALABRAS CLAVE (sin tildes, sin mayúsculas).
 *   3. Si una respuesta coincide, se manda TAL CUAL está escrita aquí.
 *   4. Si NINGUNA coincide —o si el mensaje suena a reclamo— NO se responde:
 *      se pasa a una persona. Esa es la regla número dos del brief.
 *
 * ── QUÉ ES ESTA PANTALLA ──────────────────────────────────────────────────
 * Es el cerebro y el banco de pruebas, antes de conectar el WhatsApp de
 * verdad. Aquí la dirección escribe las respuestas y las prueba escribiendo
 * como si fuera un papá. Cuando el número quede conectado, el WhatsApp usará
 * exactamente este mismo cerebro, sin tocar nada.
 *
 * Todo se guarda en `config_cobro`, el cajón de configuraciones. No se creó
 * ninguna tabla nueva.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Save, Send, MessageCircle, AlertTriangle, Search } from 'lucide-react';

/* La paleta de la plataforma */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const VERDECL= '#5BE39B';
const AMBAR  = '#E0A33A';
const ROJO   = '#C0504D';
const GRIS   = '#7C879A';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const HDR = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};
const ID_CONFIG = 'atencion_whatsapp';

/* ── Una respuesta del motor ──────────────────────────────────────────────
   `claves` son las palabras por las que se reconoce la pregunta. Se escriben
   separadas por coma. No importan tildes ni mayúsculas. */
interface Respuesta {
  id: string;
  tema: string;          // cómo se llama, para la dirección
  claves: string;        // "valor, precio, cuanto vale, cuanto cuesta"
  texto: string;         // lo que se le manda al papá, tal cual
  activa: boolean;
}

/** Quita tildes y mayúsculas: "CUÁNTO" y "cuanto" son la misma palabra. */
const pelar = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();

/* ── LO QUE NUNCA CONTESTA EL MOTOR ───────────────────────────────────────
   Si el mensaje trae una de estas, no se responde nada automático: va derecho
   a una persona. Son los temas donde una respuesta de máquina hace daño. */
const A_UNA_PERSONA = [
  'reclamo', 'queja', 'demanda', 'abogado', 'denuncia',
  'devolucion', 'devolver la plata', 'reembolso',
  'descuento especial', 'rebaja', 'me fian', 'plazo',
  'retirar a mi hijo', 'retiro', 'paz y salvo',
  'lesion', 'accidente', 'se golpeo', 'ambulancia',
  'el profesor', 'la profesora', 'entrenador me', 'trato mal',
  'hablar con', 'gerente', 'director', 'dueño',
];

/* ── Respuestas de arranque ───────────────────────────────────────────────
   Salen del brief de atención. Las que llevan [COMPLETAR] son las que solo la
   dirección puede llenar: mientras digan eso, el motor NO las usa —prefiere
   pasar a una persona antes que mandar un corchete—. */
const ARRANQUE: Respuesta[] = [
  {
    /* ── LA ÚNICA RESPUESTA AUTORIZADA ───────────────────────────────────
       (dirección, 05/09/2026 — «lo único que tienes autorizado en este
        momento en el brief es el saludo. Borra todas las demás preguntas y
        empecemos de una en una»)

       Y es la forma correcta de hacerlo. Antes de esto había un borrador con
       veinticinco respuestas que nadie había aprobado — precios, horarios,
       requisitos— escritas por deducción. En una academia con 975 familias,
       una respuesta inventada no es un borrador: es un reclamo esperando.

       Aquí solo va lo que la dirección escribió y aprobó, palabra por
       palabra. Se agregan de una en una, a medida que se aprueben.

       ── POR QUÉ ESTE SALUDO ──
       El mensaje que más llega desde las redes es siempre el mismo y no dice
       nada: «Hola, me gustaría tener más información de la escuela de fútbol».
       Ese no se puede contestar con precios: no se sabe la edad.

       ── POR QUÉ SOLO SE PIDE LA FECHA DE NACIMIENTO ──
       (dirección, 05/09/2026 — «solo preguntarle fecha de nacimiento y no
        lugar, ya que dicen un barrio que seguro el agente no reconozca; es
        mejor preguntarle cuál sede le queda más cercana de las que ya leyó»)

       Antes se pedían dos cosas: la fecha y el barrio. El barrio es un dato
       que la máquina NO puede resolver: hay cientos de barrios, cada quien lo
       escribe distinto, y muchos se llaman igual en municipios diferentes. El
       agente iba a quedarse trabado justo en el primer mensaje.

       La fecha de nacimiento, en cambio, es un número: con él se sabe el
       programa, los días, la frecuencia y el valor — todo lo que el papá vino
       a preguntar. Y las sedes se NOMBRAN aquí, con un punto de referencia,
       para que él mismo escoja después la que le queda cerca. Esa es la
       tercera pregunta, no la primera.

       ── LAS DOS PREGUNTAS, DE UNA ──
       (dirección, 05/09/2026 — «preguntemos mejor la fecha de nacimiento y de
        una vez cuál sede le gusta; así le mandamos programa y horarios de una»)

       Se pedían por separado: primero la fecha, y la sede después. Pero la
       sede ya está NOMBRADA aquí arriba, así que el papá no tiene que
       adivinar nada — escoge de una lista que acaba de leer. Y con las dos
       cosas juntas, la siguiente respuesta ya puede llevar todo: programa,
       días, horarios de ESA cancha, matrícula y mensualidad.

       Ojo con la diferencia: preguntar el BARRIO era imposible de resolver
       —cientos de barrios, mil formas de escribirlos—. Preguntar CUÁL SEDE es
       una lista cerrada de seis. Eso sí lo resuelve una máquina.

       ── ESTE TEXTO NO SE TOCA DESDE AQUÍ ──
       (dirección, 05/09/2026: «no cambies el saludo, ya lo cambié yo»)

       El saludo que está corriendo es el que la dirección escribió y guardó
       EN EL MÓDULO, y vive en la nube. Esto de aquí es solo la copia de
       arranque: la que se usaría si algún día se borrara la configuración.
       Se dejó idéntica a la guardada, a propósito, para que en ese caso no
       reviva un borrador viejo en lugar del texto bueno.

       Si el saludo cambia, se cambia EN EL MÓDULO. Aquí no. */
    id: 'saludo', tema: 'Saludo al que quiere ingresar', activa: true,
    claves: 'hola, buenas, buenos dias, buenas tardes, buenas noches, informacion, mas informacion, info, informes de la escuela, escuela de futbol, escuela, academia, quiero saber, quisiera saber, me interesa, interesado, interesada, deseo informacion',
    texto: "⚽️ ¡Hola! Somos FUTURO ANTIOQUIA, la Academia de Fútbol con el mayor número de usuarios en Antioquia.\n\n📍(Sedes en Medellín: Santa Mónica, La 80 Cerca a San Juan y Centro)\n\n📍(Sede Bello Niquía Tulio Ospina) \n\n📍(Sede Sabaneta, 3 cuadras de la Estación Itagüí) \n\n📍(Rionegro Sector Barro Blanco)\n\nPara que conozcas el programa, días, horarios, frecuencia, valor de matrícula y mensualidad, cuéntame:\n\n📅 Fecha de nacimiento del niño o niña.\n\n📍 Cuál sede te queda mejor."
  },
];




/* ── LA TABLA DE PROGRAMAS Y AÑOS SE RETIRÓ ───────────────────────────────
   (dirección, 06/09/2026 — «no entiendo bien Programas y Años y quiero que lo
    borres y lo hagas a mi manera»)

   Era una idea mía: una tabla con los programas, los años de nacimiento y los
   valores, aparte de las respuestas. Sonaba ordenado, pero DUPLICABA el
   trabajo: la dirección ya escribe eso mismo —y mejor— dentro de cada
   respuesta, donde queda tal cual como le va a llegar al papá.

   Dos sitios para el mismo dato es la forma más segura de que un día no
   coincidan. Se retiró la pestaña. Lo que se haya guardado ahí no se borra
   de la nube: se conserva intacto por si algún día se retoma. */

/* ══════════════════════════════════════════════════════════════════════════
   LOS SALUDOS Y LOS PROGRAMAS
   (dirección, 06/09/2026)

   Dos cosas que la dirección escribe una vez y quedan en la memoria del
   contestador. Nada de esto vive en el código: se edita en la pantalla y se
   guarda en la nube. Cuando algo cambie —un horario, un valor, una sede— se
   entra, se corrige y ya. NO hay que crear el año siguiente: se actualiza el
   que hay.
   ══════════════════════════════════════════════════════════════════════════ */

/** Los cuatro tipos de persona que escriben. Es lo primero que hay que saber,
 *  porque cambia TODO lo que se le puede contestar. */
const QUIENES = [
  { id: 'nuevo',    titulo: 'NUEVO',        ayuda: 'Nunca ha estado en el club. Es el que hay que atender mejor.' },
  { id: 'activo',   titulo: 'ACTIVO',       ayuda: 'Ya hace parte del club. Se le puede saludar por su nombre.' },
  { id: 'retirado', titulo: 'RETIRADO',     ayuda: 'Hizo parte antes. Casi siempre busca un certificado o un paz y salvo.' },
  { id: 'otros',    titulo: 'OTROS / DESCONOCIDOS', ayuda: 'Ni lo uno ni lo otro: un proveedor, un colegio, un número equivocado.' },
] as const;
type QuienId = typeof QUIENES[number]['id'];
type Saludos = Record<string, string>;

/** Las sedes donde se entrena. */
const SEDES = ['Santa Mónica', 'La 80', 'Centro', 'Bello Niquía', 'Sabaneta', 'Rionegro'];
const DIAS  = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
/** Los años de nacimiento que se pueden escoger. */
const ANIOS: number[] = Array.from({ length: 2030 - 2011 + 1 }, (_, i) => 2011 + i);

/** Un horario: en qué sede y qué día entrena la gente de ESE año. */
interface Horario { anio: number; sede: string; dia: string; hora: string }
interface Programa {
  id: string;
  nombre: string;
  significa: string;      // qué es ese programa, en una frase
  duracion: string;       // "60 minutos"
  anios: number[];        // los años de nacimiento que cubre
  horarios: Horario[];
}

export default function AtencionPage() {
  const router = useRouter();
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso]         = useState('');
  const [pestana, setPestana]     = useState<'saludos' | 'programas' | 'respuestas' | 'probar'>('saludos');
  const [saludos, setSaludos]     = useState<Saludos>({});
  const [programas, setProgramas] = useState<Programa[]>([]);
  /* Lo que quedó guardado de la tabla vieja. NO se muestra ni se toca: se
     guarda igualito para no borrarle nada a nadie. — 06/09/2026 */
  const [programasViejos, setProgramasViejos] = useState<any>(null);
  const [busca, setBusca]         = useState('');

  /* El simulador */
  const [entrada, setEntrada] = useState('');
  const [chat, setChat] = useState<{ de: 'papa' | 'motor' | 'persona'; texto: string }[]>([]);
  const finChat = useRef<HTMLDivElement | null>(null);

  useEffect(() => { cargar(); }, []);
  useEffect(() => { finChat.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/config_cobro?id=eq.${ID_CONFIG}&select=data`,
        { headers: HDR, cache: 'no-store' },
      );
      const d = await r.json();
      const guardadas = Array.isArray(d) ? d[0]?.data?.respuestas : null;
      setRespuestas(Array.isArray(guardadas) && guardadas.length ? guardadas : ARRANQUE);
      setProgramasViejos(Array.isArray(d) ? (d[0]?.data?.programas ?? null) : null);
      const dd = Array.isArray(d) ? d[0]?.data : null;
      setSaludos(dd?.saludos && typeof dd.saludos === 'object' ? dd.saludos : {});
      setProgramas(Array.isArray(dd?.programas2) ? dd.programas2 : []);
    } catch {
      setRespuestas(ARRANQUE);
    } finally { setCargando(false); }
  }

  async function guardar() {
    setGuardando(true); setAviso('');
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/config_cobro`, {
        method: 'POST',
        headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: ID_CONFIG,
          /* `programas` se vuelve a guardar EXACTAMENTE como llegó: la pestaña
             ya no existe, pero lo que hubiera quedado escrito no se pierde. */
          data: {
            respuestas,
            saludos,
            programas2: programas,
            ...(programasViejos ? { programas: programasViejos } : {}),
            actualizado: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }),
      });
      setAviso(r.ok ? '✓ Guardado' : '✗ No se pudo guardar. Inténtalo otra vez.');
    } catch {
      setAviso('✗ Sin conexión. No se guardó.');
    } finally {
      setGuardando(false);
      setTimeout(() => setAviso(''), 3500);
    }
  }

  function nueva() {
    setRespuestas(p => [
      { id: `r${Date.now()}`, tema: '', claves: '', texto: '', activa: true },
      ...p,
    ]);
  }
  function cambiar(id: string, campo: keyof Respuesta, valor: any) {
    setRespuestas(p => p.map(r => (r.id === id ? { ...r, [campo]: valor } : r)));
  }
  function quitar(id: string) {
    const r = respuestas.find(x => x.id === id);
    if (!confirm(`¿Quitar la respuesta "${r?.tema || 'sin nombre'}"?`)) return;
    setRespuestas(p => p.filter(x => x.id !== id));
  }

  /* ── LOS PROGRAMAS: agregar, cambiar, quitar ────────────────────────── */
  function nuevoPrograma() {
    setProgramas(p => [...p, {
      id: `g${Date.now()}`, nombre: '', significa: '', duracion: '', anios: [], horarios: [],
    }]);
  }
  function cambiarPrograma(id: string, campo: keyof Programa, valor: any) {
    setProgramas(p => p.map(g => (g.id === id ? { ...g, [campo]: valor } : g)));
  }
  function quitarPrograma(id: string) {
    const g = programas.find(x => x.id === id);
    if (!confirm(`¿Quitar el programa "${g?.nombre || 'sin nombre'}" con todos sus horarios?`)) return;
    setProgramas(p => p.filter(x => x.id !== id));
  }
  /** Agrega un año de nacimiento al programa. No deja repetidos y los ordena. */
  function agregarAnio(id: string, anio: number) {
    if (!anio) return;
    setProgramas(p => p.map(g => g.id !== id ? g
      : { ...g, anios: g.anios.includes(anio) ? g.anios : [...g.anios, anio].sort((a, b) => a - b) }));
  }
  /** Al quitar un año se van TAMBIÉN sus horarios: si ese año ya no está en el
   *  programa, un horario suyo no le sirve a nadie y solo estorbaría. */
  function quitarAnio(id: string, anio: number) {
    setProgramas(p => p.map(g => g.id !== id ? g
      : { ...g, anios: g.anios.filter(a => a !== anio), horarios: g.horarios.filter(h => h.anio !== anio) }));
  }
  function agregarHorario(id: string) {
    setProgramas(p => p.map(g => g.id !== id ? g
      : { ...g, horarios: [...g.horarios, { anio: g.anios[0] ?? 0, sede: SEDES[0], dia: DIAS[0], hora: '' }] }));
  }
  function cambiarHorario(id: string, i: number, campo: keyof Horario, valor: any) {
    setProgramas(p => p.map(g => g.id !== id ? g
      : { ...g, horarios: g.horarios.map((h, k) => (k === i ? { ...h, [campo]: valor } : h)) }));
  }
  function quitarHorario(id: string, i: number) {
    setProgramas(p => p.map(g => g.id !== id ? g
      : { ...g, horarios: g.horarios.filter((_, k) => k !== i) }));
  }

  /* ── EL MOTOR ──────────────────────────────────────────────────────────
     Esto es lo que va a correr cuando llegue un WhatsApp de verdad. Devuelve
     la respuesta que corresponde, o null si hay que pasar a una persona. */
  function responder(mensaje: string): { texto: string; tema: string } | null {
    const m = pelar(mensaje);
    if (!m) return null;

    /* Primero el freno: si suena a reclamo, plata o salud, no se contesta. */
    if (A_UNA_PERSONA.some(p => m.includes(pelar(p)))) return null;

    /* Se busca la respuesta con MÁS palabras clave encontradas. Así, entre
       "valor" y "valor del uniforme", gana la más específica. */
    let mejor: { r: Respuesta; puntos: number } | null = null;
    for (const r of respuestas) {
      if (!r.activa) continue;
      if (r.texto.includes('[COMPLETAR')) continue;   // sin datos, no se manda
      let puntos = 0;
      for (const c of r.claves.split(',')) {
        const clave = pelar(c);
        if (clave.length < 3) continue;
        if (m.includes(clave)) puntos += clave.split(' ').length;
      }
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { r, puntos };
    }
    return mejor ? { texto: mejor.r.texto, tema: mejor.r.tema } : null;
  }

  function enviar() {
    const t = entrada.trim();
    if (!t) return;
    const res = responder(t);
    setChat(c => [
      ...c,
      { de: 'papa', texto: t },
      res
        ? { de: 'motor', texto: res.texto }
        : { de: 'persona', texto: 'Con mucho gusto le respondemos. En un momento le escribe la persona encargada.' },
    ]);
    setEntrada('');
  }

  const sinCompletar = useMemo(
    () => respuestas.filter(r => r.texto.includes('[COMPLETAR')).length,
    [respuestas],
  );
  const visibles = useMemo(() => {
    const b = pelar(busca);
    if (!b) return respuestas;
    return respuestas.filter(r => pelar(`${r.tema} ${r.claves} ${r.texto}`).includes(b));
  }, [respuestas, busca]);

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 shadow-lg"
        style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}>
        <button onClick={() => router.back()}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-base tracking-wide text-white leading-tight">ATENCIÓN POR WHATSAPP</h1>
          <p className="text-white/70 text-[11px]">Lo que la academia contesta, y lo que pasa a una persona</p>
        </div>
        <button onClick={guardar} disabled={guardando}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-black text-white transition hover:brightness-110 disabled:opacity-60"
          style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.35)' }}>
          <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {aviso && (
          <p className="rounded-xl px-4 py-2.5 text-[13px] font-black text-white"
             style={{ background: aviso.startsWith('✓') ? VERDE : ROJO }}>{aviso}</p>
        )}

        {/* ── Aviso de lo que falta ── */}
        {sinCompletar > 0 && (
          <div className="rounded-xl px-4 py-3"
               style={{ background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }}>
            <p className="font-black text-[13px] flex items-center gap-2" style={{ color: AMBAR }}>
              <AlertTriangle className="w-4 h-4" />
              Faltan {sinCompletar} respuesta{sinCompletar === 1 ? '' : 's'} por llenar
            </p>
            <p className="text-white/75 text-[12px] leading-snug mt-1">
              Son las que dicen <b className="text-white">[COMPLETAR]</b>: valores, edades, horarios y
              qué pasa en la primera visita. <b className="text-white">Mientras digan eso, el motor no
              las usa</b> — prefiere pasar a una persona antes que mandarle un corchete a un papá.
            </p>
          </div>
        )}

        {/* ── Pestañas ── */}
        <div className="flex gap-2">
          {([['saludos', 'SALUDOS'], ['programas', 'PROGRAMAS'], ['respuestas', 'RESPUESTAS'], ['probar', 'PROBAR']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setPestana(k)}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-wide transition hover:brightness-125"
              style={{
                background: pestana === k ? VERDE : CAMPO,
                border: `1px solid ${pestana === k ? VERDE : BORDE}`,
                color: '#FFFFFF',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══════════ SALUDOS ══════════ */}
        {pestana === 'saludos' && (
          <>
            <p className="text-white/70 text-[12.5px] leading-snug">
              Lo primero que hay que saber de quien escribe es <b className="text-white">quién es</b>,
              porque cambia todo lo que se le puede contestar. Aquí va el saludo de cada uno.
            </p>
            {QUIENES.map(q => (
              <div key={q.id} className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-black text-white text-[13px] tracking-wide">{q.titulo}</span>
                  <span className="text-[11.5px]" style={{ color: GRIS }}>{q.ayuda}</span>
                </div>
                <textarea value={saludos[q.id] ?? ''} rows={6}
                  onChange={e => setSaludos(p => ({ ...p, [q.id]: e.target.value }))}
                  placeholder="Escriba aquí el saludo, tal cual como le va a llegar…"
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] text-white outline-none resize-y placeholder:text-white/30"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}`, lineHeight: 1.6 }} />
              </div>
            ))}
          </>
        )}

        {/* ══════════ PROGRAMAS ══════════ */}
        {pestana === 'programas' && (
          <>
            <p className="text-white/70 text-[12.5px] leading-snug">
              El año de nacimiento es el que manda: con él se sabe el programa. Aquí se escribe
              cada programa, <b className="text-white">qué años cubre</b> y el horario de cada año
              en cada sede. Se corrige cuando cambie — <b className="text-white">no hay que crear
              el año siguiente</b>.
            </p>

            {programas.length === 0 && (
              <p className="text-white/35 text-[13px] text-center py-8">
                Todavía no hay programas. Agrega el primero abajo.
              </p>
            )}

            {programas.map(g => (
              <div key={g.id} className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

                <div className="flex flex-wrap items-center gap-2">
                  <input value={g.nombre} placeholder="Nombre del programa"
                    onChange={e => cambiarPrograma(g.id, 'nombre', e.target.value)}
                    className="flex-1 min-w-[190px] rounded-lg px-3 py-2 text-[14px] font-black text-white outline-none placeholder:text-white/30"
                    style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                  <button onClick={() => quitarPrograma(g.id)} title="Quitar este programa"
                    className="p-2 rounded-lg transition hover:brightness-125"
                    style={{ background: 'rgba(192,80,77,.16)', border: `1px solid ${ROJO}` }}>
                    <Trash2 className="w-3.5 h-3.5" style={{ color: '#F08A87' }} />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1" style={{ color: GRIS }}>QUÉ SIGNIFICA</label>
                  <textarea value={g.significa} rows={2}
                    onChange={e => cambiarPrograma(g.id, 'significa', e.target.value)}
                    placeholder="En qué consiste este programa…"
                    className="w-full rounded-lg px-3 py-2 text-[13px] text-white outline-none resize-y placeholder:text-white/30"
                    style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                </div>

                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1" style={{ color: GRIS }}>DURACIÓN DE LA SESIÓN</label>
                  <input value={g.duracion} placeholder="60 minutos"
                    onChange={e => cambiarPrograma(g.id, 'duracion', e.target.value)}
                    className="w-48 rounded-lg px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30"
                    style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                </div>

                {/* ── LOS AÑOS DE NACIMIENTO ── */}
                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: GRIS }}>
                    AÑOS DE NACIMIENTO QUE CUBRE
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {g.anios.length === 0 && <span className="text-[12px]" style={{ color: GRIS }}>Ninguno todavía.</span>}
                    {g.anios.map(a => (
                      <span key={a} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-black text-white"
                        style={{ background: 'rgba(0,176,80,.20)', border: `1px solid ${VERDE}` }}>
                        {a}
                        <button onClick={() => quitarAnio(g.id, a)} title="Quitar este año y sus horarios"
                          className="font-black transition hover:brightness-125" style={{ color: '#F0A6A3' }}>✕</button>
                      </span>
                    ))}
                  </div>
                  <select value="" onChange={e => { agregarAnio(g.id, Number(e.target.value)); e.currentTarget.value = ''; }}
                    className="rounded-lg px-3 py-2 text-[13px] font-bold text-white outline-none cursor-pointer"
                    style={{ background: CAMPO, border: `1px dashed ${VERDECL}` }}>
                    <option value="">+ Agregar un año…</option>
                    {ANIOS.filter(a => !g.anios.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                {/* ── LOS HORARIOS: por año y por sede ── */}
                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: GRIS }}>
                    HORARIOS · POR AÑO Y POR SEDE
                  </label>
                  {g.anios.length === 0 ? (
                    <p className="text-[12px]" style={{ color: AMBAR }}>
                      Primero agrega los años de nacimiento; los horarios se cuelgan de ellos.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {g.horarios.map((h, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <select value={h.anio} onChange={e => cambiarHorario(g.id, i, 'anio', Number(e.target.value))}
                            className="w-24 rounded-lg px-2 py-2 text-[12.5px] font-black text-white outline-none cursor-pointer"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                            {g.anios.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                          <select value={h.sede} onChange={e => cambiarHorario(g.id, i, 'sede', e.target.value)}
                            className="w-40 rounded-lg px-2 py-2 text-[12.5px] text-white outline-none cursor-pointer"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                            {SEDES.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                          <select value={h.dia} onChange={e => cambiarHorario(g.id, i, 'dia', e.target.value)}
                            className="w-32 rounded-lg px-2 py-2 text-[12.5px] text-white outline-none cursor-pointer"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                            {DIAS.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                          <input value={h.hora} placeholder="8:00 a 9:00 a. m."
                            onChange={e => cambiarHorario(g.id, i, 'hora', e.target.value)}
                            className="flex-1 min-w-[150px] rounded-lg px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-white/30"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                          <button onClick={() => quitarHorario(g.id, i)}
                            className="text-[11.5px] font-black transition hover:brightness-125"
                            style={{ color: ROJO }}>quitar</button>
                        </div>
                      ))}
                      <button onClick={() => agregarHorario(g.id)}
                        className="self-start px-3 py-2 rounded-lg text-[12px] font-black text-white transition hover:brightness-125"
                        style={{ background: CAMPO, border: `1px dashed ${VERDECL}` }}>
                        + Agregar un horario
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button onClick={nuevoPrograma}
              className="self-start px-4 py-2.5 rounded-xl text-[12.5px] font-black text-white transition hover:brightness-125"
              style={{ background: VERDE, border: `1px solid ${VERDE}` }}>
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Agregar un programa
            </button>
          </>
        )}

        {/* ══════════ RESPUESTAS ══════════ */}
        {pestana === 'respuestas' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: GRIS }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por tema, palabra clave o texto…"
                  className="w-full rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/35"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
              </div>
              <button onClick={nueva}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-black text-white transition hover:brightness-110"
                style={{ background: VERDE }}>
                <Plus className="w-4 h-4" /> Nueva respuesta
              </button>
            </div>

            {cargando ? (
              <p className="text-white/50 text-center py-10 text-sm font-semibold">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="text-white/50 text-center py-10 text-sm font-semibold">
                Nada con esa palabra.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {visibles.map(r => {
                  const falta = r.texto.includes('[COMPLETAR');
                  return (
                    <div key={r.id} className="rounded-2xl overflow-hidden"
                      style={{ background: PANEL, border: `1px solid ${falta ? AMBAR : BORDE}` }}>

                      <div className="flex items-center gap-2 px-4 py-2.5"
                           style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
                        <input value={r.tema} onChange={e => cambiar(r.id, 'tema', e.target.value)}
                          placeholder="Nombre del tema (ej: Cuánto vale)"
                          className="flex-1 min-w-0 bg-transparent text-white font-black text-[13.5px] outline-none placeholder:text-white/30" />
                        {falta && (
                          <span className="shrink-0 text-[9.5px] font-black rounded px-2 py-1"
                                style={{ background: 'rgba(224,163,58,.18)', border: `1px solid ${AMBAR}`, color: AMBAR }}>
                            FALTA LLENAR
                          </span>
                        )}
                        <button onClick={() => cambiar(r.id, 'activa', !r.activa)}
                          title={r.activa ? 'Está activa. Tócala para apagarla.' : 'Está apagada. Tócala para activarla.'}
                          className="shrink-0 text-[9.5px] font-black rounded px-2 py-1 transition hover:brightness-125"
                          style={{
                            background: r.activa ? 'rgba(0,176,80,.16)' : 'rgba(124,135,154,.16)',
                            border: `1px solid ${r.activa ? VERDE : GRIS}`,
                            color: r.activa ? VERDECL : GRIS,
                          }}>
                          {r.activa ? 'ACTIVA' : 'APAGADA'}
                        </button>
                        <button onClick={() => quitar(r.id)} title="Quitar esta respuesta"
                          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition hover:brightness-125"
                          style={{ background: 'transparent', border: `1px solid ${ROJO}` }}>
                          <Trash2 className="w-3.5 h-3.5" style={{ color: ROJO }} />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-[9.5px] font-black uppercase tracking-widest mb-1.5"
                                 style={{ color: GRIS }}>
                            Palabras por las que se reconoce · separadas por coma
                          </label>
                          <input value={r.claves} onChange={e => cambiar(r.id, 'claves', e.target.value)}
                            placeholder="valor, precio, cuanto vale, cuanto cuesta"
                            className="w-full rounded-xl px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-white/30"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                          <p className="text-[11px] mt-1.5" style={{ color: GRIS }}>
                            No importan tildes ni mayúsculas. Escriba también cómo lo dice la gente,
                            no solo cómo se dice bien.
                          </p>
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-black uppercase tracking-widest mb-1.5"
                                 style={{ color: GRIS }}>
                            Lo que se le manda al papá · tal cual
                          </label>
                          <textarea value={r.texto} onChange={e => cambiar(r.id, 'texto', e.target.value)}
                            rows={5}
                            placeholder="Un saludo especial…"
                            className="w-full rounded-xl px-3 py-2 text-[13px] text-white outline-none resize-y placeholder:text-white/30"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}`, lineHeight: 1.6 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════ PROBAR ══════════ */}
        {pestana === 'probar' && (
          <>
            <p className="text-white/70 text-[12.5px] leading-snug">
              Escriba como si fuera un papá y mire qué contesta. Lo que se ve aquí es
              <b className="text-white"> exactamente</b> lo que va a mandar el WhatsApp.
              Nada de lo que escriba aquí sale a ningún lado.
            </p>

            <div className="rounded-2xl overflow-hidden" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <div className="px-4 py-2.5 flex items-center gap-2"
                   style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
                <MessageCircle className="w-4 h-4" style={{ color: VERDECL }} />
                <span className="font-black text-[12.5px] text-white">Prueba</span>
                {chat.length > 0 && (
                  <button onClick={() => setChat([])}
                    className="ml-auto text-[11px] font-black transition hover:brightness-125"
                    style={{ color: GRIS }}>Limpiar</button>
                )}
              </div>

              <div className="p-4 flex flex-col gap-2.5 min-h-[220px] max-h-[440px] overflow-y-auto">
                {chat.length === 0 && (
                  <p className="text-white/35 text-[13px] text-center py-10">
                    Escriba abajo una pregunta de papá.<br />
                    Por ejemplo: «buenas, cuánto vale para un niño de 7 años?»
                  </p>
                )}
                {chat.map((c, i) => (
                  <div key={i} className={c.de === 'papa' ? 'self-end max-w-[85%]' : 'self-start max-w-[88%]'}>
                    {c.de !== 'papa' && (
                      <p className="text-[9.5px] font-black uppercase tracking-widest mb-1"
                         style={{ color: c.de === 'motor' ? VERDECL : AMBAR }}>
                        {c.de === 'motor' ? 'Contesta el motor' : '⚠ Pasa a una persona'}
                      </p>
                    )}
                    <div className="rounded-2xl px-3.5 py-2.5 text-[13px] text-white whitespace-pre-wrap"
                      style={{
                        background: c.de === 'papa' ? '#20293a'
                          : c.de === 'motor' ? 'rgba(0,176,80,.16)' : 'rgba(224,163,58,.14)',
                        border: `1px solid ${c.de === 'papa' ? BORDE : c.de === 'motor' ? VERDE : AMBAR}`,
                        lineHeight: 1.6,
                      }}>
                      {c.texto}
                    </div>
                  </div>
                ))}
                <div ref={finChat} />
              </div>

              <div className="p-3 flex gap-2" style={{ borderTop: `1px solid ${BORDE}` }}>
                <input value={entrada} onChange={e => setEntrada(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                  placeholder="Escriba como si fuera un papá…"
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/35"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
                <button onClick={enviar}
                  className="shrink-0 w-11 rounded-xl flex items-center justify-center transition hover:brightness-110"
                  style={{ background: VERDE }}>
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Lo que nunca contesta */}
            <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${ROJO}` }}>
              <p className="font-black text-[13px] mb-1.5" style={{ color: '#F0A6A3' }}>
                Lo que el motor NUNCA contesta solo
              </p>
              <p className="text-white/70 text-[12px] leading-snug mb-2">
                Si el mensaje trae alguna de estas palabras, no responde nada automático: pasa
                derecho a una persona. Son los temas donde una respuesta de máquina hace daño.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {A_UNA_PERSONA.map(p => (
                  <span key={p} className="text-[10.5px] font-bold rounded px-2 py-0.5"
                    style={{ background: 'rgba(192,80,77,.16)', border: `1px solid ${ROJO}`, color: '#F0A6A3' }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
