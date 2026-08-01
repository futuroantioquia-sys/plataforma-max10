'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, Search, RefreshCw, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMensajes, enviarMensaje, marcarConversacionLeida } from '@/lib/db';
import type { Mensaje } from '@/lib/db';

function fmtHora(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function iniciales(nombre: string): string {
  const p = (nombre || '?').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

type Conversacion = {
  key: string;
  codigo: string;
  nombre: string;
  deportistaId: string;
  mensajes: Mensaje[];   // orden ascendente
  ultimo: string;
  ultimoAt: string;
  noLeidos: number;
};

function agrupar(mensajes: Mensaje[]): Conversacion[] {
  const map = new Map<string, Conversacion>();
  // getMensajes viene descendente; recorrer y agrupar
  for (const m of mensajes) {
    const key = (m.codigo || m.deportistaId || m.nombre || '—').trim();
    let c = map.get(key);
    if (!c) {
      c = { key, codigo: m.codigo, nombre: m.nombre, deportistaId: m.deportistaId, mensajes: [], ultimo: '', ultimoAt: '', noLeidos: 0 };
      map.set(key, c);
    }
    c.mensajes.push(m);
    if (!c.nombre && m.nombre) c.nombre = m.nombre;
    if (!c.deportistaId && m.deportistaId) c.deportistaId = m.deportistaId;
    if (m.de === 'calidoso' && !m.leido) c.noLeidos++;
  }
  const convs = Array.from(map.values());
  for (const c of convs) {
    c.mensajes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)); // ascendente
    const last = c.mensajes[c.mensajes.length - 1];
    c.ultimo = last?.texto ?? '';
    c.ultimoAt = last?.createdAt ?? '';
  }
  convs.sort((a, b) => (a.ultimoAt < b.ultimoAt ? 1 : -1)); // más reciente arriba
  return convs;
}

export default function MensajesAdminPage() {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [activa,   setActiva]   = useState<string | null>(null);
  const [texto,    setTexto]    = useState('');
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const cargar = () => {
    setCargando(true);
    getMensajes().then(setMensajes).catch(() => {}).finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []);

  const convs = useMemo(() => agrupar(mensajes), [mensajes]);
  const totalNoLeidos = useMemo(() => convs.reduce((s, c) => s + c.noLeidos, 0), [convs]);
  const conv = convs.find(c => c.key === activa) ?? null;

  const convsFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q) || c.ultimo.toLowerCase().includes(q)
    );
  }, [convs, busqueda]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activa, mensajes]);

  const abrir = async (c: Conversacion) => {
    setActiva(c.key);
    if (c.noLeidos > 0) {
      setMensajes(prev => prev.map(m =>
        (m.codigo || m.deportistaId || m.nombre || '—').trim() === c.key && m.de === 'calidoso'
          ? { ...m, leido: true } : m
      ));
      if (c.codigo) await marcarConversacionLeida(c.codigo);
    }
  };

  const responder = async () => {
    const t = texto.trim();
    if (!t || !conv || enviando) return;
    setEnviando(true);
    const ok = await enviarMensaje({
      deportistaId: conv.deportistaId, codigo: conv.codigo, nombre: conv.nombre, texto: t, de: 'admin',
    });
    setEnviando(false);
    if (ok) { setTexto(''); cargar(); }
    else alert('No se pudo enviar la respuesta. Inténtalo de nuevo.');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white">← Volver</button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">Mensajes de calidosos</span>
        {totalNoLeidos > 0 && (
          <span className="bg-white text-[#16a34a] text-xs font-black rounded-full px-2 py-0.5">{totalNoLeidos} sin leer</span>
        )}
        <button onClick={cargar} className="ml-auto text-white/70 hover:text-white flex items-center gap-1 text-xs font-bold">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex h-[calc(100vh-160px)]">
          {/* Lista de conversaciones */}
          <div className="w-72 border-r border-gray-100 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input placeholder="Buscar calidoso o código..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {cargando ? (
                <p className="text-center text-gray-400 text-sm py-8">Cargando…</p>
              ) : convsFiltradas.length === 0 ? (
                <div className="text-center text-gray-400 py-10 px-4">
                  <Inbox className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin mensajes aún.</p>
                </div>
              ) : convsFiltradas.map(c => (
                <button key={c.key} onClick={() => abrir(c)}
                  className={cn('w-full p-4 flex items-start gap-3 text-left hover:bg-gray-50 transition border-b border-gray-50',
                    activa === c.key && 'bg-[#E8F5E9]')}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{iniciales(c.nombre)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre || 'Calidoso'}</p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtHora(c.ultimoAt)}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{c.codigo && <span className="font-semibold">#{c.codigo} · </span>}{c.ultimo}</p>
                  </div>
                  {c.noLeidos > 0 && (
                    <span className="w-5 h-5 bg-[#16a34a] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">{c.noLeidos}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat */}
          {conv ? (
            <div className="flex-1 flex flex-col min-w-0">
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{iniciales(conv.nombre)}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{conv.nombre || 'Calidoso'}</p>
                  <p className="text-xs text-gray-400">{conv.codigo ? `Código #${conv.codigo}` : 'Deportista'}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {conv.mensajes.map(m => (
                  <div key={m.id} className={cn('flex', m.de === 'admin' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[70%] px-4 py-2.5 rounded-2xl text-sm',
                      m.de === 'admin' ? 'bg-[#16a34a] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm')}>
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                      <p className={cn('text-[10px] mt-1', m.de === 'admin' ? 'text-white/60' : 'text-gray-400')}>{fmtHora(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="p-4 border-t border-gray-100 flex gap-3">
                <input type="text" placeholder="Escribe tu respuesta..." value={texto}
                  onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && responder()}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                <button onClick={responder} disabled={enviando || !texto.trim()}
                  className="w-10 h-10 bg-[#16a34a] text-white rounded-xl flex items-center justify-center hover:bg-[#064e1e] transition disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
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
