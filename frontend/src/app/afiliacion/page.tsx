'use client';

/**
 * Formulario de Afiliación — Futuro Antioquia
 *
 * FLUJO ANTIGUO: deportista ya está en la base → busca por su código → formulario pre-llenado
 * FLUJO NUEVO:   escribe PIN "34" → formulario vacío → queda pendiente de asignación de proyecto
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle, Search, ClipboardList,
  AlertCircle, UserCheck, UserPlus, ChevronRight, Lock, Calendar,
} from 'lucide-react';
import { getDeportistas, saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { cn } from '@/lib/utils';

// ── Constantes ───────────────────────────────────────────────
const PIN_NUEVO    = '34';
const EXCLUIDAS    = [/^proy/i, /^profe/i, /^cal$/i, /^compite/i, /^__EMPTY/i];
const esExcluida   = (k: string) => EXCLUIDAS.some(rx => rx.test(k));

// Campos base para deportistas nuevos — divididos en secciones
const CAMPOS_NUEVO: { key: string; label: string; tipo: string; seccion?: string }[] = [
  // ── SECCIÓN 1: DATOS DE AFILIACIÓN ─────────────────────────
  { key: 'ESTADO',          label: 'Tipo de afiliación',        tipo: 'select', seccion: 'DATOS DE AFILIACIÓN' },
  { key: 'PROGRAMA',        label: 'Programa',                  tipo: 'select' },
  { key: 'CODIGO',          label: 'Código del deportista',     tipo: 'text'   },
  { key: 'NOMBRE_COMPLETO', label: 'Nombre del deportista',     tipo: 'text'   },
  { key: 'AÑO',             label: 'Año de nacimiento',         tipo: 'number' },
  { key: 'MES',             label: 'Mes de nacimiento',         tipo: 'text'   },
  { key: 'DÍA',             label: 'Día de nacimiento',         tipo: 'number' },
  { key: 'SEDE',            label: 'Sede de entrenamiento',     tipo: 'select' },
  { key: 'JORNADA_ENT',     label: 'Jornada de entrenamiento',  tipo: 'select' },
  { key: 'POSICION',        label: 'Posición en el campo',      tipo: 'select' },
  { key: 'TALLA_UNIFORME',  label: 'Talla de uniforme',         tipo: 'select' },
  { key: 'PIE_HABIL',       label: 'Pie dominante',             tipo: 'select' },
  { key: 'TALLA',           label: 'Talla (cm)',                tipo: 'number' },
  { key: 'PESO',            label: 'Peso (kg)',                 tipo: 'number' },
  // ── SECCIÓN 2: OTROS DATOS DEL DEPORTISTA ──────────────────
  { key: 'TIPO_DOC',        label: 'Tipo de documento',         tipo: 'select', seccion: 'OTROS DATOS DEL DEPORTISTA' },
  { key: 'DOCUMENTO',       label: 'Número de documento',       tipo: 'text'   },
  { key: 'EPS',             label: 'EPS / Entidad de salud',    tipo: 'text'   },
  { key: 'GENERO',          label: 'Género',                    tipo: 'select' },
  { key: 'ESTRATO',         label: 'Estrato',                   tipo: 'select' },
  { key: 'DIRECCION',       label: 'Dirección',                 tipo: 'text'   },
  { key: 'BARRIO',          label: 'Barrio',                    tipo: 'text'   },
  { key: 'MUNICIPIO',       label: 'Municipio',                 tipo: 'text'   },
  { key: 'CON_QUIEN_VIVE',  label: 'Con quién vive',            tipo: 'select' },
  { key: 'TIPO_COL',        label: 'Tipo de colegio',           tipo: 'select' },
  { key: 'COLEGIO',         label: 'Institución educativa',     tipo: 'text'   },
  { key: 'JORNADA',         label: 'Jornada de estudio 2026',   tipo: 'select' },
  { key: 'HORARIO_ESTUDIO', label: 'Horario de estudio',        tipo: 'text'   },
  { key: 'GRADO',              label: 'Grado',                                    tipo: 'select' },
  { key: 'ANTECEDENTES_MED',  label: 'Antecedentes médicos',                     tipo: 'text'   },
  { key: 'CONDICION_MENTAL',  label: '¿Alguna condición mental o comportamental?', tipo: 'text'  },
  { key: 'TORNEOS_LOCALES', label: '¿En cuántos torneos locales le gustaría participar?', tipo: 'select' },
  { key: 'TORNEOS_NAC',     label: '¿Le gustaría participar en torneos nacionales?',      tipo: 'select' },
  // ── SECCIÓN 3: DATOS DE ACUDIENTE / RESPONSABLE ─────────────
  { key: 'ACUDIENTE',         label: 'Nombre del acudiente',              tipo: 'text',   seccion: 'DATOS DE ACUDIENTE / RESPONSABLE' },
  { key: 'PARENTESCO_ACUD',  label: 'Parentesco del acudiente',          tipo: 'select' },
  { key: 'TIPO_DOC_ACUD',    label: 'Tipo de documento del acudiente',   tipo: 'select' },
  { key: 'DOC_ACUD',        label: 'Número de documento del acudiente',   tipo: 'text'   },
  { key: 'TEL_ACUDIENTE',  label: 'Teléfono del acudiente',              tipo: 'tel'    },
  { key: 'EMPRESA',         label: 'Empresa donde labora',                tipo: 'text'   },
  { key: 'CARGO',           label: 'Cargo',                               tipo: 'text'   },
  // ── Otros ────────────────────────────────────────────────────
  { key: 'EMAIL',           label: 'Correo electrónico',                  tipo: 'email'  },
  // ── SECCIÓN 4: DATOS DE OTRO FAMILIAR ───────────────────────
  { key: 'NOMBRE_FAMILIAR', label: 'Nombre del familiar',                 tipo: 'text',   seccion: 'DATOS DE OTRO FAMILIAR' },
  { key: 'PARENTESCO',      label: 'Parentesco',                          tipo: 'select' },
  { key: 'CEL_FAMILIAR',    label: 'Número de celular',                   tipo: 'tel'    },
  { key: 'HERMANOS_CLUB',   label: '¿Tienes hermanos en el club?',        tipo: 'select' },
  { key: 'NOMBRE_HERMANO',  label: 'Nombre de tu hermano',                tipo: 'text'   },
  { key: 'OBSERVACIONES',   label: '¿Qué espera recibir del proyecto y si tiene algún comentario de mejora para la institución?', tipo: 'text', seccion: 'TU OPINIÓN ES MUY IMPORTANTE PARA NOSOTROS' },
];

function labelDe(k: string) {
  if (/^estado|tipo.*afil|afil.*tipo/i.test(k))         return 'Tipo de afiliación';
  if (/^tipo.*doc.*acud|^td.*acud/i.test(k))  return 'Tipo de documento del acudiente';
  if (/^doc.*acud/i.test(k))                 return 'Número de documento del acudiente';
  if (/^acud/i.test(k))                      return 'Nombre del acudiente';
  if (/^empresa/i.test(k))                    return 'Empresa donde labora';
  if (/^cargo/i.test(k))                      return 'Cargo';
  if (/^con.*quien.*vive|^con_quien/i.test(k)) return 'Con quién vive';
  if (/^nombre.*fam|^familiar/i.test(k))          return 'Nombre del familiar';
  if (/^parentesco.*acud|^par.*acud/i.test(k))    return 'Parentesco del acudiente';
  if (/^parentesco/i.test(k))                     return 'Parentesco';
  if (/^td$|^tipo.*doc|^t\.?doc/i.test(k))  return 'Tipo de documento';
  if (/^a[ñn]o$/i.test(k))                  return 'Año de nacimiento';
  if (/^mes$/i.test(k))                      return 'Mes de nacimiento';
  if (/^d[ií]a$/i.test(k))                  return 'Día de nacimiento';
  if (/^direcci/i.test(k))                   return 'Dirección';
  if (/^fecha.*afil|^afil.*fecha/i.test(k))  return 'Fecha de afiliación';
  if (/^jornada.*ent|^jornada_ent/i.test(k)) return 'Jornada de entrenamiento';
  if (/^jornada/i.test(k))                   return 'Jornada de estudio 2026';
  if (/^horario.*est|^horario/i.test(k))     return 'Horario de estudio';
  if (/^c[oó]d|^codigo/i.test(k))            return 'Código del deportista';
  if (/^pie.*hab|^pie.*dom|^pie/i.test(k))   return 'Pie dominante';
  if (/^grado/i.test(k))                      return 'Grado';
  if (/^antecedentes/i.test(k))               return 'Antecedentes médicos';
  if (/^condici.*ment|^condici.*comp/i.test(k)) return '¿Alguna condición mental o comportamental?';
  if (/^sede/i.test(k))                      return 'Sede de entrenamiento';
  if (/^posici/i.test(k))                    return 'Posición en el campo';
  if (/^talla.*uni|^uniforme/i.test(k))      return 'Talla de uniforme';
  if (/^torneos.*loc|^loc.*torneo/i.test(k)) return '¿En cuántos torneos locales le gustaría participar?';
  if (/^torneos.*nac|^nac.*torneo/i.test(k)) return '¿Le gustaría participar en torneos nacionales?';
  if (/^tipo.*col|^t\.?col/i.test(k))        return 'Tipo de colegio';
  if (/^gen[eé]ro|^sexo/i.test(k))           return 'Género';
  if (/^observ/i.test(k))                     return '¿Qué espera recibir del proyecto y si tiene algún comentario de mejora para la institución?';
  return k.replace(/^([0-9]+\.\s*)/, '').replace(/_/g, ' ').trim()
    .replace(/^\w/, c => c.toUpperCase());
}
function tipoDe(k: string): string {
  if (/email|correo/i.test(k))              return 'email';
  if (/tel[eé]|phone|celular/i.test(k))     return 'tel';
  if (/fecha|date/i.test(k))               return 'date';
  if (/talla|peso/i.test(k))               return 'number';
  return 'text';
}

// ── Listas con escritura libre (datalist) ────────────────────
const AÑOS  = Array.from({ length: 15 }, (_, i) => String(2025 - i));
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS  = Array.from({ length: 31 }, (_, i) => String(i + 1));

type DatalistDef = { rx: RegExp; listId: string; opciones: string[] };
const DATALISTS: DatalistDef[] = [
  { rx: /^a[ñn]o$/i,    listId: 'dl-anio', opciones: AÑOS  },
  { rx: /^mes$/i,        listId: 'dl-mes',  opciones: MESES },
  { rx: /^d[ií]a$/i,    listId: 'dl-dia',  opciones: DIAS  },
];
function getDatalist(key: string) {
  return DATALISTS.find(d => d.rx.test(key)) ?? null;
}

// ── Desplegables fijos (select) ──────────────────────────────
type DropOpt = { value: string; label: string };
const DROPDOWNS: { rx: RegExp; label: string; opciones: DropOpt[] }[] = [
  {
    rx: /^estado|tipo.*afil|afil.*tipo/i,
    label: 'Tipo de afiliación',
    opciones: [
      { value: 'Antiguo',          label: 'Antiguo'          },
      { value: 'Nuevo',            label: 'Nuevo'            },
      { value: 'Reingreso',        label: 'Reingreso'        },
      { value: 'Pasó de Est.',     label: 'Pasó de Est.'     },
      { value: 'B Institucional',  label: 'B Institucional'  },
      { value: 'MB Institucional', label: 'MB Institucional' },
    ],
  },
  {
    rx: /^program/i,
    label: 'Programa',
    opciones: [
      { value: 'Estimulación',  label: 'Estimulación'  },
      { value: 'Formación',     label: 'Formación'     },
      { value: 'Institucional', label: 'Institucional' },
    ],
  },
  {
    rx: /^tipo.*doc.*acud|^td.*acud|^tipo_doc_acud/i,
    label: 'Tipo de doc. del acudiente',
    opciones: [
      { value: 'Cédula de Ciudadanía (CC)',          label: 'Cédula de Ciudadanía (CC)'          },
      { value: 'Cédula de Extranjería (CE)',          label: 'Cédula de Extranjería (CE)'          },
      { value: 'Pasaporte (PA)',                      label: 'Pasaporte (PA)'                      },
      { value: 'Permiso por Protección Temporal (PPT)', label: 'Permiso por Protección Temporal (PPT)' },
      { value: 'Otro',                               label: 'Otro'                               },
    ],
  },
  {
    // captura "TD", "TIPO DOC", "TIPO_DOC", "T.DOC", etc.
    rx: /^td$|^tipo.*doc|^t\.?doc|^tip.*id/i,
    label: 'Tipo de documento',
    opciones: [
      { value: '1. Registro Civil',           label: '1. Registro Civil'           },
      { value: '2. Tarjeta de Identidad',     label: '2. Tarjeta de Identidad'     },
      { value: '3. Documento de Extranjería', label: '3. Documento de Extranjería' },
    ],
  },
  {
    rx: /^gen[eé]ro|^sexo/i,
    label: 'Género',
    opciones: [
      { value: 'Masculino', label: 'Masculino' },
      { value: 'Femenino',  label: 'Femenino'  },
    ],
  },
  {
    rx: /^estrato/i,
    label: 'Estrato',
    opciones: [1,2,3,4,5,6].map(n => ({ value: String(n), label: String(n) })),
  },
  {
    rx: /^tipo.*col|^t\.?col/i,
    label: 'Tipo de colegio',
    opciones: [
      { value: 'Público',    label: 'Público'    },
      { value: 'Privado',    label: 'Privado'    },
      { value: 'No estudia', label: 'No estudia' },
    ],
  },
  {
    rx: /^sede/i,
    label: 'Sede de entrenamiento',
    opciones: [
      { value: 'Santa Mónica',  label: 'Santa Mónica'  },
      { value: 'La 80',         label: 'La 80'         },
      { value: 'Centro',        label: 'Centro'        },
      { value: 'Sabaneta',      label: 'Sabaneta'      },
      { value: 'Bello Niquía',  label: 'Bello Niquía'  },
      { value: 'Rionegro',      label: 'Rionegro'      },
      { value: 'Institucional', label: 'Institucional' },
    ],
  },
  {
    rx: /^grado/i,
    label: 'Grado a cursar',
    opciones: [
      { value: 'Ninguno',      label: 'Ninguno'      },
      { value: 'Pre jardín',   label: 'Pre jardín'   },
      { value: 'Jardín',       label: 'Jardín'       },
      { value: 'Transición',   label: 'Transición'   },
      { value: '1',            label: '1'            },
      { value: '2',            label: '2'            },
      { value: '3',            label: '3'            },
      { value: '4',            label: '4'            },
      { value: '5',            label: '5'            },
      { value: '6',            label: '6'            },
      { value: '7',            label: '7'            },
      { value: '8',            label: '8'            },
      { value: '9',            label: '9'            },
      { value: '10',           label: '10'           },
      { value: '11',           label: '11'           },
    ],
  },
  {
    rx: /^jornada.*ent|^jornada_ent/i,
    label: 'Jornada de entrenamiento',
    opciones: [
      { value: 'Entre semana en la mañana',  label: 'Entre semana en la mañana'  },
      { value: 'Entre semana en la tarde',   label: 'Entre semana en la tarde'   },
      { value: 'Fin de semana en la mañana', label: 'Fin de semana en la mañana' },
      { value: 'Estimulación sábado',        label: 'Estimulación sábado'        },
      { value: 'Estimulación domingo',       label: 'Estimulación domingo'       },
    ],
  },
  {
    rx: /^jornada/i,
    label: 'Jornada de estudio 2026',
    opciones: [
      { value: 'Ninguna',           label: 'Ninguna'           },
      { value: 'Mañana',            label: 'Mañana'            },
      { value: 'Tarde',             label: 'Tarde'             },
      { value: 'Jornada Continua',  label: 'Jornada Continua'  },
      { value: 'Aún no sabemos',    label: 'Aún no sabemos'    },
    ],
  },
  {
    rx: /^pie.*hab|^pie.*dom|^pie/i,
    label: 'Pie dominante',
    opciones: [
      { value: 'Derecho',   label: 'Derecho'   },
      { value: 'Izquierdo', label: 'Izquierdo' },
    ],
  },
  {
    rx: /^posici/i,
    label: 'Posición en el campo',
    opciones: [
      { value: 'Portero',   label: 'Portero'   },
      { value: 'De campo',  label: 'De campo'  },
      { value: 'No sé',     label: 'No sé'     },
    ],
  },
  {
    rx: /^talla.*uni|^uniforme/i,
    label: 'Talla de uniforme',
    opciones: ['2','4','6','8','10','12','14','16','S','M','L','XL']
      .map(v => ({ value: v, label: v })),
  },
  {
    rx: /^torneos.*loc|^loc.*torneo/i,
    label: '¿En cuántos torneos locales le gustaría participar?',
    opciones: [
      { value: '1',       label: '1'       },
      { value: '2',       label: '2'       },
      { value: '3',       label: '3'       },
      { value: 'Ninguno', label: 'Ninguno' },
    ],
  },
  {
    rx: /^torneos.*nac|^nac.*torneo/i,
    label: '¿Le gustaría participar en torneos nacionales?',
    opciones: [
      { value: 'Sí', label: 'Sí' },
      { value: 'No', label: 'No' },
    ],
  },
  {
    rx: /^con.*quien.*vive|^con_quien/i,
    label: 'Con quién vive',
    opciones: [
      { value: 'Madre',         label: 'Madre'         },
      { value: 'Padre',         label: 'Padre'         },
      { value: 'Madre y padre', label: 'Madre y padre' },
      { value: 'Solo abuelos',  label: 'Solo abuelos'  },
    ],
  },
  {
    rx: /^hermanos.*club|^hermanos/i,
    label: '¿Tienes hermanos en el club?',
    opciones: [
      { value: 'Sí', label: 'Sí' },
      { value: 'No', label: 'No' },
    ],
  },
  {
    rx: /^parentesco.*acud|^par.*acud/i,
    label: 'Parentesco del acudiente',
    opciones: [
      { value: 'Padre',  label: 'Padre'  },
      { value: 'Madre',  label: 'Madre'  },
      { value: 'Abuelo', label: 'Abuelo' },
      { value: 'Tío',    label: 'Tío'    },
      { value: 'Otro',   label: 'Otro'   },
    ],
  },
  {
    rx: /^parentesco/i,
    label: 'Parentesco',
    opciones: [
      { value: 'Padre',  label: 'Padre'  },
      { value: 'Madre',  label: 'Madre'  },
      { value: 'Abuelo', label: 'Abuelo' },
      { value: 'Tío',    label: 'Tío'    },
      { value: 'Otro',   label: 'Otro'   },
    ],
  },
];
function getDropdown(key: string) {
  return DROPDOWNS.find(d => d.rx.test(key)) ?? null;
}

type Modo  = 'antiguo' | 'nuevo';
type Paso  = 'seleccion' | 'ingreso' | 'formulario' | 'enviado';

// ─────────────────────────────────────────────────────────────
export default function AfiliacionPage() {
  const router = useRouter();

  const [modo,      setModo]     = useState<Modo>('antiguo');
  const [paso,      setPaso]     = useState<Paso>('ingreso');
  const [pin,       setPin]      = useState('');
  const [codigo,    setCodigo]   = useState('');
  const [documento, setDocumento] = useState('');
  const [error,     setError]    = useState('');
  const [buscando,  setBuscando]  = useState(false);
  const [enviando,  setEnviando]  = useState(false);

  // Cache local de deportistas para búsquedas/validaciones
  const [_deps, _setDeps] = useState<Deportista[]>([]);
  useEffect(() => { getDeportistas().then(_setDeps); }, []);

  const [depId,      setDepId]      = useState<string | null>(null);
  const [campos,     setCampos]     = useState<{ key: string; label: string; tipo: string; seccion?: string }[]>([]);
  const [valores,    setValores]    = useState<Record<string, string>>({});
  const [auth,       setAuth]       = useState([false, false, false]);
  const [codigoError, setCodigoError] = useState('');

  // Helper: obtener columnas del Excel excluyendo las 4 restringidas
  // Deduplica por label: si dos columnas generan el mismo label, queda la que tiene valor
  function camposDesdeExcel(dep: Deportista) {
    const todos = Object.keys(dep._columnas)
      .filter(k => !esExcluida(k))
      .map(k => ({ key: k, label: labelDe(k), tipo: tipoDe(k) }));

    const vistos = new Map<string, typeof todos[0]>();
    todos.forEach(c => {
      const prev = vistos.get(c.label);
      if (!prev) {
        vistos.set(c.label, c);
      } else {
        // Preferir la que ya tiene un valor
        const valActual = dep._columnas[c.key] ?? '';
        const valPrev   = dep._columnas[prev.key] ?? '';
        if (valActual && !valPrev) vistos.set(c.label, c);
      }
    });

    return todos.filter(c => vistos.get(c.label)?.key === c.key);
  }

  // ── Selección de modo ────────────────────────────────────────
  function elegirModo(m: Modo) {
    setModo(m); setError(''); setPin(''); setCodigo(''); setDocumento('');
    setPaso('ingreso');
  }

  // ── ANTIGUO: buscar por DOCUMENTO + CÓDIGO ───────────────────
  function buscarAntiguo() {
    if (!documento.trim() || !codigo.trim()) {
      setError('Debes ingresar tu número de documento y tu código.');
      return;
    }
    setBuscando(true); setError('');
    try {
      const lista: Deportista[] = _deps;
      const norm = (s: string) => s.toLowerCase().replace(/[\s.-]/g, '');

      // Buscar por código primero
      const dep = lista.find(d => {
        const kCod = Object.keys(d._columnas).find(c => /^c[oó]d/i.test(c));
        return kCod && norm(d._columnas[kCod] ?? '') === norm(codigo);
      });

      if (!dep) {
        setError('No encontramos ese código en el sistema. Verifica e intenta de nuevo.');
        setBuscando(false); return;
      }

      // Verificar documento: buscar columna de documento/cédula en sus datos
      const kDoc = Object.keys(dep._columnas).find(c =>
        /^doc|^c[eé]d|^identidad|^id\b|^n[uú]m.*doc/i.test(c)
      );
      if (kDoc && dep._columnas[kDoc]) {
        // El Excel tiene columna de documento: verificar coincidencia
        if (norm(dep._columnas[kDoc]) !== norm(documento)) {
          setError('El documento no coincide con el código ingresado. Verifica tus datos.');
          setBuscando(false); return;
        }
      }
      // Si el Excel no tiene columna de documento, se acepta con solo el código

      const cols = camposDesdeExcel(dep);
      const vals: Record<string, string> = { _nombre: dep._nombre };
      cols.forEach(c => { vals[c.key] = dep._columnas[c.key] ?? ''; });
      setCampos(cols); setValores(vals); setDepId(dep.id); setPaso('formulario');
    } catch { setError('Error al buscar. Intenta de nuevo.'); }
    setBuscando(false);
  }

  // ── NUEVO: validar PIN → siempre usa CAMPOS_NUEVO definidos ──
  function validarNuevo() {
    if (pin.trim() !== PIN_NUEVO) {
      setError('Código incorrecto. Solicítalo a la administración de Futuro Antioquia.');
      return;
    }
    setError('');
    setCampos(CAMPOS_NUEVO);
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    setValores({ FECHA_AFILIACION: hoy });
    setDepId(null);
    setPaso('formulario');
  }

  // ── Validar código único (solo para nuevos) ──────────────────
  function validarCodigoUnico(val: string) {
    if (!val.trim()) { setCodigoError(''); return; }
    const lista: Deportista[] = _deps;
    const norm = (s: string) => s.toLowerCase().replace(/[\s.-]/g, '');
    const existe = lista.some(d => {
      const kCod = Object.keys(d._columnas).find(c => /^c[oó]d/i.test(c));
      return kCod && norm(d._columnas[kCod] ?? '') === norm(val);
    });
    setCodigoError(existe
      ? `⚠ El código "${val.trim()}" ya existe y pertenece a otro deportista afiliado. Por favor usa un código diferente.`
      : '');
  }

  // ── Guardar formulario ───────────────────────────────────────
  function guardar(e: React.FormEvent) {
    e.preventDefault();

    // Revalidar código antes de guardar (para nuevos)
    if (!depId) {
      const codVal = valores['CODIGO'] ?? '';
      const lista: Deportista[] = _deps;
      const norm = (s: string) => s.toLowerCase().replace(/[\s.-]/g, '');
      const existe = lista.some(d => {
        const kCod = Object.keys(d._columnas).find(c => /^c[oó]d/i.test(c));
        return kCod && norm(d._columnas[kCod] ?? '') === norm(codVal);
      });
      if (existe) {
        setCodigoError(`⚠ El código "${codVal.trim()}" ya existe y pertenece a otro deportista afiliado. Por favor usa un código diferente.`);
        return;
      }
    }

    setEnviando(true);
    try {
      const lista: Deportista[] = [..._deps];

      if (depId) {
        // Actualizar existente
        const act = lista.map(d => {
          if (d.id !== depId) return d;
          const cols = { ...d._columnas };
          campos.forEach(c => { cols[c.key] = valores[c.key] ?? ''; });

          // ── Marcar como AFILIADO ACTIVO ──────────────────────────
          // Buscar columna de tipo de afiliación / estado
          const keyEstado = Object.keys(cols).find(k => /^estado|tipo.*afil|afil.*tipo/i.test(k.trim()));
          if (keyEstado) {
            // Solo sobrescribir si está vacío o sin afiliación
            const actual = (cols[keyEstado] ?? '').trim().toLowerCase();
            if (!actual || /sin.*afil|sin\s*afil|^-+$/.test(actual)) {
              cols[keyEstado] = 'Antiguo';
            }
          } else {
            cols['TIPO_AFILIACION'] = 'Antiguo';
          }
          // Registrar fecha de afiliación si no la tiene
          const keyFecha = Object.keys(cols).find(k => /^fecha.*afil|^afil.*fecha/i.test(k.trim()));
          const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
          if (keyFecha) {
            if (!cols[keyFecha]?.trim()) cols[keyFecha] = hoy;
          } else {
            cols['FECHA_AFILIACION'] = hoy;
          }

          return { ...d, _nombre: valores['_nombre'] || d._nombre, _columnas: cols };
        });
        saveDeportistas(act);
        _setDeps(act);
      } else {
        // Nuevo deportista — pendiente de asignación
        const cols: Record<string, string> = { ESTADO: '1. Nuevo' };
        CAMPOS_NUEVO.forEach(c => { cols[c.key] = valores[c.key] ?? ''; });
        cols['DOCUMENTO_INGRESO'] = valores['DOCUMENTO'] ?? '';
        const nuevo: Deportista = {
          id: `nuevo_${Date.now()}`,
          _nombre: valores['NOMBRE_COMPLETO'] || 'Nuevo deportista',
          _columnas: cols,
        };
        const nuevaLista = [...lista, nuevo];
        saveDeportistas(nuevaLista);
        _setDeps(nuevaLista);
      }
      setPaso('enviado');
    } catch { setError('Error al guardar. Intenta de nuevo.'); }
    setEnviando(false);
  }

  function reiniciar() {
    setPaso('ingreso'); setModo('antiguo'); setPin(''); setCodigo(''); setDocumento('');
    setError(''); setCodigoError(''); setValores({}); setDepId(null); setAuth([false, false, false]);
  }

  // ════════════════════════════════════════════════════════════
  // PASO: Ingreso (verificación) — pantalla inicial
  // ════════════════════════════════════════════════════════════
  if (paso === 'ingreso') return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#064e1e] to-[#22c55e] flex flex-col items-center justify-center px-4 py-10 overflow-hidden">
      {/* ── Patrón decorativo balones ── */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full opacity-[0.13]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-ing" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="26" fill="none" stroke="white" strokeWidth="1.5"/>
              <polygon points="50,40 60,47 56,58 44,58 40,47" fill="none" stroke="white" strokeWidth="1.5"/>
              <line x1="50" y1="40" x2="50" y2="24" stroke="white" strokeWidth="1"/>
              <line x1="60" y1="47" x2="73" y2="43" stroke="white" strokeWidth="1"/>
              <line x1="56" y1="58" x2="64" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="44" y1="58" x2="36" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="40" y1="47" x2="27" y2="43" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-ing)"/>
        </svg>
        <svg className="absolute -top-16 -right-16 w-64 h-64 opacity-[0.07]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="2"/>
          <polygon points="50,22 72,38 63,64 37,64 28,38" fill="none" stroke="white" strokeWidth="2"/>
          <line x1="50" y1="22" x2="50" y2="2" stroke="white" strokeWidth="1.5"/>
          <line x1="72" y1="38" x2="90" y2="30" stroke="white" strokeWidth="1.5"/>
          <line x1="63" y1="64" x2="78" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="37" y1="64" x2="22" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="28" y1="38" x2="10" y2="30" stroke="white" strokeWidth="1.5"/>
        </svg>
        <svg className="absolute -bottom-10 -left-10 w-52 h-52 opacity-[0.07]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="80" fill="none" stroke="white" strokeWidth="2"/>
          <circle cx="100" cy="100" r="40" fill="none" stroke="white" strokeWidth="1.5"/>
        </svg>
      </div>
      <div className="flex flex-col items-center mb-6">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-3">
          <span className="text-[#16a34a] font-black text-lg">FA</span>
        </div>
        <h1 className="text-white font-black text-xl text-center">{'Formulario de Inscripción 2026'}</h1>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        {/* Botones de selección */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setModo('antiguo'); setError(''); setPin(''); setCodigo(''); setDocumento(''); }}
            className={cn('flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl font-bold text-sm transition border-2',
              modo === 'antiguo'
                ? 'bg-[#16a34a] border-[#16a34a] text-white shadow-lg shadow-green-200'
                : 'bg-white border-[#16a34a] text-[#16a34a] hover:bg-green-50')}>
            <UserCheck className="w-5 h-5" />
            Afiliado en 2026
          </button>
          <button
            onClick={() => { setModo('nuevo'); setError(''); setPin(''); setCodigo(''); setDocumento(''); }}
            className={cn('flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl font-bold text-sm transition border-2',
              modo === 'nuevo'
                ? 'bg-[#16a34a] border-[#16a34a] text-white shadow-lg shadow-green-200'
                : 'bg-white border-[#16a34a] text-[#16a34a] hover:bg-green-50')}>
            <UserPlus className="w-5 h-5" />
            Sin Afiliación 2026
          </button>
        </div>

        {modo === 'antiguo' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Número de documento
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 1000234567"
                value={documento}
                onChange={e => setDocumento(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('inp-codigo')?.focus()}
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Código de deportista
              </label>
              <input
                id="inp-codigo"
                type="text"
                placeholder="Ej: FA-2024-001"
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarAntiguo()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
              />
            </div>
            {error && <ErrorBox msg={error} />}
            <button onClick={buscarAntiguo} disabled={!codigo.trim() || !documento.trim() || buscando}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2">
              {buscando ? <Spinner /> : <Search className="w-4 h-4" />}
              {buscando ? 'Buscando...' : 'Ingresar a mi ficha'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-[#064e1e] font-medium">
              Solicita el código de acceso a la administración de Futuro Antioquia antes de continuar.
            </div>
            <div>
              <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Código de acceso
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Código numérico"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && validarNuevo()}
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-center tracking-[0.5em] font-black focus:outline-none focus:ring-2 focus:ring-[#16a34a] placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-normal"
              />
            </div>
            {error && <ErrorBox msg={error} />}
            <button onClick={validarNuevo} disabled={!pin.trim()}
              className="w-full bg-[#16a34a] hover:bg-[#064e1e] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2">
              <ChevronRight className="w-4 h-4" />
              Continuar al formulario
            </button>
          </div>
        )}

      </div>

      <button onClick={() => router.push('/dashboard')}
        className="mt-6 text-white/60 hover:text-white text-sm flex items-center gap-1.5 transition">
        <ArrowLeft className="w-4 h-4" /> Volver al inicio
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PASO: Formulario
  // ════════════════════════════════════════════════════════════
  if (paso === 'formulario') return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => setPaso('ingreso')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-bold">FA</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-sm leading-tight truncate">
            {depId
              ? (valores['_nombre'] || 'Actualizar ficha')
              : 'Sin Afiliación 2026 — Ficha de Afiliación'}
          </p>
          <p className="text-[10px] text-white/60">
            {depId ? 'Actualiza tu información personal' : 'Completa todos tus datos'}
          </p>
        </div>
        <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0',
          depId ? 'bg-blue-100 text-blue-700' : 'bg-[#dbeafe] text-[#1e3a8a]')}>
          {depId ? 'Afiliado 2026' : 'Sin Afiliación 2026'}
        </span>
        <div className="ml-auto text-right leading-tight border-l border-gray-200 pl-3 flex-shrink-0">
          <p className="text-[#1e3a8a] font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-gray-400 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {!depId && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#16a34a] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#064e1e]">Próximo paso: Asignación de proyecto</p>
              <p className="text-xs text-[#16a34a] mt-0.5">
                Una vez envíes este formulario, la administración revisará tus datos y te asignará
                el programa, proyecto y código definitivo de Futuro Antioquia.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-5 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
              <svg className="absolute inset-0 w-full h-full opacity-[0.13]" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="sp-fh" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                    <circle cx="40" cy="40" r="20" fill="none" stroke="white" strokeWidth="1.2"/>
                    <polygon points="40,31 48,37 45,47 35,47 32,37" fill="none" stroke="white" strokeWidth="1.2"/>
                    <line x1="40" y1="31" x2="40" y2="20" stroke="white" strokeWidth="0.8"/>
                    <line x1="48" y1="37" x2="58" y2="34" stroke="white" strokeWidth="0.8"/>
                    <line x1="45" y1="47" x2="51" y2="55" stroke="white" strokeWidth="0.8"/>
                    <line x1="35" y1="47" x2="29" y2="55" stroke="white" strokeWidth="0.8"/>
                    <line x1="32" y1="37" x2="22" y2="34" stroke="white" strokeWidth="0.8"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#sp-fh)"/>
              </svg>
              <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-24 h-24 opacity-[0.08]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="2.5"/>
                <polygon points="50,24 70,38 62,62 38,62 30,38" fill="none" stroke="white" strokeWidth="2.5"/>
              </svg>
            </div>
            <h2 className="relative text-white font-black text-lg">Ficha de Afiliación</h2>
            <p className="relative text-white/70 text-xs mt-0.5">
              Completa todos los campos con información real y actualizada
            </p>
          </div>

          <form onSubmit={guardar} className="p-6 space-y-5">
            {/* ── Autorizaciones obligatorias ── */}
            <div className="space-y-4 pt-2">
              <p className="text-[13px] font-black text-gray-500 uppercase tracking-widest">
                Autorizaciones obligatorias — debe marcar las tres para continuar
              </p>

              {/* 1. Tratamiento de datos e imagen */}
              <AuthBox
                idx={0} auth={auth} setAuth={setAuth}
                titulo="AUTORIZACIÓN PARA TRATAMIENTO DE DATOS E IMAGEN"
                color="green">
                <p>Yo, como representante legal del deportista menor de edad, al marcar la casilla a
                continuación, <strong>AUTORIZO EXPRESAMENTE</strong> a la Academia de Fútbol FUTURO ANTIOQUIA para:</p>
                <ol className="list-decimal list-inside mt-2 space-y-1.5">
                  <li><strong>Tratamiento de Datos Personales:</strong> Recolectar y usar mis datos personales
                  y los del menor (incluidos contactos de emergencia y datos de salud) para fines deportivos
                  y administrativos, conforme a la Ley 1581 de 2012.</li>
                  <li><strong>Uso de Imagen y Voz:</strong> Captar, usar y difundir la imagen y/o voz del
                  menor en fotografías y videos de entrenamientos o eventos para uso informativo y
                  promocional en redes sociales, web y material publicitario de La Academia. Declaro conocer
                  mi derecho a solicitar la actualización, rectificación o supresión de estos datos.</li>
                </ol>
              </AuthBox>

              {/* 2. Políticas de matrícula y pago */}
              <AuthBox
                idx={1} auth={auth} setAuth={setAuth}
                titulo="ACEPTACIÓN DE POLÍTICAS DE MATRÍCULA Y PAGO DE MENSUALIDADES 2026"
                color="gray">
                <p>Yo, como representante legal del deportista, consiento y acepto que la matrícula tiene
                una vigencia anual 2026, <strong>NO INCLUYE CLÁUSULAS DE PERMANENCIA</strong>, pero la
                responsabilidad del pago de la mensualidad inicia con la matrícula y solo finaliza al
                comunicarse la desvinculación (únicamente al WhatsApp <strong>3045401497</strong>).</p>
                <p className="mt-2">Enero no se cobra. Las mensualidades se pagan de <strong>febrero a
                diciembre</strong>, incluyendo junio, julio, octubre y diciembre, sin excepción por
                vacaciones familiares. La única causal para exonerar el pago mensual es una
                <strong> incapacidad médica expedida por la EPS</strong>.</p>
                <p className="mt-2"><strong>No hay devolución de costos de Matrícula.</strong></p>
              </AuthBox>

              {/* 3. Exoneración de responsabilidad */}
              <AuthBox
                idx={2} auth={auth} setAuth={setAuth}
                titulo="EXONERACIÓN DE RESPONSABILIDAD Y SEGURIDAD SOCIAL"
                color="white">
                <p>Yo, como representante legal, certifico que el deportista cuenta con afiliación activa
                y vigente a una Entidad Promotora de Salud (EPS), ya sea en el régimen subsidiado o
                contributivo.</p>
                <p className="mt-2">Declaro que soy el único responsable de mantener al día esta
                afiliación y que la institución <strong>no asumirá gastos médicos, hospitalarios o de
                rehabilitación</strong> derivados de lesiones o accidentes ocurridos durante las
                actividades deportivas que deban ser cubiertos por la EPS.</p>
                <p className="mt-2">Exonero de responsabilidad a la institución, sus entrenadores y
                directivos, por cualquier accidente, lesión o eventualidad médica que pueda sufrir el
                deportista durante los entrenamientos.</p>
                <p className="mt-2"><strong>Póliza de Cobertura Adicional:</strong> La institución podrá
                gestionar o proponer la contratación de una póliza de salud o seguro de accidentes de
                manera opcional o si está es un requisito de participación en torneos. La contratación
                y el costo de esta póliza adicional es responsabilidad directa del acudiente/responsable,
                <strong> siempre y cuando desee tomarla</strong>.</p>
              </AuthBox>

              {!auth.every(Boolean) && (
                <p className="text-[13px] text-red-500 font-semibold text-center">
                  ⚠ Debes aceptar las tres autorizaciones para poder enviar el formulario.
                </p>
              )}
            </div>

            {/* ── Fecha de afiliación bloqueada ── */}
            {auth.every(Boolean) && (
              <div className="flex items-center gap-4 bg-gradient-to-r from-[#064e1e] to-[#22c55e] rounded-2xl px-5 py-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest">
                    Fecha de afiliación
                  </p>
                  <p className="text-white font-black text-base mt-0.5">
                    {new Date().toLocaleDateString('es-CO', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5 flex-shrink-0">
                  <Lock className="w-3 h-3 text-white/70" />
                  <span className="text-white/70 text-[10px] font-bold">BLOQUEADO</span>
                </div>
              </div>
            )}

            {/* Nombre (sólo para deportistas existentes) */}
            {depId && (
              <div className="sm:col-span-2">
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Nombre del deportista
                </label>
                <input type="text" value={valores['_nombre'] ?? ''}
                  onChange={e => setValores(v => ({ ...v, _nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#16a34a] placeholder:text-gray-300"
                  placeholder="Nombre completo del deportista" />
              </div>
            )}

            {/* Campos dinámicos con secciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campos.flatMap(c => {
                if (depId && /^deportista|^nombre/i.test(c.key)) return [];
                const esLargo   = /direcci|observ|notas|comment|horario|antecedent|condici/i.test(c.key);
                const dropdown  = getDropdown(c.key);
                const labelShow = c.label || labelDe(c.key);
                const secHeader = c.seccion ? (
                  <div key={`sec-${c.key}`} className="sm:col-span-2 pt-2">
                    <div className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] rounded-xl px-4 py-3 shadow-sm">
                      <p className="text-white font-black text-[13px] uppercase tracking-widest drop-shadow">
                        {c.seccion}
                      </p>
                    </div>
                  </div>
                ) : null;
                const field = (
                  <div key={c.key} className={esLargo ? 'sm:col-span-2' : ''}>
                    <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                      {labelShow}
                    </label>

                    {dropdown ? (
                      /* ── Select fijo ── */
                      <select
                        value={valores[c.key] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [c.key]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#16a34a] bg-white">
                        <option value="">— Selecciona —</option>
                        {dropdown.opciones.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : getDatalist(c.key) ? (() => {
                      /* ── Input con datalist (escribe o elige) ── */
                      const dl = getDatalist(c.key)!;
                      return (
                        <>
                          <input
                            type="text"
                            list={dl.listId}
                            value={valores[c.key] ?? ''}
                            onChange={e => setValores(v => ({ ...v, [c.key]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#16a34a] placeholder:text-gray-300"
                            placeholder={labelShow} />
                          <datalist id={dl.listId}>
                            {dl.opciones.map(o => <option key={o} value={o} />)}
                          </datalist>
                        </>
                      );
                    })() : esLargo ? (
                      /* ── Textarea ── */
                      <textarea
                        value={valores[c.key] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [c.key]: e.target.value }))}
                        rows={3}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none placeholder:text-gray-300"
                        placeholder={labelShow} />
                    ) : (
                      /* ── Input normal ── */
                      <>
                        <input
                          type={c.tipo}
                          value={valores[c.key] ?? ''}
                          onChange={e => {
                            setValores(v => ({ ...v, [c.key]: e.target.value }));
                            if (!depId && /^CODIGO$/i.test(c.key)) setCodigoError('');
                          }}
                          onBlur={e => {
                            if (!depId && /^CODIGO$/i.test(c.key)) validarCodigoUnico(e.target.value);
                          }}
                          className={cn(
                            'w-full border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 placeholder:text-gray-300',
                            !depId && /^CODIGO$/i.test(c.key) && codigoError
                              ? 'border-red-400 focus:ring-red-400 bg-red-50'
                              : 'border-gray-200 focus:ring-[#16a34a]'
                          )}
                          placeholder={labelShow} />
                        {!depId && /^CODIGO$/i.test(c.key) && codigoError && (
                          <div className="flex items-start gap-2 mt-2 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600 font-semibold">{codigoError}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
                return secHeader ? [secHeader, field] : [field];
              })}
            </div>


            {error && <ErrorBox msg={error} />}

            <button type="submit" disabled={enviando || !auth.every(Boolean) || !!codigoError}
              className="w-full bg-[#16a34a] hover:bg-[#064e1e] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 text-sm">
              {enviando ? <Spinner /> : <CheckCircle className="w-4 h-4" />}
              {enviando ? 'Guardando...' : 'Enviar formulario'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PASO: Confirmación
  // ════════════════════════════════════════════════════════════
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#064e1e] to-[#22c55e] flex items-center justify-center px-4 overflow-hidden">
      {/* ── Patrón decorativo balones ── */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full opacity-[0.13]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-env" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="26" fill="none" stroke="white" strokeWidth="1.5"/>
              <polygon points="50,40 60,47 56,58 44,58 40,47" fill="none" stroke="white" strokeWidth="1.5"/>
              <line x1="50" y1="40" x2="50" y2="24" stroke="white" strokeWidth="1"/>
              <line x1="60" y1="47" x2="73" y2="43" stroke="white" strokeWidth="1"/>
              <line x1="56" y1="58" x2="64" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="44" y1="58" x2="36" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="40" y1="47" x2="27" y2="43" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-env)"/>
        </svg>
        <svg className="absolute -bottom-20 -right-20 w-80 h-80 opacity-[0.07]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="2"/>
          <polygon points="50,22 72,38 63,64 37,64 28,38" fill="none" stroke="white" strokeWidth="2"/>
          <line x1="50" y1="22" x2="50" y2="2" stroke="white" strokeWidth="1.5"/>
          <line x1="72" y1="38" x2="90" y2="30" stroke="white" strokeWidth="1.5"/>
          <line x1="63" y1="64" x2="78" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="37" y1="64" x2="22" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="28" y1="38" x2="10" y2="30" stroke="white" strokeWidth="1.5"/>
        </svg>
        <svg className="absolute -top-12 -left-12 w-60 h-60 opacity-[0.06]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="0" cy="0" r="90" fill="none" stroke="white" strokeWidth="2"/>
          <circle cx="0" cy="0" r="45" fill="none" stroke="white" strokeWidth="1.5"/>
          <line x1="0" y1="-90" x2="100" y2="-90" stroke="white" strokeWidth="1"/>
        </svg>
      </div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-[#16a34a]" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">
          {depId ? '¡Ficha actualizada!' : '¡Registro enviado!'}
        </h2>
        {depId ? (
          <p className="text-gray-500 text-sm mb-8">
            Tu información fue actualizada correctamente en el sistema de Futuro Antioquia.
          </p>
        ) : (
          <div className="mb-8">
            <p className="text-gray-500 text-sm">
              Tu solicitud fue recibida. La administración revisará tus datos y te asignará
              tu <strong>programa, proyecto y código definitivo</strong>.
            </p>
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-xs text-[#064e1e] font-semibold">
                📋 Próximo paso: espera que la academia confirme tu vinculación y te entregue tu código de deportista.
              </p>
            </div>
          </div>
        )}
        <button onClick={reiniciar}
          className="w-full bg-[#16a34a] hover:bg-[#064e1e] text-white font-bold py-3.5 rounded-xl transition">
          Volver al inicio
        </button>
        <button onClick={() => router.push('/dashboard')}
          className="w-full mt-3 text-gray-400 hover:text-gray-600 font-semibold py-2 rounded-xl transition text-sm">
          Ir al dashboard
        </button>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-600 font-medium">{msg}</p>
    </div>
  );
}
function Spinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />;
}

const COLOR_MAP: Record<string, { bg: string; border: string; title: string; check: string; text: string }> = {
  green: { bg: 'bg-green-50',  border: 'border-green-300', title: 'text-green-800', check: 'accent-green-700', text: 'text-green-700' },
  gray:  { bg: 'bg-gray-100',  border: 'border-gray-400',  title: 'text-gray-900',  check: 'accent-gray-700',  text: 'text-gray-800'  },
  blue:  { bg: 'bg-blue-50',   border: 'border-blue-400',  title: 'text-blue-900',  check: 'accent-blue-700',  text: 'text-blue-800'  },
  white: { bg: 'bg-white',     border: 'border-gray-300',  title: 'text-gray-900',  check: 'accent-gray-800',  text: 'text-gray-800'  },
};

function AuthBox({
  idx, auth, setAuth, titulo, color, children,
}: {
  idx: number;
  auth: boolean[];
  setAuth: React.Dispatch<React.SetStateAction<boolean[]>>;
  titulo: string;
  color: 'green' | 'gray' | 'blue' | 'white';
  children: React.ReactNode;
}) {
  const c = COLOR_MAP[color];
  const checked = auth[idx];
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${c.bg} ${checked ? c.border : 'border-gray-200'}`}>
      <p className={`text-xs font-black uppercase tracking-wide mb-3 ${c.title}`}>{titulo}</p>
      <div className={`text-[13px] leading-relaxed space-y-1 ${c.text}`}>{children}</div>
      <label className="flex items-start gap-3 mt-4 cursor-pointer group">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => {
            const next = [...auth];
            next[idx] = e.target.checked;
            setAuth(next);
          }}
          className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 cursor-pointer ${c.check}`}
        />
        <span className={`text-[13px] font-bold leading-snug select-none ${checked ? c.title : 'text-gray-500'}`}>
          {checked
            ? '✓ Acepto y entiendo las condiciones anteriores'
            : 'Marcar para aceptar las condiciones anteriores'}
        </span>
      </label>
    </div>
  );
}
