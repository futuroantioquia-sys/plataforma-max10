'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, Search, ArrowLeft, GraduationCap, Building2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { getMensajes, enviarMensaje, marcarConversacionLeida, getDeportistas, getProfes, getTelefonosWhatsApp, guardarTelefonoWhatsApp } from '@/lib/db';
import type { Mensaje, Deportista, DestinoMensaje } from '@/lib/db';

/* ── Helpers ── */
function colDe(dep: Deportista | undefined | null, re: RegExp): string {
  const cols = dep?._columnas ?? {};
  const k = Object.keys(cols).find(c => re.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
const codigoDe   = (dep: Deportista | undefined | null) => colDe(dep, /^c[oó]d/i);
const proyectoDe = (dep: Deportista | undefined | null) => colDe(dep, /^proy/i);
const up = (s: string) => (s ?? '').trim().toUpperCase();

/* ── A QUIÉN LE ESCRIBIERON ─────────────────────────────────────────────────
   El papá escoge un asunto al escribir —MENSAJE AL DIRECTOR, ACLARACIÓN
   PAGOS…— y ese asunto queda al principio del texto. De ahí se saca a cuál
   de las tres bandejas pertenece. — dirección, 29/08/2026 */
type Bandeja = 'DIRECTOR' | 'CONTABLE' | 'FORMADOR';

function bandejaDe(m: { texto?: string; para?: string }): Bandeja {
  if (m?.para === 'profesor') return 'FORMADOR';
  const t = String(m?.texto ?? '').toUpperCase();
  /* Primero el asunto exacto, que es el que escribe la plataforma. */
  if (/MENSAJE AL DIRECTOR/.test(t)) return 'DIRECTOR';
  if (/ACLARACI[OÓ]N PAGOS|[ÁA]REA CONTABLE/.test(t)) return 'CONTABLE';
  /* Y si es un mensaje viejo, sin asunto, se adivina por lo que dice. */
  if (/PAGO|CONTAB|CARTERA|FACTUR|COBRO|MENSUALIDAD/.test(t)) return 'CONTABLE';
  return 'DIRECTOR';
}

/** El asunto que se le pone al mensaje según a quién va. */
const ASUNTO: Record<Bandeja, string> = {
  DIRECTOR: 'MENSAJE AL DIRECTOR',
  CONTABLE: 'ACLARACIÓN PAGOS',
  FORMADOR: 'MENSAJE AL FORMADOR',
};

/** El celular, listo para WhatsApp: 3113795701 → 573113795701 */
function celularWhatsApp(bruto: string): string {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('57') && d.length >= 12) return d;
  if (d.length === 10 && d.startsWith('3')) return '57' + d;
  if (d.length >= 10) return d;
  return '';
}
const celularDe = (d: Deportista | undefined | null) =>
  colDe(d, /celular.*acud|acud.*celular/i) || colDe(d, /^n[uú]mero de celular|^celular|^tel/i);

function iniciales(nombre: string): string {
  return (nombre || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
/** "SAB 29 AGO · 16:03" — el día y la hora en que lo escribieron.
 *  Antes solo salía la hora y no se sabía si el mensaje era de hoy o de hace
 *  tres semanas. — dirección, 29/08/2026 */
function fechaHora(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dias  = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${hh}:${mm}`;
  } catch { return ''; }
}

/** "29 AGO" — para la lista de la izquierda, que es angosta. */
function diaCorto(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${d.getDate()} ${meses[d.getMonth()]}`;
  } catch { return ''; }
}

function horaCorta(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

type Conv = {
  key: string;               // identificador único de la conversación
  codigo: string;
  para: DestinoMensaje;      // profesor | institucion
  titulo: string;
  subtitulo: string;
  nombre: string;            // nombre del deportista/calidoso (para guardar en el mensaje)
  proyecto: string;
  avatar: string;
  icono?: 'profe' | 'inst';
  bandeja: Bandeja;
  profe: string;             // el formador del proyecto, para poder filtrar
};

export default function MensajesPage() {
  const router  = useRouter();
  const usuario = useAuthStore(s => s.usuario);

  const [mounted,    setMounted]    = useState(false);
  const [deps,       setDeps]       = useState<Deportista[]>([]);
  const [mensajes,   setMensajes]   = useState<Mensaje[]>([]);
  const [convActiva, setConvActiva] = useState<string | null>(null);
  const [nuevoMsg,   setNuevoMsg]   = useState('');
  /* EL WHATSAPP ES OBLIGATORIO PARA ESCRIBIR (dirección, 29/08/2026): sin un
     número no se le puede responder al acudiente, y era lo que más se perdía.
     Queda guardado, así que solo lo escribe la primera vez. */
  const [miWhatsApp, setMiWhatsApp] = useState('');
  const [busqueda,   setBusqueda]   = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  /* LAS TRES BANDEJAS Y EL FILTRO POR PROFE (dirección, 29/08/2026). */
  const [bandeja, setBandeja]       = useState<Bandeja | ''>('');
  const [filtroProfe, setFiltroProfe] = useState('');
  const [profePorProy, setProfePorProy] = useState<Record<string, string>>({});
  const [telefonos, setTelefonos]   = useState<Record<string, any>>({});
  const [enviando,   setEnviando]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const rol = usuario?.rol as string | undefined;
  const esCalidoso = rol === 'padre' || rol === 'deportista';
  const esProfe    = rol === 'profesor';

  /* ── Carga de datos ── */
  async function recargar() {
    try {
      const [d, m] = await Promise.all([getDeportistas(), getMensajes()]);
      setDeps(d); setMensajes(m);
    } catch {}
  }
  useEffect(() => { setMounted(true); recargar(); }, []);
  /* Quién es el formador de cada proyecto, y el WhatsApp de cada deportista. */
  useEffect(() => {
    (async () => {
      try {
        const profes = await getProfes();
        const mapa: Record<string, string> = {};
        (profes ?? []).forEach(p => {
          (p.proyectos ?? []).forEach(py => {
            const k = up(String(py ?? ''));
            if (k && !mapa[k]) mapa[k] = up(String(p.usuario ?? ''));
          });
        });
        setProfePorProy(mapa);
      } catch { /* nada */ }
      try {
        const tels = await getTelefonosWhatsApp();
        setTelefonos(tels);
        try {
          const mio = String((tels as any)?.[localStorage.getItem('futuro-calidoso-id') ?? '']?.telefono ?? '');
          if (mio) setMiWhatsApp(mio);
        } catch { /* nada */ }
      } catch { /* nada */ }
    })();
  }, []);
  // Refresco periódico para ver mensajes nuevos
  useEffect(() => {
    const t = setInterval(recargar, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [convActiva, mensajes]);

  /* ── Identidad del calidoso ── */
  const calidosoId     = mounted ? (localStorage.getItem('futuro-calidoso-id')     ?? '') : '';
  const calidosoNombre = mounted ? (localStorage.getItem('futuro-calidoso-nombre') ?? '') : '';
  const calidosoDep = useMemo(
    () => (esCalidoso ? deps.find(d => d.id === calidosoId) : null),
    [deps, calidosoId, esCalidoso]
  );
  const calidosoCodigo = (calidosoDep ? codigoDe(calidosoDep) : '') || (mounted ? (localStorage.getItem('futuro-calidoso-codigo') ?? '') : '');
  const calidosoProyecto = calidosoDep ? proyectoDe(calidosoDep) : '';

  /* ── Proyectos y códigos del profe ── */
  const profeProyectos = useMemo<string[]>(() => {
    if (!esProfe || !mounted) return [];
    try { return JSON.parse(localStorage.getItem('futuro-profe-proyectos') ?? '[]'); } catch { return []; }
  }, [esProfe, mounted]);
  const profeCodigos = useMemo(() => {
    const set = new Set<string>();
    if (!esProfe) return set;
    const proySet = new Set(profeProyectos.map(up));
    deps.forEach(d => { if (proySet.has(up(proyectoDe(d)))) set.add(up(codigoDe(d))); });
    return set;
  }, [deps, profeProyectos, esProfe]);

  /* ── Mensajes visibles según el rol ── */
  const visibles = useMemo(() => {
    if (esCalidoso)   return mensajes.filter(m => up(m.codigo) === up(calidosoCodigo));
    if (esProfe)      return mensajes.filter(m => m.para === 'profesor'   && profeCodigos.has(up(m.codigo)));
    /* LA ADMINISTRACIÓN VE TODO (dirección, 29/08/2026): los que van a la
       institución —director y contable— y también los que los papás le
       escriben al formador, para poder vigilar que sí les respondan. */
    return mensajes;
  }, [mensajes, esCalidoso, esProfe, calidosoCodigo, profeCodigos]);

  /* ── Construcción de conversaciones ── */
  const conversaciones = useMemo<Conv[]>(() => {
    if (esCalidoso) {
      return [
        /* TRES BANDEJAS PARA EL ACUDIENTE (dirección, 29/08/2026): así ve
           por separado si le respondió el director, el área contable o el
           profesor de su hijo. */
        { key: 'DIRECTOR',  codigo: calidosoCodigo, para: 'institucion', titulo: 'Dirección',     subtitulo: 'Mensajes al director',   nombre: calidosoNombre, proyecto: calidosoProyecto, avatar: 'DI', icono: 'inst',  bandeja: 'DIRECTOR', profe: '' },
        { key: 'CONTABLE',  codigo: calidosoCodigo, para: 'institucion', titulo: 'Área contable', subtitulo: 'Pagos y cartera',        nombre: calidosoNombre, proyecto: calidosoProyecto, avatar: 'CO', icono: 'inst',  bandeja: 'CONTABLE', profe: '' },
        { key: 'FORMADOR',  codigo: calidosoCodigo, para: 'profesor',    titulo: 'Profesor',      subtitulo: 'El formador de tu hijo', nombre: calidosoNombre, proyecto: calidosoProyecto, avatar: 'PR', icono: 'profe', bandeja: 'FORMADOR', profe: '' },
      ];
    }
    const map = new Map<string, Conv>();
    // Ordenar por más reciente
    const ordenados = [...visibles].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    ordenados.forEach(m => {
      /* UNA CONVERSACIÓN POR CÓDIGO **Y POR BANDEJA** (dirección, 29/08/2026):
         el mismo papá puede tener un hilo con el director y otro con el
         contable; si la llave fuera solo el código se pisarían. */
      const b = bandejaDe(m);
      const key = `${up(m.codigo)}|${b}`;
      if (map.has(key)) return;
      const dep = deps.find(d => up(codigoDe(d)) === up(m.codigo));
      const nombre = m.nombre || dep?._nombre || m.codigo;
      const proyecto = m.proyecto || proyectoDe(dep);
      map.set(key, {
        key, codigo: m.codigo, para: m.para,
        titulo: nombre,
        /* EN LOS MENSAJES AL FORMADOR SE DICE DE QUÉ FORMADOR SE TRATA
           (dirección, 29/08/2026): es lo que permite vigilar si están
           respondiendo. */
        subtitulo: `Código ${m.codigo}${proyecto ? ' · ' + proyecto : ''}`
          + (b === 'FORMADOR' && (profePorProy[up(proyecto)] ?? '')
              ? ` · PROFE ${profePorProy[up(proyecto)]}` : ''),
        nombre, proyecto, avatar: iniciales(nombre),
        bandeja: b,
        profe: profePorProy[up(proyecto)] ?? '',
      });
    });
    return [...map.values()];
  }, [esCalidoso, esProfe, visibles, deps, calidosoCodigo, calidosoNombre, calidosoProyecto, profePorProy]);

  /* ── Seleccionar primera conversación por defecto ── */
  useEffect(() => {
    if (convActiva && conversaciones.some(c => c.key === convActiva)) return;
    if (conversaciones.length) setConvActiva(conversaciones[0].key);
  }, [conversaciones, convActiva]);

  const conv = conversaciones.find(c => c.key === convActiva) ?? null;

  /* ── Mensajes del hilo activo ── */
  const hilo = useMemo(() => {
    if (!conv) return [];
    return visibles
      .filter(m => up(m.codigo) === up(conv.codigo) && bandejaDe(m) === conv.bandeja)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [visibles, conv, esCalidoso]);

  const soyEmisor = (m: Mensaje) =>
    esCalidoso ? m.de === 'calidoso' : esProfe ? m.de === 'profesor' : m.de === 'admin';

  /* ── PENDIENTES POR RESPONDER ─────────────────────────────────
     Una conversación está pendiente cuando el ÚLTIMO mensaje lo escribió
     el calidoso y todavía nadie le contestó. Ojo: abrir la conversación NO
     la quita de pendientes; solo se quita cuando de verdad se responde. */
  const ultimoDe = (c: Conv): Mensaje | undefined =>
    visibles
      .filter(m => up(m.codigo) === up(c.codigo) && m.para === c.para)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  const clavesPendientes = useMemo(() => {
    const s = new Set<string>();
    conversaciones.forEach(c => {
      const u = visibles
        .filter(m => up(m.codigo) === up(c.codigo) && bandejaDe(m) === c.bandeja)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (u && u.de === 'calidoso') s.add(c.key);
    });
    return s;
  }, [conversaciones, visibles, esCalidoso]);

  const totalPendientes = clavesPendientes.size;
  const totalSinLeer = useMemo(
    () => visibles.filter(m => m.de === 'calidoso' && !m.leido).length,
    [visibles]
  );

  /* ── No leídos por conversación ── */
  const noLeidosDe = (c: Conv): number => {
    if (esCalidoso) {
      return visibles.filter(m => m.para === c.para && m.de !== 'calidoso' && !m.leido).length;
    }
    return visibles.filter(m => up(m.codigo) === up(c.codigo) && m.de === 'calidoso' && !m.leido).length;
  };

  /* ── Abrir conversación (marca como leídos los del calidoso) ── */
  function abrir(key: string) {
    setConvActiva(key);
    const c = conversaciones.find(x => x.key === key);
    if (c && !esCalidoso && c.codigo) {
      marcarConversacionLeida(c.codigo, c.para).then(recargar).catch(() => {});
    }
  }

  /* ── Enviar ── */
  async function enviar() {
    const texto = nuevoMsg.trim();
    if (!texto || !conv || enviando) return;
    if (!conv.codigo) { alert('No se pudo identificar el deportista de esta conversación.'); return; }

    /* SIN WHATSAPP NO SE MANDA (dirección, 29/08/2026). Solo se le exige al
       acudiente: la administración y el profe ya tienen por dónde responder. */
    let telLimpio = '';
    if (esCalidoso) {
      telLimpio = celularWhatsApp(miWhatsApp);
      if (!telLimpio) {
        alert('Escribe tu número de WhatsApp para poder responderte.\n\nSon 10 números, empezando por 3.');
        return;
      }
    }
    setEnviando(true);
    const de = esCalidoso ? 'calidoso' : esProfe ? 'profesor' : 'admin';
    const deportistaId = esCalidoso
      ? calidosoId
      : (deps.find(d => up(codigoDe(d)) === up(conv.codigo))?.id ?? '');
    /* El número queda anotado al final del mensaje —para que se vea en el
       hilo— y guardado en la ficha, para que no lo tenga que volver a
       escribir la próxima vez. */
    /* EL ASUNTO LO PONE LA PLATAFORMA (dirección, 29/08/2026): así el
       mensaje cae siempre en la bandeja correcta y no depende de lo que el
       papá escriba. */
    const conAsunto = esCalidoso && !new RegExp(ASUNTO[conv.bandeja], 'i').test(texto)
      ? `${ASUNTO[conv.bandeja]}\n${texto}`
      : texto;
    const textoFinal = esCalidoso && telLimpio
      ? `${conAsunto}\n\nWhatsApp de contacto: ${miWhatsApp.trim()}`
      : conAsunto;
    if (esCalidoso && telLimpio && deportistaId) {
      try {
        await guardarTelefonoWhatsApp(deportistaId, miWhatsApp.trim(), {
          codigo: conv.codigo, nombre: conv.nombre,
        });
      } catch { /* si no se pudo guardar, el mensaje igual va con el número */ }
    }
    const ok = await enviarMensaje({
      deportistaId, codigo: conv.codigo, nombre: conv.nombre,
      texto: textoFinal, de: de as any, para: conv.para, proyecto: conv.proyecto,
    });
    setEnviando(false);
    if (ok) { setNuevoMsg(''); await recargar(); }
    else alert('No se pudo enviar el mensaje. Revisa la conexión.');
  }

  /* ── RESPONDER POR WHATSAPP ───────────────────────────────────────────────
     Se arma el mensaje con lo que el acudiente escribió y, debajo, la palabra
     RESPUESTA con lo que se haya escrito en la caja. Así el papá lee en el
     mismo WhatsApp a qué se le está respondiendo. — dirección, 29/08/2026 */
  function abrirWhatsApp() {
    if (!conv) return;
    const dep = deps.find(d => up(codigoDe(d)) === up(conv.codigo));
    /* PRIMERO EL NÚMERO QUE ÉL MISMO DEJÓ en el mensaje —"WhatsApp de
       contacto: 311…"—, que es el bueno; después el guardado en su ficha, y
       de último el celular del acudiente. — dirección, 29/08/2026 */
    const deSuMensaje = (() => {
      for (const m of [...hilo].reverse()) {
        if (m.de !== 'calidoso') continue;
        const cap = String(m.texto ?? '').match(/whats?app[^0-9]{0,20}([0-9][0-9\s.-]{8,})/i);
        const n = celularWhatsApp(cap?.[1] ?? '');
        if (n) return n;
      }
      return '';
    })();
    const guardado = telefonos?.[dep?.id ?? '']?.telefono ?? '';
    const tel = deSuMensaje || celularWhatsApp(guardado || celularDe(dep));
    if (!tel) {
      alert('Este deportista no tiene un número de WhatsApp válido en su ficha.');
      return;
    }
    /* El último mensaje que escribió el acudiente: eso es lo que se cita. */
    const suyo = [...hilo].reverse().find(m => m.de === 'calidoso');
    const respuesta = nuevoMsg.trim();
    const texto =
      `Buen día, ${conv.nombre}.\n\n` +
      (suyo ? `Usted nos escribió:\n"${suyo.texto.trim()}"\n\n` : '') +
      `RESPUESTA:\n${respuesta || ''}` +
      `\n\nACADEMIA DE FÚTBOL FUTURO ANTIOQUIA`;
    const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const enlace = esCelular
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`;
    window.open(enlace, 'whatsappFA');
  }

  /* ── Filtro de búsqueda + "solo pendientes" (profe / institución) ── */
  const convsFiltradas = conversaciones.filter(c => {
    if (bandeja && c.bandeja !== bandeja) return false;
    if (filtroProfe && c.profe !== filtroProfe) return false;
    if (soloPendientes && !clavesPendientes.has(c.key)) return false;
    const t = busqueda.trim().toLowerCase();
    if (!t) return true;
    return c.titulo.toLowerCase().includes(t) || c.codigo.toLowerCase().includes(t);
  });

  const tituloRol = esCalidoso ? 'Escríbele a tu profesor o a la institución'
    : esProfe ? 'Mensajes de tus deportistas'
    : 'Mensajes para la institución';

  return (
    <div className="min-h-screen bg-[#333F50]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="text-white/80 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white leading-tight">Mensajes</p>
          <p className="text-white/70 text-[11px] leading-tight truncate">{tituloRol}</p>
        </div>
        {/* CONTADOR DE PENDIENTES POR RESPONDER */}
        <div className="ml-auto flex items-center gap-3">
          {totalPendientes > 0 ? (
            <div className="bg-amber-400 text-[#064e1e] rounded-xl px-3 py-1.5 leading-tight text-center shadow">
              <p className="font-black text-xl">{totalPendientes}</p>
              <p className="text-[10px] font-black uppercase">
                {esCalidoso ? 'esperando respuesta' : 'por responder'}
              </p>
            </div>
          ) : (
            <div className="bg-white/20 text-white rounded-xl px-3 py-1.5 leading-tight text-center">
              <p className="text-[11px] font-black uppercase">
                {esCalidoso ? 'Sin pendientes' : 'Todo respondido'}
              </p>
            </div>
          )}
          <div className="text-right leading-tight hidden lg:block">
            <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-2 sm:px-6 py-4 sm:py-6">
        <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden flex h-[calc(100vh-150px)]">

          {/* Lista de conversaciones */}
          <div className={cn('border-r border-[#4A5568] flex flex-col flex-shrink-0 w-full sm:w-72', conv && 'hidden sm:flex')}>
            {!esCalidoso && (
              <div className="p-3 border-b border-[#4A5568] space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    placeholder="Buscar deportista o código..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#333F50] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  />
                </div>
                {/* Resumen: cuántas faltan por responder y cuántas no se han leído */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setSoloPendientes(v => !v)}
                    title="Mostrar solo las conversaciones que faltan por responder"
                    className={cn(
                      'text-[11px] font-black px-2.5 py-1 rounded-full border transition',
                      soloPendientes
                        ? 'bg-amber-400 border-amber-400 text-[#064e1e]'
                        : 'bg-[rgba(224,163,58,.14)] border-amber-200 text-[#E0A33A] hover:bg-amber-100'
                    )}
                  >
                    {totalPendientes} por responder
                  </button>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-[#2B3547] text-white/70">
                    {totalSinLeer} sin leer
                  </span>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-[#2B3547] text-white/70">
                    {conversaciones.length} en total
                  </span>
                </div>
                {soloPendientes && (
                  <p className="text-[11px] text-[#E0A33A] font-semibold">
                    Viendo solo pendientes. Vuelve a tocar el botón para ver todas.
                  </p>
                )}

                {/* LAS TRES BANDEJAS (dirección, 29/08/2026): al director, al
                    área contable o al formador. La que esté prendida se pone
                    naranja, como en toda la plataforma. */}
                {!esProfe && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['DIRECTOR', 'CONTABLE', 'FORMADOR'] as Bandeja[]).map(b => {
                      const cuantos = conversaciones.filter(c => c.bandeja === b).length;
                      const prendido = bandeja === b;
                      return (
                        <button key={b}
                          onClick={() => { setBandeja(prendido ? '' : b); if (b !== 'FORMADOR') setFiltroProfe(''); }}
                          title={`Ver solo los mensajes al ${b.toLowerCase()}`}
                          className="text-[10.5px] font-black px-2 py-1 rounded-lg border"
                          style={{
                            background: prendido ? '#E0A33A' : 'transparent',
                            borderColor: prendido ? '#E0A33A' : '#4A5568',
                            color: '#ffffff',
                          }}>
                          {b} · {cuantos}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Y si son los del formador, por cuál formador. */}
                {!esProfe && bandeja === 'FORMADOR' && (
                  <select
                    value={filtroProfe}
                    onChange={e => setFiltroProfe(e.target.value)}
                    title="Ver los mensajes de los deportistas de un formador"
                    className="w-full text-[11px] font-black rounded-lg px-2 py-1 outline-none cursor-pointer"
                    style={{
                      background: filtroProfe ? '#E0A33A' : '#2B3547',
                      border: `1px solid ${filtroProfe ? '#E0A33A' : '#4A5568'}`,
                      color: '#ffffff',
                    }}>
                    <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS PROFES</option>
                    {[...new Set(conversaciones.filter(c => c.bandeja === 'FORMADOR').map(c => c.profe).filter(Boolean))]
                      .sort((a, b) => a.localeCompare(b, 'es'))
                      .map(pr => (
                        <option key={pr} value={pr} style={{ color: '#111827', backgroundColor: 'white' }}>{pr}</option>
                      ))}
                  </select>
                )}
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {convsFiltradas.length === 0 && (
                <div className="p-6 text-center text-white/40 text-sm">
                  {soloPendientes ? '¡No queda ninguna conversación por responder!'
                    : esProfe ? 'Aún no tienes mensajes de tus deportistas.' : 'Aún no hay mensajes.'}
                </div>
              )}
              {convsFiltradas.map(c => {
                const nl = noLeidosDe(c);
                const ultimo = ultimoDe(c);
                const pend = clavesPendientes.has(c.key);
                return (
                  <button key={c.key} onClick={() => abrir(c.key)}
                    className={cn(
                      'w-full p-4 flex items-start gap-3 text-left hover:bg-[#333F50] transition border-b border-[#4A5568]',
                      pend && 'border-l-4 border-l-amber-400',
                      convActiva === c.key && 'bg-[#E8F5E9]'
                    )}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                      {c.icono === 'profe' ? <GraduationCap className="w-5 h-5 text-white" />
                        : c.icono === 'inst' ? <Building2 className="w-5 h-5 text-white" />
                        : <span className="text-white text-xs font-bold">{c.avatar}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-white truncate">{c.titulo}</p>
                        {ultimo && (
                          <span className="text-[10px] text-white/40 flex-shrink-0 text-right leading-tight">
                            {diaCorto(ultimo.createdAt)}<br />{horaCorta(ultimo.createdAt)}
                          </span>
                        )}
                      </div>
                      {!esCalidoso && c.codigo && (
                        <p className="text-[10px] font-bold text-[#16a34a] mt-0.5 truncate">
                          Código {c.codigo}
                          {/* EL PROFE, EN LA LISTA (dirección, 29/08/2026): con
                              el nombre de USUARIO —MARTIN, no "MARTIN MORA"—,
                              que es como se le dice en toda la plataforma. */}
                          {c.bandeja === 'FORMADOR' && c.profe && (
                            <span style={{ color: '#5BE39B' }}>{'  ·  PROFE '}{c.profe}</span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-white/40 truncate mt-0.5">{ultimo ? ultimo.texto : c.subtitulo}</p>
                      {pend && (
                        <span className="inline-block mt-1 bg-amber-400 text-[#064e1e] text-[10px] font-black px-2 py-0.5 rounded-full">
                          {esCalidoso ? 'ESPERANDO RESPUESTA' : 'FALTA RESPONDER'}
                        </span>
                      )}
                    </div>
                    {nl > 0 && (
                      <span className="w-5 h-5 bg-[#16a34a] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">{nl}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat activo */}
          {conv ? (
            <div className="flex-1 flex flex-col min-w-0">
              {/* Cabecera chat */}
              <div className="p-4 border-b border-[#4A5568] flex items-center gap-3">
                <button onClick={() => setConvActiva(null)} className="sm:hidden text-white/70"><ArrowLeft className="w-5 h-5" /></button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                  {conv.icono === 'profe' ? <GraduationCap className="w-5 h-5 text-white" />
                    : conv.icono === 'inst' ? <Building2 className="w-5 h-5 text-white" />
                    : <span className="text-white text-xs font-bold">{conv.avatar}</span>}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{conv.titulo}</p>
                  <p className="text-xs text-white/40 truncate">{conv.subtitulo}</p>
                  {!esCalidoso && (
                    <p className="text-[10.5px] font-black mt-0.5" style={{ color: '#5BE39B' }}>
                      {conv.bandeja === 'FORMADOR'
                        ? `MENSAJE AL FORMADOR${conv.profe ? ' · ' + conv.profe : ''}`
                        : conv.bandeja === 'CONTABLE' ? 'MENSAJE AL ÁREA CONTABLE'
                        : 'MENSAJE AL DIRECTOR'}
                    </p>
                  )}
                </div>
                {clavesPendientes.has(conv.key) && (
                  <span className="ml-auto bg-amber-400 text-[#064e1e] text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0">
                    {esCalidoso ? 'ESPERANDO RESPUESTA' : 'FALTA RESPONDER'}
                  </span>
                )}

                {/* RESPONDER POR WHATSAPP (dirección, 29/08/2026): abre el chat
                    del acudiente con lo que él escribió citado y la palabra
                    RESPUESTA debajo, para escribirle de una. Si ya hay algo
                    escrito en la caja de abajo, se manda eso mismo. */}
                {!esCalidoso && (
                  <button
                    onClick={abrirWhatsApp}
                    title="Responder por WhatsApp al acudiente"
                    className={cn('ml-auto flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-white flex items-center gap-1.5',
                      clavesPendientes.has(conv.key) && 'ml-2')}
                    style={{ background: '#25D366' }}>
                    WHATSAPP
                  </button>
                )}
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f7faf8]">
                {hilo.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center text-white/40">
                    <div>
                      <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{esCalidoso ? 'Escribe el primer mensaje.' : 'Sin mensajes todavía.'}</p>
                    </div>
                  </div>
                )}
                {hilo.map(m => {
                  const yo = soyEmisor(m);
                  return (
                    <div key={m.id} className={cn('flex', yo ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[78%] px-4 py-2.5 rounded-2xl text-sm',
                        yo ? 'bg-[#16a34a] text-white rounded-br-sm' : 'bg-[#3C4759] border border-[#4A5568] text-white rounded-bl-sm'
                      )}>
                        {!yo && !esCalidoso && (
                          <p className="text-[10px] font-bold text-[#16a34a] mb-0.5">{m.nombre || 'Calidoso'}</p>
                        )}
                        {!yo && esCalidoso && (
                          <p className="text-[10px] font-bold text-[#16a34a] mb-0.5">{m.de === 'profesor' ? 'Profesor' : 'Institución'}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={cn('text-[10px] font-bold mt-1', yo ? 'text-white/60' : 'text-white/40')}>{fechaHora(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* EL WHATSAPP, OBLIGATORIO PARA EL ACUDIENTE (dirección,
                  29/08/2026). Se muestra solo a él; queda guardado. */}
              {esCalidoso && (
                <div className="px-3 pt-3 flex items-center gap-2">
                  <span className="text-[11px] font-black text-white/60 shrink-0">MI WHATSAPP</span>
                  <input
                    value={miWhatsApp}
                    onChange={e => setMiWhatsApp(e.target.value)}
                    inputMode="numeric"
                    placeholder="3113795701"
                    className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                    style={{
                      background: '#2B3547',
                      border: `1px solid ${celularWhatsApp(miWhatsApp) ? '#00B050' : '#E0A33A'}`,
                    }} />
                  {!celularWhatsApp(miWhatsApp) && (
                    <span className="text-[10.5px] font-black" style={{ color: '#E0A33A' }}>
                      OBLIGATORIO
                    </span>
                  )}
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-[#4A5568] flex gap-2 items-end">
                <textarea
                  rows={1}
                  placeholder={esCalidoso ? `Mensaje para ${conv.titulo.toLowerCase()}...` : 'Escribe una respuesta...'}
                  value={nuevoMsg}
                  onChange={e => setNuevoMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  className="flex-1 border border-[#4A5568] rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#16a34a] max-h-28"
                />
                <button onClick={enviar} disabled={enviando || !nuevoMsg.trim()}
                  className="w-10 h-10 bg-[#16a34a] text-white rounded-xl flex items-center justify-center hover:bg-[#064e1e] transition disabled:opacity-40 flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 hidden sm:flex items-center justify-center text-white/40">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona una conversación</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
