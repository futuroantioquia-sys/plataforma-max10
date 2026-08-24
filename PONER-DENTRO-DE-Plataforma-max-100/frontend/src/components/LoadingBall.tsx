export default function LoadingBall({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="min-h-screen bg-[#f0f7ff] flex flex-col items-center justify-center gap-4">

      {/* Balón animado */}
      <div style={{ animation: 'bounce-ball 0.65s infinite alternate cubic-bezier(0.4,0,0.2,1)' }}>
        <svg width="68" height="68" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          {/* Sombra interna */}
          <defs>
            <radialGradient id="bg-ball" cx="40%" cy="35%" r="60%">
              <stop offset="0%"   stopColor="#16a34a"/>
              <stop offset="100%" stopColor="#064e1e"/>
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#bg-ball)" stroke="#22c55e" strokeWidth="2.5"/>
          <polygon points="50,28 67,41 61,61 39,61 33,41" fill="white" opacity="0.92"/>
          <line x1="50" y1="28" x2="50" y2="8"  stroke="white" strokeWidth="2" opacity="0.6"/>
          <line x1="67" y1="41" x2="86" y2="34" stroke="white" strokeWidth="2" opacity="0.6"/>
          <line x1="61" y1="61" x2="75" y2="77" stroke="white" strokeWidth="2" opacity="0.6"/>
          <line x1="39" y1="61" x2="25" y2="77" stroke="white" strokeWidth="2" opacity="0.6"/>
          <line x1="33" y1="41" x2="14" y2="34" stroke="white" strokeWidth="2" opacity="0.6"/>
          {/* Brillo */}
          <ellipse cx="38" cy="36" rx="8" ry="5" fill="white" opacity="0.18" transform="rotate(-20,38,36)"/>
        </svg>
      </div>

      {/* Sombra del rebote */}
      <div
        style={{ animation: 'shadow-ball 0.65s infinite alternate cubic-bezier(0.4,0,0.2,1)' }}
        className="w-12 h-2.5 bg-green-900/20 rounded-full -mt-2 blur-sm"
      />

      {/* Texto */}
      <div className="flex items-center gap-2 mt-2">
        <p className="text-[#16a34a] font-black text-xs tracking-[0.2em] uppercase">{texto}</p>
      </div>

      {/* Dots pulsantes */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 bg-[#16a34a] rounded-full"
            style={{ animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes bounce-ball {
          from { transform: translateY(0px); }
          to   { transform: translateY(-20px); }
        }
        @keyframes shadow-ball {
          from { transform: scaleX(1);    opacity: 0.35; }
          to   { transform: scaleX(0.45); opacity: 0.1;  }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
