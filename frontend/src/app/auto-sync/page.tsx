'use client';
import { useEffect, useState } from 'react';

export default function AutoSyncPage() {
  const [status, setStatus] = useState('Iniciando sincronización...');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function sync() {
      try {
        // Verificar que sea administrador
        const cookies = document.cookie.split(';').map(c => c.trim());
        const isAdmin = cookies.some(c => c === 'futuro-session=1');
        if (!isAdmin) {
          setStatus('❌ Solo el administrador puede sincronizar. Inicia sesión primero.');
          setError(true);
          return;
        }

        // Leer meta de localStorage
        const raw = localStorage.getItem('futuro_proyectos_meta');
        if (!raw) {
          setStatus('⚠️ No hay datos en localStorage para sincronizar.');
          setDone(true);
          return;
        }

        const meta = JSON.parse(raw) as Record<string, {
          nombreFormador: string;
          sede: string;
          dias: number[];
          edades: string[];
        }>;

        const entries = Object.entries(meta);
        if (entries.length === 0) {
          setStatus('⚠️ localStorage está vacío, nada que sincronizar.');
          setDone(true);
          return;
        }

        setStatus(`Sincronizando ${entries.length} proyectos a Supabase...`);

        const results = await Promise.allSettled(
          entries.map(([k, m]) => {
            const proy = k.split('::').slice(1).join('::');
            if (!proy) return Promise.resolve();
            return fetch('/api/jornada-proyecto', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proyecto:        proy,
                dias:            Array.isArray(m.dias)   ? m.dias   : [],
                sede:            m.sede            ?? '',
                nombre_formador: m.nombreFormador  ?? '',
                edades:          Array.isArray(m.edades) ? m.edades : [],
              }),
            });
          })
        );

        const ok   = results.filter(r => r.status === 'fulfilled').length;
        const fail = results.filter(r => r.status === 'rejected').length;

        if (fail === 0) {
          setStatus(`✅ ¡Listo! ${ok} proyectos guardados en Supabase. Vercel ya tiene los datos.`);
        } else {
          setStatus(`⚠️ ${ok} proyectos guardados, ${fail} con error. Intenta de nuevo.`);
        }
        setDone(true);
      } catch (e: any) {
        setStatus(`❌ Error inesperado: ${e?.message ?? 'Desconocido'}`);
        setError(true);
      }
    }
    sync();
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: '#1a1a1a',
        padding: '40px 48px',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.12)',
        textAlign: 'center',
        maxWidth: 480,
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 18 }}>
          {done ? '✅' : error ? '❌' : '🔄'}
        </div>
        <h2 style={{ color: '#fff', margin: '0 0 18px', fontWeight: 900, fontSize: 22 }}>
          Sync Proyectos → Supabase
        </h2>
        <p style={{
          color: error ? '#f87171' : done ? '#4ade80' : '#fbbf24',
          fontSize: 15,
          lineHeight: 1.7,
          margin: '0 0 28px',
        }}>
          {status}
        </p>
        {done && !error && (
          <a
            href="/usuarios"
            style={{
              display: 'inline-block',
              padding: '13px 32px',
              background: '#16a34a',
              color: '#fff',
              borderRadius: 12,
              textDecoration: 'none',
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            Ir a Proyectos y Formadores →
          </a>
        )}
        {error && (
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '13px 32px',
              background: '#dc2626',
              color: '#fff',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
