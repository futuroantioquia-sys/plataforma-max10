'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, Search, ArrowLeft, GraduationCap, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { getMensajes, enviarMensaje, marcarConversacionLeida, getDeportistas } from '@/lib/db';
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

function iniciales(nombre: string): string {
  return (nombre || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
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
};

export default function MensajesPage() {
  const router  = useRouter();
  const usuario = useAuthStore(s => s.usuario);

  const [mounted,    setMounted]    = useState(false);
  const [deps,       setDeps]       = useState<Deportista[]>([]);
  const [mensajes,   setMensajes]   = useState<Mensaje[]>([]);
  const [convActiva, setConvActiva] = useState<string | null>(null);
  const [nuevoMsg,   setNuevoMsg]   = useState('');
  const [busqueda,   setBusqueda]   = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
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
    return mensajes.filter(m => m.para === 'institucion');   // institución
  }, [mensajes, esCalidoso, esProfe, calidosoCodigo, profeCodigos]);

  /* ── Construcción de conversaciones ── */
  const conversaciones = useMemo<Conv[]>(() => {
    if (esCalidoso) {
      return [
        { key: 'PROFESOR',    codigo: calidosoCodigo, para: 'profesor',    titulo: 'Profesor',    subtitulo: 'Tu formador',      nombre: calidosoNombre, proyecto: calidosoProyecto, avatar: 'PR', icono: 'profe' },
        { key: 'INSTITUCION', codigo: calidosoCodigo, para: 'institucion', titulo: 'Institución', subtitulo: 'Administración',   nombre: calidosoNombre, proyecto: calidosoProyecto, avatar: 'IN', icono: 'inst' },
      ];
    }
    const para: DestinoMensaje = esProfe ? 'profesor' : 'institucion';
    const map = new Map<string, Conv>();
    // Ordenar por más reciente
    const ordenados = [...visibles].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    ordenados.forEach(m => {
      const key = up(m.codigo);
      if (map.has(key)) return;
      const dep = deps.find(d => up(codigoDe(d)) === key);
      const nombre = m.nombre || dep?._nombre || m.codigo;
      map.set(key, {
        key, codigo: m.codigo, para,
        titulo: nombre,
        subtitulo: `Código ${m.codigo}${m.proyecto || proyectoDe(dep) ? ' · ' + (m.proyecto || proyectoDe(dep)) : ''}`,
        nombre, proyecto: m.proyecto || proyectoDe(dep), avatar: iniciales(nombre),
      });
    });
    return [...map.values()];
  }, [esCalidoso, esProfe, visibles, deps, calidosoCodigo, calidosoNombre, calidosoProyecto]);

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
      .filter(m => up(m.codigo) === up(conv.codigo) && m.para === conv.para)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [visibles, conv]);

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
        .filter(m => up(m.codigo) === up(c.codigo) && m.para === c.para)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (u && u.de === 'calidoso') s.add(c.key);
    });
    return s;
  }, [conversaciones, visibles]);

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
    setEnviando(true);
    const de = esCalidoso ? 'calidoso' : esProfe ? 'profesor' : 'admin';
    const deportistaId = esCalidoso
      ? calidosoId
      : (deps.find(d => up(codigoDe(d)) === up(conv.codigo))?.id ?? '');
    const ok = await enviarMensaje({
      deportistaId, codigo: conv.codigo, nombre: conv.nombre,
      texto, de: de as any, para: conv.para, proyecto: conv.proyecto,
    });
    setEnviando(false);
    if (ok) { setNuevoMsg(''); await recargar(); }
    else alert('No se pudo enviar el mensaje. Revisa la conexión.');
  }

  /* ── Filtro de búsqueda + "solo pendientes" (profe / institución) ── */
  const convsFiltradas = conversaciones.filter(c => {
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
            <p className="text-white/75 text-[9px] font-semibold tracking-wide">CONECTA · GESTIONA · GANA</p>
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
                        {ultimo && <span className="text-[10px] text-white/40 flex-shrink-0">{horaCorta(ultimo.createdAt)}</span>}
                      </div>
                      {!esCalidoso && c.codigo && (
                        <p className="text-[10px] font-bold text-[#16a34a] mt-0.5 truncate">Código {c.codigo}</p>
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
                </div>
                {clavesPendientes.has(conv.key) && (
                  <span className="ml-auto bg-amber-400 text-[#064e1e] text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0">
                    {esCalidoso ? 'ESPERANDO RESPUESTA' : 'FALTA RESPONDER'}
                  </span>
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
                        <p className={cn('text-[10px] mt-1', yo ? 'text-white/60' : 'text-white/40')}>{horaCorta(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

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
