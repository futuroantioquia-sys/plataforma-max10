'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, CheckCircle, FileSpreadsheet, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';

function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload  = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar SheetJS. Verifica tu conexión.'));
    document.head.appendChild(s);
  });
}

export default function ImportarPage() {
  const router = useRouter();

  const [paso,      setPaso]      = useState<'subir' | 'elegir' | 'confirmar'>('subir');
  const [procesando,setProcesando]= useState(false);
  const [arrastrando,setArrastrando]= useState(false);
  const [columnas,  setColumnas]  = useState<string[]>([]);
  const [muestra,   setMuestra]   = useState<Record<string, string>[]>([]);
  const [colNombre, setColNombre] = useState('');
  const [archivo,   setArchivo]   = useState<File | null>(null);
  const [resultado, setResultado] = useState<{ total: number; errores: number } | null>(null);

  // ── Leer Excel y pasar al paso 2 ──────────────────────────────
  const procesarArchivo = useCallback(async (file: File) => {
    setProcesando(true);
    setArchivo(file);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string, string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' }) as any;

      if (!filas.length) throw new Error('El archivo está vacío o no tiene datos.');

      // Filtrar columnas sin encabezado o vacías
      const todasCols = Object.keys(filas[0]);
      const cols = todasCols.filter(c => {
        const limpio = c.trim();
        if (!limpio) return false;                          // encabezado vacío
        if (/^__EMPTY/i.test(limpio)) return false;        // SheetJS: celda sin header
        if (/^column\s*\d+$/i.test(limpio)) return false;  // "Column1", "Column2"...
        // Descartar columnas donde el 100% de los valores están vacíos
        const tieneValor = filas.some(f => String(f[c] ?? '').trim() !== '');
        return tieneValor;
      });
      setColumnas(cols);
      setMuestra(filas.slice(0, 4));

      // Auto-detectar columna de nombre del deportista
      const colLower = cols.map(c => c.toLowerCase());
      const candidatos = ['deportista', 'alumno', 'jugador', 'nombre completo', 'atleta'];
      const idx = colLower.findIndex(c => candidatos.some(k => c.includes(k)));
      setColNombre(idx >= 0 ? cols[idx] : cols[0]);

      setPaso('elegir');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setProcesando(false);
    }
  }, []);

  // ── Importar todos los datos ───────────────────────────────────
  async function importar() {
    if (!colNombre || !archivo) return;
    setProcesando(true);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await archivo.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string, string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' }) as any;

      let errores = 0;
      const deportistas: Deportista[] = filas
        .filter(fila => {
          const nombre = String(fila[colNombre] ?? '').trim();
          if (!nombre) { errores++; return false; }
          return true;
        })
        .map((fila, i) => ({
          id:        `dep-${Date.now()}-${i}`,
          _nombre:   String(fila[colNombre] ?? '').trim(),
          // Solo guardar columnas con encabezado válido y con algún valor
          _columnas: (() => {
            const cols: Record<string, string> = Object.fromEntries(
              Object.entries(fila)
                .filter(([k]) => {
                  const limpio = k.trim();
                  if (!limpio || /^__EMPTY/i.test(limpio) || /^column\s*\d+$/i.test(limpio)) return false;
                  return true;
                })
                .map(([k, v]) => [k, String(v ?? '').trim()])
            );
            // Regla: si el programa es Desarrollo Selección y la sede está vacía → INSTITUCIONAL
            const keySede    = Object.keys(cols).find(k => /sede/i.test(k.trim()));
            const keyPrograma = Object.keys(cols).find(k => /^program/i.test(k.trim()));
            if (keySede && keyPrograma) {
              const prog = (cols[keyPrograma] ?? '').toLowerCase();
              if (/^(desarrollo|selecci[oó]n)$|desarrollo.*selecc|selecc.*desarrollo/i.test(prog) && cols[keySede].trim() !== 'INSTITUCIONAL') {
                cols[keySede] = 'INSTITUCIONAL';
              }
            }
            return cols;
          })(),
        }));

      // Guardar en Supabase
      saveDeportistas(deportistas).catch(console.error);
      setResultado({ total: deportistas.length, errores });
      setPaso('confirmar');
    } catch (e: any) {
      alert('Error al importar: ' + e.message);
    } finally {
      setProcesando(false);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) procesarArchivo(f);
  }, [procesarArchivo]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/alumnos')} className="text-white/70 hover:text-white text-sm">← Volver</button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <FileSpreadsheet className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">Importar Deportistas desde Excel</span>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Pasos */}
        <div className="flex items-center gap-2">
          {['Subir archivo', 'Confirmar columna', 'Listo'].map((label, i) => {
            const keys = ['subir','elegir','confirmar'];
            const activo = keys[i] === paso;
            const hecho  = keys.indexOf(paso) > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                  hecho ? 'bg-[#16a34a] text-white' : activo ? 'bg-[#16a34a] text-white ring-4 ring-green-100' : 'bg-gray-200 text-gray-400')}>
                  {hecho ? '✓' : i + 1}
                </div>
                <span className={cn('text-sm', activo ? 'font-semibold text-gray-900' : 'text-gray-400')}>{label}</span>
                {i < 2 && <ArrowRight className="w-4 h-4 text-gray-200 mx-1" />}
              </div>
            );
          })}
        </div>

        {/* ── PASO 1: Subir ── */}
        {paso === 'subir' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('fileInput')?.click()}
            className={cn(
              'bg-white rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition',
              arrastrando ? 'border-[#16a34a] bg-green-50' : 'border-gray-200 hover:border-[#22c55e]'
            )}
          >
            <input id="fileInput" type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && procesarArchivo(e.target.files[0])} />
            {procesando ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-[#16a34a] animate-spin" />
                <p className="text-gray-500">Leyendo Excel...</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-sm text-gray-400 mt-1">o haz clic para seleccionarlo</p>
                <p className="text-xs text-gray-300 mt-3">.xlsx · .xls</p>
              </>
            )}
          </div>
        )}

        {/* ── PASO 2: Elegir columna nombre ── */}
        {paso === 'elegir' && (
          <div className="space-y-5">
            {/* Vista previa del Excel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50">
                <p className="font-bold text-gray-800 text-sm">Vista previa — {columnas.length} columnas detectadas</p>
                <p className="text-xs text-gray-400 mt-0.5">Así llegaron tus datos del Excel</p>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {columnas.map(c => (
                        <th key={c} className={cn(
                          'px-3 py-2.5 text-left font-bold truncate max-w-[140px] border-b border-gray-100',
                          c === colNombre ? 'text-[#16a34a] bg-green-50' : 'text-gray-500'
                        )}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {muestra.map((fila, i) => (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                        {columnas.map(c => (
                          <td key={c} className={cn(
                            'px-3 py-2 truncate max-w-[140px]',
                            c === colNombre ? 'text-[#16a34a] font-semibold bg-green-50/50' : 'text-gray-600'
                          )}>{String(fila[c] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Solo pregunta: cuál columna es el nombre */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="font-bold text-gray-800 mb-1">¿Cuál columna tiene el nombre del deportista?</p>
              <p className="text-sm text-gray-400 mb-4">Esta columna se usará para identificar a cada deportista en la plataforma. Todas las demás columnas se guardan automáticamente.</p>
              <select
                value={colNombre}
                onChange={e => setColNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
              >
                {columnas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {colNombre && muestra[0] && (
                <p className="text-sm text-gray-400 mt-2">
                  Ejemplo: <span className="font-bold text-[#16a34a]">{String(muestra[0][colNombre] ?? '')}</span>
                </p>
              )}
            </div>

            <button onClick={importar} disabled={procesando || !colNombre}
              className="w-full py-3.5 bg-[#16a34a] text-white rounded-xl font-bold text-sm hover:bg-[#064e1e] transition disabled:opacity-60 flex items-center justify-center gap-2">
              {procesando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                : `Importar ${muestra.length > 0 ? 'todos los deportistas' : ''} →`}
            </button>
          </div>
        )}

        {/* ── PASO 3: Confirmación ── */}
        {paso === 'confirmar' && resultado && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-black text-gray-900">¡Importación exitosa!</h2>
              <p className="text-gray-500 mt-1">
                <span className="text-3xl font-black text-[#16a34a]">{resultado.total}</span> deportistas cargados con todas sus columnas
              </p>
              {resultado.errores > 0 && (
                <div className="flex items-center justify-center gap-2 mt-3 text-[#1d4ed8] text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {resultado.errores} filas omitidas (sin nombre)
                </div>
              )}
            </div>

            <button onClick={() => router.push('/alumnos')}
              className="w-full py-3.5 bg-[#16a34a] text-white rounded-xl font-bold text-sm hover:bg-[#064e1e] transition flex items-center justify-center gap-2">
              Ver deportistas <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
