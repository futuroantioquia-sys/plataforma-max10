'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Send, MessageCircle } from 'lucide-react';
import { getDeportistas, enviarMensaje, getMensajes } from '@/lib/db';
import type { Deportista, Mensaje } from '@/lib/db';

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
  return k ? String(dep._columnas[k] ?? '').trim() : '';
}
function fmtHora(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function MensajesCalidosoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [dep,      setDep]      = useState<Deportista | null>(null);
  const [realId,   setRealId]   = useState<string>(id);
  const [texto,    setTexto]    = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const codVal = dep ? getCol(dep, /^c[oó]d/i) : '';
  const nombre = dep?._nombre ?? '';

  useEffect(() => {
    getDeportistas().then(lista => {
      let found = lista.find(d => d.id === id);
      if (!found) {
        try {
          const n = (localStorage.getItem('futuro-calidoso-nombre') ?? '').trim().toLowerCase();
          if (n) found = lista.find(d => (d._nombre ?? '').trim().toLowerCase() === n);
        } catch {}
      }
      if (found) { setDep(found); setRealId(found.id); }
      else {
        try {
          const n = localStorage.getItem('futuro-calidoso-nombre') ?? '';
          setDep({ id, _nombre: n || id, _columnas: {} });
        } catch { setDep({ id, _nombre: id, _columnas: {} }); }
      }
    }).catch(() => setDep({ id, _nombre: id, _columnas: {} }));
  }, [id]);

  const recargar = async (cod: string) => {
    const m = await getMensajes(cod || undefined);
    const propios = cod
      ? m.filter(x => x.codigo === cod)
      : m.filter(x => x.deportistaId === realId || x.deportistaId === id);
    // orden ascendente para el chat
    propios.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    setMensajes(propios);
  };

  useEffect(() => {
    if (!dep) return;
    const cod = getCol(dep, /^c[oó]d/i);
    recargar(cod).catch(() => {}).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const ok = await enviarMensaje({ deportistaId: realId, codigo: codVal, nombre, texto: t, de: 'calidoso' });
    setEnviando(false);
    if (ok) { setTexto(''); recargar(codVal); }
    else alert('No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.');
  };

  return (
    <div data-hoja="clara" className="min-h-screen bg-[#f1f5f9] flex flex-col">
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push(`/alumnos/${id}`)} className="text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-black text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5" /> Mensajes
          </h1>
          <p className="text-white/60 text-xs">Conversación con la administración</p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 flex flex-col min-h-0">
        {/* Hilo */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          {cargando ? (
            <p className="text-center text-gray-400 text-sm py-8">Cargando…</p>
          ) : mensajes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 mt-4">
              <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Escribe tu primer mensaje a la administración.</p>
            </div>
          ) : mensajes.map(m => (
            <div key={m.id} className={`flex ${m.de === 'calidoso' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${
                m.de === 'calidoso' ? 'bg-[#16a34a] text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {m.de === 'admin' && <p className="text-[10px] font-black text-[#16a34a] mb-0.5">Administración</p>}
                <p className="whitespace-pre-wrap">{m.texto}</p>
                <p className={`text-[10px] mt-1 ${m.de === 'calidoso' ? 'text-white/60' : 'text-gray-400'}`}>{fmtHora(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Compositor */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex gap-2 items-end">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Escribe tu mensaje…"
            rows={2}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none"
          />
          <button onClick={enviar} disabled={enviando || !texto.trim()}
            className="w-11 h-11 bg-[#16a34a] text-white rounded-xl flex items-center justify-center hover:bg-[#064e1e] transition disabled:opacity-50 flex-shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
