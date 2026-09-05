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
    id: 'saludo', tema: 'Saludo de entrada', activa: true,
    claves: 'hola, buenas, buenos dias, buenas tardes, buenas noches, informacion, info',
    texto: 'Un saludo especial. Le habla la Academia de Fútbol Futuro Antioquia — MAX 10 SPORT.\n\nCon mucho gusto le cuento. Para orientarlo mejor, ¿me dice el nombre y la edad del niño, y en qué barrio o sector viven?',
  },
  {
    id: 'valor', tema: 'Cuánto vale', activa: true,
    claves: 'valor, precio, cuanto vale, cuanto cuesta, cuanto es, mensualidad, costo, tarifa',
    texto: '[COMPLETAR: inscripción, matrícula y mensualidad por programa]\n\nEl ciclo de pagos va de febrero a diciembre. La inscripción y la matrícula son aparte y se pagan una sola vez.',
  },
  {
    id: 'descuento', tema: 'Descuento por pronto pago', activa: true,
    claves: 'descuento, rebaja por pronto, pronto pago, si pago antes, 10%, diez por ciento',
    texto: 'Sí. Pagando antes del día 5 del mes se gana el 10 % de descuento sobre la mensualidad.\n\nEs automático: se refleja en su Estado de Cuenta.',
  },
  {
    id: 'sedes', tema: 'Dónde entrenan', activa: true,
    claves: 'sede, sedes, donde entrenan, donde queda, direccion, ubicacion, cancha',
    texto: 'Tenemos siete sedes: Institucional, Santa Mónica, Bello Niquía, Sabaneta, La 80, Centro y Rionegro.\n\n¿En qué barrio o sector viven? Así le digo cuál le queda mejor y en qué horario.',
  },
  {
    id: 'horarios', tema: 'Horarios', activa: true,
    claves: 'horario, horarios, a que hora, que dias, dias de entreno, cuando entrenan',
    texto: '[COMPLETAR: días y horas por sede]\n\nLas sesiones duran 1 hora y 30 minutos, salvo en CDC (Casa de Campeones), que es de 1 hora.',
  },
  {
    id: 'programas', tema: 'Qué programas hay', activa: true,
    claves: 'programa, programas, categorias, por edades, que edad, edades',
    texto: '[COMPLETAR: edades de cada programa]\n\nTenemos cinco: Estimulación, Formación, Progresión, Selección y Desarrollo. Dígame la edad del niño y le digo cuál le corresponde.',
  },
  {
    id: 'inscribir', tema: 'Cómo inscribirse', activa: true,
    claves: 'inscribir, inscripcion, como me inscribo, matricular, quiero inscribir, papeles, requisitos, documentos',
    texto: 'La inscripción se hace en línea, en nuestro Formulario de Inscripción.\n\nLe pasamos el enlace y un código de deportista nuevo que entrega la administración: sin ese código el formulario no abre.\n\nAntes de eso, lo invitamos a conocernos en la cancha. ¿Le sirve que coordinemos un día esta semana?',
  },
  {
    id: 'pagar', tema: 'Cómo pagar', activa: true,
    claves: 'como pago, donde pago, a que cuenta, consignar, transferencia, numero de cuenta, nequi, bancolombia',
    texto: 'El pago se hace a nuestra Cuenta de Ahorros Bancolombia. El número y el titular salen impresos en su Estado de Cuenta, dentro de la plataforma.\n\nDespués de pagar, por favor suba el soporte desde la app, en su Estado de Cuenta. Así queda registrado y la administración se lo confirma.',
  },
  {
    id: 'estado', tema: 'Cuánto debo', activa: true,
    claves: 'cuanto debo, saldo, estado de cuenta, debo algo, mi cuenta, deuda',
    texto: 'Con mucho gusto. Su Estado de Cuenta lo puede ver en cualquier momento desde la app, en la ficha de su hijo.\n\nSi prefiere que se lo enviemos, en un momento le responde la persona encargada.',
  },
  {
    id: 'app', tema: 'La aplicación', activa: true,
    claves: 'aplicacion, la app, plataforma, como entro, clave, contraseña, no puedo entrar, usuario',
    texto: 'La plataforma se abre desde el navegador y se puede instalar en el celular como una aplicación.\n\nSi no puede entrar, en un momento le responde la persona encargada para ayudarle — no le pedimos su contraseña por este medio.',
  },
  {
    id: 'informe', tema: 'Informes del deportista', activa: true,
    claves: 'informe, informes, valoracion, evaluacion, como va mi hijo, reporte',
    texto: 'Los informes los hace el formador de su hijo y quedan en la plataforma. Los puede ver desde la app, en la ficha del deportista.\n\nSi tiene una inquietud sobre el proceso deportivo, con gusto se la pasamos a la dirección deportiva.',
  },
  {
    id: 'asistencia', tema: 'Asistencia', activa: true,
    claves: 'asistencia, faltas, fallas, no fue, asistio',
    texto: 'La asistencia la registra el formador todos los días y usted la puede ver en la app, en la ficha de su hijo.\n\nSi ve algo que no cuadra, díganos y lo revisamos con el formador.',
  },
  {
    id: 'visita', tema: 'Quiere venir a conocer', activa: true,
    claves: 'ir a ver, conocer, clase de prueba, prueba, visitar, puedo llevarlo, probar',
    texto: '[COMPLETAR: qué se hace en la primera visita — ¿es clase de prueba?, ¿cuántas?, ¿qué lleva el niño?]\n\nCon mucho gusto lo esperamos. ¿En qué barrio viven y qué día le sirve?',
  },
];

export default function AtencionPage() {
  const router = useRouter();
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso]         = useState('');
  const [pestana, setPestana]     = useState<'respuestas' | 'probar'>('respuestas');
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
          data: { respuestas, actualizado: new Date().toISOString() },
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
          {([['respuestas', 'RESPUESTAS'], ['probar', 'PROBAR']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setPestana(k)}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-black tracking-wide transition hover:brightness-125"
              style={{
                background: pestana === k ? VERDE : CAMPO,
                border: `1px solid ${pestana === k ? VERDE : BORDE}`,
                color: '#FFFFFF',
              }}>
              {t}
            </button>
          ))}
        </div>

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
