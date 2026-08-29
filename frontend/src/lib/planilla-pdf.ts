// ─────────────────────────────────────────────────────────────────────────────
//  planilla-pdf.ts  ·  El PDF de la planilla del POSPARTIDO.
//
//  Saca en una hoja horizontal lo mismo que se ve en pantalla: el torneo, la
//  fecha, el cuadro de deportistas y el marcador.
//
//  ── CAMBIO (dirección, 27/08/2026) ──────────────────────────────────────────
//  Antes el PDF salía en BLANCO, "para imprimirlo". La dirección lo corrigió:
//  el documento debe verse EXACTAMENTE como se ve en pantalla — el fondo gris
//  oscuro, el encabezado verde, las tarjetas en su color y la calificación en
//  verde. Así lo que se manda por WhatsApp es la misma planilla que el formador
//  llenó, no una versión distinta que toca volver a interpretar.
//
//  Y el archivo se llama como se llama el partido en el BANCO POSPARTIDO:
//
//        FECHA 1 LIGA DESARROLLO SUB 8.pdf
//
//  La librería jsPDF se baja de internet en el momento de oprimir el botón,
//  igual que en el Paz y Salvo. Así no hay que instalar nada en el computador.
// ─────────────────────────────────────────────────────────────────────────────

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
  for (const src of FUENTES_JSPDF) {
    try {
      await bajarGuion(src);
      const c = yaEsta();
      if (c) return c;
    } catch { /* se intenta el espejo */ }
  }
  throw new Error(
    'No se pudo cargar la librería para armar el PDF. Revisa la conexión a internet e inténtalo otra vez.',
  );
}

/* ── Los colores de la pantalla, tal cual ────────────────────────────────── */
type RGB = [number, number, number];
const LIENZO: RGB = [ 51,  63,  80];   // #333F50 — el fondo de la hoja
const PANEL:  RGB = [ 60,  71,  89];   // #3C4759 — las filas del cuadro
const CAMPO:  RGB = [ 43,  53,  71];   // #2B3547 — los cuadros sin llenar
const BORDE:  RGB = [ 74,  85, 104];   // #4A5568 — el borde de una casilla vacía
const VERDE:  RGB = [  0, 176,  80];   // #00B050
const AMBAR:  RGB = [224, 163,  58];   // #E0A33A
const ROJO:   RGB = [192,  80,  77];   // #C0504D
const MORADO: RGB = [139, 114, 217];   // #8B72D9
const BLANCO: RGB = [255, 255, 255];
const APAGADO: RGB = [150, 158, 172];  // el guión de una casilla sin llenar

export type ColumnaPDF = { clave: string; titulo: string; ancho: number };

export type FilaPDF = Record<string, string>;

export type DatosPlanilla = {
  numeroTorneo: string;
  torneo: string;
  formador: string;
  jornada: string;          // el renglón completo, ya armado
  columnas: ColumnaPDF[];   // en el orden en que se ven en pantalla
  filas: FilaPDF[];
  resultado: string;        // VICTORIA · EMPATE · DERROTA (o vacío)
  golesNos: string;
  golesEllos: string;
  rival: string;
  /** El promedio de las calificaciones — "2,5". Vacío si nadie tiene nota. */
  promedio?: string;
  /** BREVE RESUMEN DEL JUEGO, lo que escribió el formador. Si viene vacío,
   *  el recuadro ni siquiera se dibuja. — dirección, 28/08/2026 */
  resumen?: string;
  /** Cómo se llama el partido en el BANCO: "FECHA 1 LIGA DESARROLLO SUB 8".
   *  Con eso se nombra el archivo que se baja. */
  nombreArchivo?: string;
};

/** Parte un nombre en dos renglones parejos, igual que en pantalla:
 *  "INDEPENDIENTE MEDELLIN" → ["INDEPENDIENTE", "MEDELLIN"]. */
