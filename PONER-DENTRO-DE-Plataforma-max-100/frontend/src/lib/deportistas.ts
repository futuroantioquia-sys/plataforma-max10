/** Tipos y constantes compartidas */

export const DEPORTISTAS_KEY = 'futuro_deportistas';
export const BANCOS_KEY      = 'futuro_bancos_historico';
export const VC_KEY          = 'futuro_vista_contable';

export interface Deportista {
  id:        string;
  _nombre:   string; // campo interno para mostrar en lista
  _columnas: Record<string, string>; // TODOS los datos del Excel tal como vienen
  foto?:     string;
}
