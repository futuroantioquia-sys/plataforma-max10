// ─────────────────────────────────────────────────────────────────────────────
//  nombres.ts  ·  Partir el nombre completo en NOMBRES y APELLIDOS.
//
//  POR QUÉ EXISTE (dirección, 27/08/2026): en la ficha y en el estado de cuenta
//  los nombres van arriba, grandes, y los apellidos debajo, más pequeños y sin
//  negrilla. Para eso hay que saber dónde termina uno y empieza el otro.
//
//  En la base el nombre viene en UN SOLO campo ("SAMUEL GRAJALES DUQUE"), no
//  hay columna de apellidos. Así que toca partirlo, y se parte con la costumbre
//  colombiana: los DOS ÚLTIMOS son los apellidos y lo de antes son los nombres.
//
//  Se miraron las 1.163 fichas para no inventar la regla:
//
//        3 palabras → 877 fichas   (1 nombre  + 2 apellidos)
//        4 palabras → 274 fichas   (2 nombres + 2 apellidos)
//        2 palabras →   7 fichas   (1 nombre  + 1 apellido)
//        5 palabras →   4 fichas   (2 nombres + 3 apellidos, por las partículas)
//        1 palabra  →   1 ficha    (todo nombre, no hay apellido que sacar)
//
//  Las PARTÍCULAS —DE, DEL, LA, LOS, SAN, VAN…— no son un apellido por sí
//  solas: se pegan al que sigue. Sin esto, "JUAN DE LA CRUZ MEJÍA" partiría en
//  "JUAN DE" + "LA CRUZ", que no es el nombre de nadie.
//
//  Esto es una costumbre, no una ley: siempre habrá un caso que no encaje. Por
//  eso la pantalla NUNCA esconde nada — si la partición queda rara, el nombre
//  completo se sigue leyendo, solo que en dos renglones.
// ─────────────────────────────────────────────────────────────────────────────

/** Palabras que no van solas: se pegan al apellido que viene después. */
const PARTICULAS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LO', 'LOS', 'Y',
  'SAN', 'SANTA', 'SANTO',
  'VAN', 'VON', 'DA', 'DI', 'DOS', 'MC', 'MAC',
]);

export type NombrePartido = { nombres: string; apellidos: string };

/**
 * "SAMUEL GRAJALES DUQUE" → { nombres: "SAMUEL", apellidos: "GRAJALES DUQUE" }
 *
 * Si no se puede partir con seguridad (una sola palabra), devuelve todo como
 * nombre y los apellidos vacíos: es preferible a inventarse un apellido.
 */
export function partirNombre(completo: string): NombrePartido {
  const pal = String(completo ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (pal.length === 0) return { nombres: '', apellidos: '' };
  if (pal.length === 1) return { nombres: pal[0], apellidos: '' };
  if (pal.length === 2) return { nombres: pal[0], apellidos: pal[1] };

  /* De tres palabras en adelante: los dos últimos son los apellidos.
     Pero si justo antes de esos dos hay una partícula, se la lleva también
     ("DE LA CRUZ MEJÍA" es UN apellido y medio, no dos sueltos). */
  let corte = pal.length - 2;
  while (corte > 1 && PARTICULAS.has(pal[corte - 1].toUpperCase())) corte--;

  return {
    nombres:   pal.slice(0, corte).join(' '),
    apellidos: pal.slice(corte).join(' '),
  };
}