function enDosLineas(texto: string): string[] {
  const pal = String(texto ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (pal.length <= 1) return pal;
  const total = pal.join(' ').length;
  let acum = 0, corte = 1;
  for (let i = 0; i < pal.length - 1; i++) {
    acum += pal[i].length + 1;
    corte = i + 1;
    if (acum >= total / 2) break;
  }
  return [pal.slice(0, corte).join(' '), pal.slice(corte).join(' ')];
}

/** Corta un texto para que quepa en el ancho de su columna. */
function recortar(doc: any, txt: string, ancho: number): string {
  let t = String(txt ?? '');
  if (!t) return '';
  while (t.length > 1 && doc.getTextWidth(t) > ancho - 2) t = t.slice(0, -1);
  return t;
}

/* ── Qué casillas van pintadas, igual que en pantalla ─────────────────────── */

/** El fondo de la CASILLA COMPLETA. En pantalla, el número y la calificación
 *  van en verde; todo lo demás va en el gris del cuadro. */
function fondoDeCasilla(clave: string): RGB {
  if (clave === 'num' || clave === 'calificacion') return VERDE;
  return PANEL;
}

/** Las cuatro casillas que en pantalla son un botón que se prende al tocarlo.
 *  Vacías se ven como un recuadro con borde; llenas, pintadas de su color. */
const LLEVAN_PASTILLA = new Set(['convocado', 'actua', 'amarillas', 'rojas']);

/** El color de la "pastilla" que se prende dentro de la casilla — lo mismo que
 *  hace el botón en pantalla. `null` = esta casilla no lleva pastilla. */
function pastillaDe(clave: string, valor: string): RGB | null {
  const v = String(valor ?? '').trim();
  if (!v || v === '—' || /^n\/a$/i.test(v)) return null;
  if (clave === 'convocado') return /^no/i.test(v) ? ROJO : VERDE;
  if (clave === 'actua') {
    if (/titular/i.test(v))  return VERDE;
    if (/suplente/i.test(v)) return AMBAR;
    /* "No asistió" va ANTES que "No jugó": los dos empiezan por "No", y el
       que no asistió no se presentó — se marca en rojo, como el "No
       convocado". — 27/08/2026 */
    if (/asist/i.test(v))    return ROJO;
    if (/jug/i.test(v))      return MORADO;
    return null;
  }
  if (clave === 'amarillas') return AMBAR;
  if (clave === 'rojas')     return ROJO;
  return null;
}

/** El fondo del TÍTULO de la columna: AMA en ámbar, ROJ en rojo, el resto verde. */
function fondoDeTitulo(clave: string): RGB {
  if (clave === 'amarillas') return AMBAR;
  if (clave === 'rojas')     return ROJO;
  return VERDE;
}

/** Deja el nombre listo para ser un archivo de Windows. */
function nombreDeArchivo(d: DatosPlanilla): string {
  const base = String(d.nombreArchivo || '').trim()
    || `pospartido torneo ${d.numeroTorneo || 'sn'}`;
  const limpio = base
    .replace(/[\\/:*?"<>|]/g, ' ')     // lo que Windows no admite
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${limpio || 'pospartido'}.pdf`;
}

export async function descargarPlanillaPDF(d: DatosPlanilla): Promise<void> {
  const jsPDF = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const W = 297, H = 210;
  const MX = 10;                       // margen izquierdo y derecho
  const ANCHO = W - MX * 2;

  /* Los anchos de pantalla se llevan a la hoja guardando la proporción. */
  const sumaPantalla = d.columnas.reduce((s, c) => s + c.ancho, 0) || 1;
  const anchos = d.columnas.map(c => (c.ancho / sumaPantalla) * ANCHO);

  const Y_CUADRO   = 33;               // dónde empieza el cuadro
  const ALTO_TIT   = 9;

  /* ── EL ESPACIO DE ABAJO, MEDIDO ─────────────────────────────────────────
     Debajo del cuadro va la tarjeta del marcador, después el promedio del
     equipo y por último el pie. Cada pedazo tiene su altura apuntada aquí y
     de la suma sale cuánto le queda al cuadro. Antes esto se calculaba con un
     número a ojo y el marcador terminó tapándole la última fila al equipo.
     Si mañana la tarjeta crece, se cambia el número aquí y todo lo demás se
     reacomoda solo. — 27/08/2026 */
  const HUECO_CUADRO = 5;              // del cuadro a la tarjeta del marcador
  const ALTO_CARD    = 26;             // la tarjeta del marcador
  const HUECO_PROM   = 4;              // de la tarjeta al promedio
  const ALTO_PROM    = 11;             // el cuadro verde del promedio
  const ALTO_PIE     = 10;             // el renglón de MAX 10 SPORT

  /* EL RESUMEN DEL JUEGO (dirección, 28/08/2026). Se mide ANTES de repartir
     la hoja: así el cuadro de los deportistas se encoge lo necesario y el
     resumen nunca queda pisado ni se sale de la página. Si el formador no
     escribió nada, no ocupa un milímetro. */
  const resumenTxt = String(d.resumen ?? '').replace(/\s+\n/g, '\n').trim();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const lineasResumen: string[] = resumenTxt
    ? (doc.splitTextToSize(resumenTxt, ANCHO - 10) as string[]).slice(0, 5)
    : [];
  const HUECO_RES = lineasResumen.length ? 4 : 0;
  const ALTO_RES  = lineasResumen.length ? 8 + lineasResumen.length * 4.2 + 2.5 : 0;

  const PIE = HUECO_CUADRO + ALTO_CARD + HUECO_PROM + ALTO_PROM
            + HUECO_RES + ALTO_RES + ALTO_PIE;
  const DISPONIBLE = H - Y_CUADRO - ALTO_TIT - PIE;

  /* ALTO DE LA FILA: se ajusta para que TODO el equipo quepa en la hoja. Si
     ni encogiéndolas caben, se sigue en una segunda hoja — antes las filas
     sobrantes simplemente no se pintaban y nadie se enteraba. — 27/08/2026 */
  const nFilas   = Math.max(1, d.filas.length);
  const altoFila = Math.max(4.6, Math.min(7, DISPONIBLE / nFilas));
  const porHoja  = Math.max(1, Math.floor(DISPONIBLE / altoFila));

  /** Pinta el fondo gris oscuro de toda la hoja. Va PRIMERO, siempre. */
  function fondoDeLaHoja() {
    doc.setFillColor(...LIENZO);
    doc.rect(0, 0, W, H, 'F');
  }

  /** El encabezado verde de arriba y el renglón de la fecha. */
  function encabezado() {
    doc.setFillColor(...VERDE);
    doc.rect(MX, 10, ANCHO, 12, 'F');
    doc.setTextColor(...BLANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`TORNEO ${d.numeroTorneo || '—'}  ·  ${d.torneo || 'SIN TORNEO'}`, MX + 4, 18.2);
    if (d.formador) {
      doc.setFontSize(9.5);
      const t = `FORMADOR: ${d.formador}`;
      doc.text(t, W - MX - 4 - doc.getTextWidth(t), 18.2);
    }
    // El renglón de la fecha, en blanco sobre el gris (antes iba en negro).
    doc.setTextColor(...BLANCO);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    if (d.jornada) doc.text(d.jornada, MX, 28.5);
  }

  /** Los títulos de las columnas. */
  function titulos() {
    let x = MX;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    d.columnas.forEach((c, i) => {
      const a = anchos[i];
      doc.setFillColor(...fondoDeTitulo(c.clave));
      doc.rect(x, Y_CUADRO, a, ALTO_TIT, 'F');
      doc.setTextColor(...BLANCO);
      const t = recortar(doc, c.titulo, a);
      doc.text(t, x + a / 2 - doc.getTextWidth(t) / 2, Y_CUADRO + 6);
      // La raya blanca que separa una columna de otra, como en pantalla
      doc.setDrawColor(...BLANCO);
      doc.setLineWidth(0.3);
      doc.line(x + a, Y_CUADRO, x + a, Y_CUADRO + ALTO_TIT);
      x += a;
    });
  }

  /** Un renglón del cuadro. Devuelve dónde quedó el borde de abajo. */
  function renglon(f: FilaPDF, y: number) {
    let x = MX;
    d.columnas.forEach((c, i) => {
      const a = anchos[i];
      const valor = String(f[c.clave] ?? '');

      // 1. El fondo de la casilla
      doc.setFillColor(...fondoDeCasilla(c.clave));
      doc.rect(x, y, a, altoFila, 'F');

      // 2. La pastilla de color, si esta casilla lleva
      const past = pastillaDe(c.clave, valor);
      if (past) {
        doc.setFillColor(...past);
        doc.roundedRect(x + 0.7, y + 0.6, a - 1.4, altoFila - 1.2, 0.7, 0.7, 'F');
      } else if (LLEVAN_PASTILLA.has(c.clave)) {
        /* Sin llenar, en pantalla queda un recuadro con el borde marcado —así
           el formador ve dónde se toca. El PDF lo copia igual. */
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.25);
        doc.roundedRect(x + 0.7, y + 0.6, a - 1.4, altoFila - 1.2, 0.7, 0.7, 'S');
      }

      // 3. El texto
      const vacia = !valor.trim() || valor.trim() === '—';
      doc.setTextColor(...(vacia ? APAGADO : BLANCO));
      doc.setFont('helvetica', (c.clave === 'deportista' || c.clave === 'num') ? 'bold' : 'normal');
      doc.setFontSize(altoFila < 5.6 ? 6.6 : 7.6);
      const t = recortar(doc, vacia ? '—' : valor, a);
      const centrada = c.clave !== 'deportista' && c.clave !== 'posicion';
      doc.text(
        t,
        centrada ? x + a / 2 - doc.getTextWidth(t) / 2 : x + 1.6,
        y + altoFila / 2 + 1.2,
      );

      // 4. Las rayas blancas del cuadro
      doc.setDrawColor(...BLANCO);
      doc.setLineWidth(0.22);
      doc.line(x + a, y, x + a, y + altoFila);
      x += a;
    });
    doc.setDrawColor(...BLANCO);
    doc.setLineWidth(0.22);
    doc.line(MX, y + altoFila, MX + ANCHO, y + altoFila);
    return y + altoFila;
  }

  /* ── A pintar ── */
  const hojas = Math.max(1, Math.ceil(d.filas.length / porHoja));
  let y = 0;

  for (let hoja = 0; hoja < hojas; hoja++) {
    if (hoja > 0) doc.addPage();
    fondoDeLaHoja();
    encabezado();
    titulos();

    y = Y_CUADRO + ALTO_TIT;
    const desde = hoja * porHoja;
    for (const f of d.filas.slice(desde, desde + porHoja)) y = renglon(f, y);

    // El marco de todo el cuadro
    doc.setDrawColor(...BLANCO);
    doc.setLineWidth(0.4);
    doc.rect(MX, Y_CUADRO, ANCHO, y - Y_CUADRO);

    if (hojas > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...APAGADO);
      const t = `hoja ${hoja + 1} de ${hojas}`;
      doc.text(t, W - MX - doc.getTextWidth(t), H - 8);
    }
  }

  /* ── EL MARCADOR ─────────────────────────────────────────────────────────
     Se dibuja IGUAL que en pantalla (dirección, 27/08/2026): la tarjeta gris,
     la pastilla del resultado, FUTURO / ANTIOQUIA en dos renglones, el cuadro
     verde de nuestros goles, el VS, el cuadro rojo de los del rival y el
     nombre del rival también en dos renglones. Antes esto salía como un
     renglón de texto suelto y se perdía todo el diseño. */

  /** Un texto centrado en (cx). */
  const centrado = (t: string, cx: number, y2: number) =>
    doc.text(t, cx - doc.getTextWidth(t) / 2, y2);

  /* La tarjeta va PEGADA al cuadro, como en pantalla. El tope de abajo sale
     de las medidas apuntadas arriba, no de un número a ojo. */
  const yCard = Math.min(y + HUECO_CUADRO,
                         H - ALTO_PIE - ALTO_RES - HUECO_RES
                           - ALTO_PROM - HUECO_PROM - ALTO_CARD);

  doc.setFillColor(...PANEL);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MX, yCard, ANCHO, ALTO_CARD, 3, 3, 'FD');

  const cy = yCard + ALTO_CARD / 2;          // la mitad, para centrar todo

  /* Los pedazos, con su ancho, para poder centrar la fila completa. */
  const W_PILL = 52, W_NOS = 42, W_CAJA = 17, W_VS = 11, W_RIV = 46, HUECO = 5;   // separación entre los pedazos de la fila
  const anchoFila = W_PILL + HUECO + W_NOS + HUECO + W_CAJA + HUECO + W_VS
                  + HUECO + W_CAJA + HUECO + W_RIV;
  let cx = MX + (ANCHO - anchoFila) / 2;

  // 1. La pastilla del resultado
  const colorRes = d.resultado === 'VICTORIA' ? VERDE
                 : d.resultado === 'DERROTA'  ? ROJO
                 : d.resultado === 'EMPATE'   ? AMBAR
                 : null;
  if (colorRes) { doc.setFillColor(...colorRes); doc.setDrawColor(...colorRes); }
  else          { doc.setFillColor(...CAMPO);    doc.setDrawColor(...BORDE); }
  doc.roundedRect(cx, cy - 7, W_PILL, 14, 2.5, 2.5, 'FD');
  doc.setTextColor(...(colorRes ? BLANCO : APAGADO));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  centrado(d.resultado || 'SIN MARCADOR', cx + W_PILL / 2, cy + 1.6);
  cx += W_PILL + HUECO;

  // 2. FUTURO / ANTIOQUIA, en dos renglones
  doc.setTextColor(...BLANCO);
  doc.setFontSize(13);
  centrado('FUTURO',    cx + W_NOS / 2, cy - 1.2);
  centrado('ANTIOQUIA', cx + W_NOS / 2, cy + 5.2);
  cx += W_NOS + HUECO;

  // 3. Nuestros goles, en el cuadro verde
  doc.setFillColor(...VERDE);
  doc.roundedRect(cx, cy - W_CAJA / 2, W_CAJA, W_CAJA, 2.5, 2.5, 'F');
  doc.setTextColor(...BLANCO);
  doc.setFontSize(19);
  centrado(String(d.golesNos || '0'), cx + W_CAJA / 2, cy + 3);
  cx += W_CAJA + HUECO;

  // 4. VS
  doc.setFontSize(14);
  centrado('VS', cx + W_VS / 2, cy + 2.2);
  cx += W_VS + HUECO;

  // 5. Los goles del rival, en el cuadro rojo
  doc.setFillColor(...ROJO);
  doc.roundedRect(cx, cy - W_CAJA / 2, W_CAJA, W_CAJA, 2.5, 2.5, 'F');
  doc.setTextColor(...BLANCO);
  doc.setFontSize(19);
  centrado(String(d.golesEllos || '0'), cx + W_CAJA / 2, cy + 3);
  cx += W_CAJA + HUECO;

  // 6. El rival, en dos renglones
  const rr = enDosLineas(d.rival);
  doc.setFontSize(13);
  if (rr.length === 0) {
    doc.setTextColor(...APAGADO);
    centrado('RIVAL', cx + W_RIV / 2, cy + 2);
  } else if (rr.length === 1) {
    doc.setTextColor(...BLANCO);
    centrado(recortar(doc, rr[0], W_RIV + 2), cx + W_RIV / 2, cy + 2);
  } else {
    doc.setTextColor(...BLANCO);
    centrado(recortar(doc, rr[0], W_RIV + 2), cx + W_RIV / 2, cy - 1.2);
    centrado(recortar(doc, rr[1], W_RIV + 2), cx + W_RIV / 2, cy + 5.2);
  }

  /* ── EL PROMEDIO DEL EQUIPO ──────────────────────────────────────────────
     Contra la esquina derecha, con el letrero POR FUERA del cuadro verde,
     igual que en pantalla. */
  const yProm = yCard + ALTO_CARD + HUECO_PROM;
  const W_PROM = 20, H_PROM = ALTO_PROM;
  const xProm = MX + ANCHO - W_PROM;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...APAGADO);
  const lbl1 = 'PROMEDIO', lbl2 = 'EQUIPO';
  doc.text(lbl1, xProm - 2.5 - doc.getTextWidth(lbl1), yProm + 4.4);
  doc.text(lbl2, xProm - 2.5 - doc.getTextWidth(lbl2), yProm + 8.6);

  if (d.promedio) { doc.setFillColor(...VERDE); doc.setDrawColor(...VERDE); }
  else            { doc.setFillColor(...CAMPO); doc.setDrawColor(...BORDE); }
  doc.roundedRect(xProm, yProm, W_PROM, H_PROM, 2.5, 2.5, 'FD');
  doc.setTextColor(...(d.promedio ? BLANCO : APAGADO));
  doc.setFontSize(14);
  centrado(d.promedio || '—', xProm + W_PROM / 2, yProm + 8);

  /* ── BREVE RESUMEN DEL JUEGO ─────────────────────────────────────────────
     Lo que escribió el formador, en su propio recuadro, debajo del promedio.
     — dirección, 28/08/2026 */
  if (lineasResumen.length) {
    const yRes = yProm + ALTO_PROM + HUECO_RES;
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, yRes, ANCHO, ALTO_RES, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...APAGADO);
    doc.text('BREVE RESUMEN DEL JUEGO', MX + 5, yRes + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLANCO);
    lineasResumen.forEach((ln, i) => doc.text(ln, MX + 5, yRes + 10.2 + i * 4.2));
  }

  /* ── Pie ── */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...APAGADO);
  doc.text('MAX 10 SPORT · FUTURO ANTIOQUIA — planilla de pospartido', MX, H - 8);

  doc.save(nombreDeArchivo(d));
}
