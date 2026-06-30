/** Tipos y constantes compartidas de deportistas */

export const DEPORTISTAS_KEY = 'futuro_deportistas';

export interface Deportista {
  id:        string;
  _nombre:   string; // campo interno para mostrar en lista
  _columnas: Record<string, string>; // TODOS los datos del Excel tal como vienen
  foto?:     string;
}
