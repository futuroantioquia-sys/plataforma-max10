// ─────────────────────────────────────────────────────────────────────────────
//  paz-y-salvo.ts  ·  Arma el PDF de la CONSTANCIA DE PAZ Y SALVO.
//
//  Es el mismo formato del PowerPoint que entregó la dirección (26/08/2026),
//  hoja de 7,5 x 10 pulgadas. Todo lo fijo —el encabezado del estadio, la
//  franja de fotos, la firma de la representante legal y la barra de la
//  dirección— viene en UNA sola imagen de fondo:
//
//      frontend/public/paz-y-salvo-fondo.jpg
//
//  Encima solo se escriben los datos que cambian: la fecha y el nombre del
//  deportista. Así el texto sale nítido (no es una foto de un texto) y el
//  documento pesa poco.
//
//  IMPORTANTE — el PDF NO se puede bajar cuando al niño le da la gana:
//  administración tiene que AUTORIZARLO primero, en Total Retirados. Esa
//  comprobación se hace en la pantalla, no aquí.
//
//  La librería jsPDF se baja de internet en el momento de oprimir el botón,
//  igual que el lector de Excel y que el PDF de la Valoración Dinámica. Se
//  hace así para no obligar a instalar nada en el computador.
// ─────────────────────────────────────────────────────────────────────────────

const PULG = 25.4;                 // milímetros que tiene una pulgada
const W    = 7.5 * PULG;           // ancho de la hoja  = 190,5 mm
const H    = 10  * PULG;           // alto  de la hoja  = 254 mm

/* La caja del texto, tomada del PowerPoint original. */
const X  = 1.62 * PULG;
const AN = 5.74 * PULG;

const VERDE: [number, number, number] = [0, 150, 64];
const SIZE = 14;
const ALTO = SIZE * 0.352778 * 1.32;   // alto de renglón, en milímetros

export const FONDO_URL = '/paz-y-salvo-fondo.jpg';

/* ── Bajar jsPDF (con un espejo de respaldo, por si cdnjs falla) ──────────── */
const FUENTES_JSPDF = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
];

function yaEsta(): any {
  const w = window as any;
  return w.jspdf?.jsPDF || w.jsPDF || null;
}

function bajarGuion(src: string): Promise<void> {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => mal(new Error('no cargó ' + src));
    document.head.appendChild(s);
  });
}

async function cargarJsPDF(): Promise<any> {
  const hay = yaEsta();
  if (hay) return hay;
  let ultimo: any = null;
  for (const src of FUENTES_JSPDF) {
    try {
      await bajarGuion(src);
      const c = yaEsta();
      if (c) return c;
    } catch (e) { ultimo = e; }
  }
  throw new Error(
    'No se pudo cargar la librería para armar el PDF. Revisa la conexión a internet e inténtalo otra vez.'
    + (ultimo ? '' : ''),
  );
}

