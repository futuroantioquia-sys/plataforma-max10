// ─────────────────────────────────────────────────────────────────────────────
//  valoracionExcel.ts — Lee la plantilla Excel de la 1ª valoración (una por
//  deportista, celdas fijas) y devuelve los campos ya mapeados al formulario
//  de valoración de la app (mismo diseño Max 10).
//  Usado por la ventana de Informes (perfil) y por el botón Importar (valoración).
// ─────────────────────────────────────────────────────────────────────────────

/** Carga SheetJS por CDN (igual que en Contabilidad). */
function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel'));
    document.head.appendChild(s);
  });
}

/** Lee el Excel del deportista y devuelve los campos del formulario de valoración. */
export async function parseValoracionExcel(file: File): Promise<Record<string, string>> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El Excel no tiene datos legibles.');

  const raw = (addr: string) => { const c = ws[addr]; return c == null ? '' : c.v; };
  const str = (addr: string) => { const v = raw(addr); return v == null ? '' : String(v).trim(); };
  const nvl = (addr: string) => str(addr); // los niveles ya vienen como "Nivel N (…)"

  let fecha = '';
  const f = raw('E7');
  if (f instanceof Date) {
    const dd = String(f.getDate()).padStart(2, '0'), mm = String(f.getMonth() + 1).padStart(2, '0');
    fecha = `${dd}/${mm}/${f.getFullYear()}`;
  } else fecha = str('E7');
  const edad = (str('E11').match(/\d+/)?.[0]) ?? str('E11');

  return {
    fecha, codigo: str('E8'), nombre: str('E10'), edad,
    proyecto: str('E12'), perfil: str('E13'), posicion: str('E14'),
    torneos: str('C16'), partJugados: str('F16'),
    tarjAmarillas: str('C17'), partTitular: str('F17'),
    tarjRojas: str('C18'), minutosJugados: str('F18'),
    goles: str('C19'), calificacion: str('F19'),
    // Condicionales
    fuerzaNivel: nvl('F25'), fuerzaDesc: str('A26'),
    velocidadNivel: nvl('F31'), velocidadDesc: str('A32'),
    resistenciaNivel: nvl('F37'), resistenciaDesc: str('A38'),
    // Técnica (Control Orientado→control · Control y Pase→pase · Cond. y Dribbling→conducción y dribling)
    controlNivel: nvl('F57'), controlDesc: str('A58'),
    paseNivel: nvl('F46'), paseDesc: str('A47'),
    conductaNivel: nvl('F52'), conductaDesc: str('A53'),
    driblingNivel: nvl('F52'), driblingDesc: str('A53'),
    remataNivel: nvl('F63'), remataDesc: str('A64'),
    // El 1.er informe no evalúa Cabeceo ni Quite → "No Aplica"
    cabeceoNivel: 'No Aplica', cabeceoDesc: '',
    quiteNivel: 'No Aplica', quiteDesc: '',
    proteccionNivel: nvl('F69'), proteccionDesc: str('A70'),
    // Táctica
    posicionNivel: nvl('F76'), posicionDesc: str('A77'),
    visionNivel: nvl('F82'), visionDesc: str('A83'),
    defensaNivel: nvl('F88'), defensaDesc: str('A89'),
    amplitudNivel: nvl('F94'), amplitudDesc: str('A95'),
    transicionNivel: nvl('F99'), transicionDesc: str('A100'),
    superioridadNivel: nvl('F105'), superioridadDesc: str('A106'),
    basculacionNivel: nvl('F112'), basculacionDesc: str('A113'),
    // Socio-afectiva
    trabajoNivel: nvl('F120'), trabajoDesc: str('A121'),
    disciplinaNivel: nvl('F125'), disciplinaDesc: str('A126'),
    actitudNivel: nvl('F131'), actitudDesc: str('A132'),
    // Colectivo
    identidadNivel: nvl('F141'), identidadDesc: str('A142'),
    bloqueNivel: nvl('F147'), bloqueDesc: str('A148'),
    climaNivel: nvl('F153'), climaDesc: str('A154'),
    gestionCompNivel: nvl('F159'), gestionCompDesc: str('A160'),
    // Textos
    logrosTrimestre: str('A165'), objetivosTrimestre: str('A169'),
    // Comportamental
    responsabilidad: str('F175'), puntualidad: str('F177'),
    disciplinaComp: str('F179'), respeto: str('F181'),
    tolerancia: str('F183'), companerismo: str('F185'),
    liderazgo: str('F187'), trabajoEquipoComp: str('F189'),
    sentidoPertenencia: str('F191'),
    numeroInforme: '1',
  };
}
