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

  /* ── Filtro de búsqueda (profe / institución) ── */
  const convsFiltradas = conversaciones.filter(c =>
    !busqueda.trim() ||
    c.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  const tituloRol = esCalidoso ? 'Escríbele a tu profesor o a la institución'
    : esProfe ? 'Mensajes de tus deportistas'
    : 'Mensajes para la institución';

  return (
    <div className="min-h-screen bg-gray-50">
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
        <div className="ml-auto text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-2 sm:px-6 py-4 sm:py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex h-[calc(100vh-150px)]">

          {/* Lista de conversaciones */}
          <div className={cn('border-r border-gray-100 flex flex-col flex-shrink-0 w-full sm:w-72', conv && 'hidden sm:flex')}>
            {!esCalidoso && (
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    placeholder="Buscar deportista o código..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {convsFiltradas.length === 0 && (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {esProfe ? 'Aún no tienes mensajes de tus deportistas.' : 'Aún no hay mensajes.'}
                </div>
              )}
              {convsFiltradas.map(c => {
                const nl = noLeidosDe(c);
                const ultimo = visibles
                  .filter(m => up(m.codigo) === up(c.codigo) && m.para === c.para)
                  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
                return (
                  <button key={c.key} onClick={() => abrir(c.key)}
                    className={cn(
                      'w-full p-4 flex items-start gap-3 text-left hover:bg-gray-50 transition border-b border-gray-50',
                      convActiva === c.key && 'bg-[#E8F5E9]'
                    )}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                      {c.icono === 'profe' ? <GraduationCap className="w-5 h-5 text-white" />
                        : c.icono === 'inst' ? <Building2 className="w-5 h-5 text-white" />
                        : <span className="text-white text-xs font-bold">{c.avatar}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.titulo}</p>
                        {ultimo && <span className="text-[10px] text-gray-400 flex-shrink-0">{horaCorta(ultimo.createdAt)}</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{ultimo ? ultimo.texto : c.subtitulo}</p>
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
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <button onClick={() => setConvActiva(null)} className="sm:hidden text-gray-500"><ArrowLeft className="w-5 h-5" /></button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                  {conv.icono === 'profe' ? <GraduationCap className="w-5 h-5 text-white" />
                    : conv.icono === 'inst' ? <Building2 className="w-5 h-5 text-white" />
                    : <span className="text-white text-xs font-bold">{conv.avatar}</span>}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{conv.titulo}</p>
                  <p className="text-xs text-gray-400 truncate">{conv.subtitulo}</p>
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f7faf8]">
                {hilo.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center text-gray-400">
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
                        yo ? 'bg-[#16a34a] text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
                      )}>
                        {!yo && !esCalidoso && (
                          <p className="text-[10px] font-bold text-[#16a34a] mb-0.5">{m.nombre || 'Calidoso'}</p>
                        )}
                        {!yo && esCalidoso && (
                          <p className="text-[10px] font-bold text-[#16a34a] mb-0.5">{m.de === 'profesor' ? 'Profesor' : 'Institución'}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={cn('text-[10px] mt-1', yo ? 'text-white/60' : 'text-gray-400')}>{horaCorta(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-gray-100 flex gap-2 items-end">
                <textarea
                  rows={1}
                  placeholder={esCalidoso ? `Mensaje para ${conv.titulo.toLowerCase()}...` : 'Escribe una respuesta...'}
                  value={nuevoMsg}
                  onChange={e => setNuevoMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#16a34a] max-h-28"
                />
                <button onClick={enviar} disabled={enviando || !nuevoMsg.trim()}
                  className="w-10 h-10 bg-[#16a34a] text-white rounded-xl flex items-center justify-center hover:bg-[#064e1e] transition disabled:opacity-40 flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 hidden sm:flex items-center justify-center text-gray-400">
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