/* ── Traer la imagen de fondo y volverla texto (data URL) ────────────────── */
async function cargarFondo(): Promise<string> {
  const res = await fetch(FONDO_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error('No se encontró la plantilla del Paz y Salvo (paz-y-salvo-fondo.jpg).');
  const blob = await res.blob();
  return await new Promise<string>((ok, mal) => {
    const fr = new FileReader();
    fr.onload  = () => ok(String(fr.result));
    fr.onerror = () => mal(new Error('No se pudo leer la plantilla del Paz y Salvo.'));
    fr.readAsDataURL(blob);
  });
}

/* ── Fecha en palabras: "26 de agosto de 2026" ───────────────────────────── */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaEnPalabras(d: Date = new Date()): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* ── Un párrafo que puede llevar pedazos en NEGRILLA ──────────────────────
   jsPDF no sabe de "texto enriquecido": escribe palabra por palabra. Se le
   pasa el párrafo partido en trozos [texto, ¿negrilla?] y esta función arma
   los renglones a mano, cambiando de fuente donde toca. */
type Trozo = [string, boolean];

function parrafo(
  doc: any,
  y: number,
  trozos: Trozo[],
  o: { size?: number; italic?: boolean; centrado?: boolean; color?: [number, number, number] } = {},
): void {
  const size   = o.size ?? SIZE;
  const base   = o.italic ? 'italic' : 'normal';
  const fuerte = o.italic ? 'bolditalic' : 'bold';
  doc.setFontSize(size);
  doc.setTextColor(...(o.color ?? [0, 0, 0]));

  const palabras: { p: string; estilo: string }[] = [];
  for (const [txt, neg] of trozos) {
    for (const p of String(txt).split(/\s+/).filter(Boolean)) {
      palabras.push({ p, estilo: neg ? fuerte : base });
    }
  }

  const anchoDe = (p: string, estilo: string) => { doc.setFont('helvetica', estilo); return doc.getTextWidth(p); };
  const espacio = () => { doc.setFont('helvetica', base); return doc.getTextWidth(' '); };

  const renglones: { p: string; estilo: string }[][] = [];
  let actual: { p: string; estilo: string }[] = [];
  let ancho = 0;
  for (const w of palabras) {
    const a   = anchoDe(w.p, w.estilo);
    const mas = actual.length ? espacio() + a : a;
    if (actual.length && ancho + mas > AN) { renglones.push(actual); actual = [w]; ancho = a; }
    else { actual.push(w); ancho += mas; }
  }
  if (actual.length) renglones.push(actual);

  let yy = y;
  const altoR = size * 0.352778 * 1.32;
  for (const r of renglones) {
    let anchoR = 0;
    r.forEach((w, i) => { anchoR += anchoDe(w.p, w.estilo) + (i ? espacio() : 0); });
    let x = o.centrado ? X + (AN - anchoR) / 2 : X;
    for (let i = 0; i < r.length; i++) {
      if (i) { doc.setFont('helvetica', base); x += espacio(); }
      doc.setFont('helvetica', r[i].estilo);
      doc.text(r[i].p, x, yy);
      x += doc.getTextWidth(r[i].p);
    }
    yy += altoR;
  }
}

export type DatosPazYSalvo = {
  nombre: string;
  codigo?: string;
  documento?: string;   // documento de identidad del deportista
  fecha?: string;       // si no viene, la de hoy
};

/** Nombre del archivo que le queda al padre en Descargas. */
export function nombreArchivoPazYSalvo(d: DatosPazYSalvo): string {
  const limpio = String(d.nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
  return `Paz-y-Salvo-${d.codigo ? d.codigo + '-' : ''}${limpio || 'deportista'}.pdf`;
}

/**
 * Arma el PDF y lo baja a la carpeta de Descargas.
 * Si algo falla, LANZA el error para que la pantalla lo pueda mostrar: nunca
 * se queda callado haciendo creer que el archivo bajó.
 */
export async function descargarPazYSalvo(d: DatosPazYSalvo): Promise<void> {
  const [Ctor, fondo] = await Promise.all([cargarJsPDF(), cargarFondo()]);

  const doc = new Ctor({ orientation: 'p', unit: 'mm', format: [W, H] });
  doc.addImage(fondo, 'JPEG', 0, 0, W, H);

  const en = (pulg: number) => pulg * PULG;
  const fecha = d.fecha || fechaEnPalabras();

  parrafo(doc, en(2.58), [[`Medellín, ${fecha}`, false]]);
  parrafo(doc, en(3.25), [['CONSTANCIA DE PAZ Y SALVO', true]], { centrado: true });
  parrafo(doc, en(3.85), [['Cordial saludo.', false]]);
  parrafo(doc, en(4.45), [['Por medio de la presente hacemos constar que el deportista:', false]]);

  /* ── Quién es, en tres renglones (dirección, 26/08/2026) ────────────────
        CÓDIGO 2018
        MAXIMILIANO VALDERRAMA RAMÍREZ
        DOCUMENTO DE IDENTIDAD # 1.028.456
     Si no tenemos el documento en la ficha, se deja la rayita para que se
     pueda escribir a mano: es preferible eso a entregar una constancia que
     no identifique bien a la persona. */
  /* El nombre se achica solo si es muy largo, para que nunca se parta en dos. */
  const nombre = String(d.nombre ?? '').toUpperCase().trim();
  let sizeNombre = SIZE;
  doc.setFont('helvetica', 'bold');
  while (sizeNombre > 9) {
    doc.setFontSize(sizeNombre);
    if (doc.getTextWidth(nombre) <= AN) break;
    sizeNombre -= 0.5;
  }
  parrafo(doc, en(5.36), [[nombre || '—', true]], { centrado: true, size: sizeNombre });

  /* Debajo del nombre, el código y el documento en el MISMO renglón.
     Si tampoco ese renglón cabe, se achica igual que el nombre. */
  const codigo    = String(d.codigo ?? '').trim().toUpperCase();
  const documento = String(d.documento ?? '').trim();
  const linea = (codigo ? `CÓDIGO ${codigo}   ·   ` : '') +
                `DOCUMENTO DE IDENTIDAD # ${documento || '________________'}`;
  let sizeLinea = 12;
  doc.setFont('helvetica', 'bold');
  while (sizeLinea > 8) {
    doc.setFontSize(sizeLinea);
    if (doc.getTextWidth(linea) <= AN) break;
    sizeLinea -= 0.5;
  }
  parrafo(doc, en(5.66), [[linea, true]], { centrado: true, size: sizeLinea });

  parrafo(doc, en(6.08), [
    ['Se han desvinculado del Club, encontrándose a ', false],
    ['PAZ Y SALVO POR TODO CONCEPTO.', true],
  ]);

  /* La despedida del formato original de la dirección. NO cambiarla por la
     de la pantalla: son dos textos distintos a propósito. — 26/08/2026 */
  parrafo(doc, en(6.85),
    [['GRACIAS POR HABERNOS HECHO PARTE DE TU HISTORIA. EXITOS EN TODOS TUS PROYECTOS.', true]],
    { italic: true, color: VERDE });

  /* El cierre va pegado a la firma, que ya viene dibujada en el fondo. */
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(SIZE);
  doc.setFont('helvetica', 'normal'); doc.text('Atentamente,', X, en(7.62));
  doc.setFont('helvetica', 'bold');   doc.text('DIANA FERNANDA CASTRO ESTRADA', X, en(8.70));
  doc.setFont('helvetica', 'normal'); doc.text('Presidenta y Representante legal', X, en(8.98));

  doc.save(nombreArchivoPazYSalvo(d));
}
