-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: MICROCICLO DE ENTRENAMIENTO  ·  Futuro Antioquia / MAX 10
-- Ubicación en la plataforma: categoría SEGUIMIENTO
-- Se construye desde ADMON · lo gestiona el FORMADOR
--
-- REGLA DEL MÓDULO:
--   La asistencia NO se guarda aquí. El microciclo LEE la tabla
--   `asistencia` (el formato que el formador actualiza) y solo
--   muestra: % de asistencia, número de asistentes y la lista de
--   deportistas faltantes con su motivo.
--   Fuente única de verdad de la asistencia = tabla `asistencia`.
--
-- Ejecutar en: Supabase → SQL Editor → proyecto fykdyalpuydkwfjqguip
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Cabecera del microciclo (una semana de trabajo) ─────────
create table if not exists public.microciclos (
  id                uuid primary key default gen_random_uuid(),

  proyecto          text        not null,        -- mismo valor que asistencia.proyecto
  profesor          text        default '',      -- formador responsable
  numero            int         default 1,       -- microciclo Nº dentro del mesociclo
  mesociclo         text        default '',      -- etiqueta libre: "Pretemporada", "Competencia"...

  fecha_inicio      date        not null,        -- lunes de la semana
  fecha_fin         date        not null,        -- domingo de la semana

  objetivo_general  text        default '',
  objetivo_tecnico  text        default '',
  objetivo_tactico  text        default '',
  objetivo_fisico   text        default '',
  objetivo_psico    text        default '',

  -- 'borrador'  → ADMON lo está armando
  -- 'publicado' → visible y editable por el formador
  -- 'cerrado'   → semana terminada, queda como historial
  estado            text        not null default 'borrador',

  creado_por        text        default '',      -- quién lo construyó (ADMON)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint microciclos_estado_ok
    check (estado in ('borrador', 'publicado', 'cerrado')),
  constraint microciclos_fechas_ok
    check (fecha_fin >= fecha_inicio)
);

-- Un solo microciclo por proyecto y semana
create unique index if not exists microciclos_proyecto_semana_uk
  on public.microciclos (proyecto, fecha_inicio);

create index if not exists microciclos_proyecto_idx
  on public.microciclos (proyecto, fecha_inicio desc);


-- ── 2. Días del microciclo (lunes a domingo) ───────────────────
create table if not exists public.microciclo_dias (
  id              uuid primary key default gen_random_uuid(),
  microciclo_id   uuid not null references public.microciclos(id) on delete cascade,

  fecha           date not null,
  dia_semana      int  not null,                -- 1 = lunes … 7 = domingo

  -- entreno | partido | descarga | recuperacion | descanso | competencia
  tipo_dia        text default 'entreno',
  -- baja | media | alta | muy_alta  (carga planificada)
  carga           text default 'media',

  objetivo_dia    text default '',
  contenidos      text default '',              -- contenidos técnico-tácticos del día

  -- Las tres fases de la sesión (texto por ahora)
  fase_inicial    text default '',
  fase_central    text default '',
  fase_final      text default '',

  -- FASE 2 (pizarra): dibujo de la cancha con jugadores, balones,
  -- conos, aros y flechas. Se guarda como JSON de figuras.
  -- Reservadas desde ya para no volver a migrar la tabla.
  pizarra_inicial jsonb default null,
  pizarra_central jsonb default null,
  pizarra_final   jsonb default null,

  observaciones   text default '',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint microciclo_dias_tipo_ok
    check (tipo_dia in ('entreno','partido','descarga','recuperacion','descanso','competencia')),
  constraint microciclo_dias_carga_ok
    check (carga in ('baja','media','alta','muy_alta')),
  constraint microciclo_dias_dia_ok
    check (dia_semana between 1 and 7)
);

create unique index if not exists microciclo_dias_fecha_uk
  on public.microciclo_dias (microciclo_id, fecha);

create index if not exists microciclo_dias_mc_idx
  on public.microciclo_dias (microciclo_id, dia_semana);


-- ── 3. updated_at automático ───────────────────────────────────
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists microciclos_touch on public.microciclos;
create trigger microciclos_touch
  before update on public.microciclos
  for each row execute function public.tocar_updated_at();

drop trigger if exists microciclo_dias_touch on public.microciclo_dias;
create trigger microciclo_dias_touch
  before update on public.microciclo_dias
  for each row execute function public.tocar_updated_at();


-- ── 4. Vista de solo lectura: asistencia resumida por día ──────
-- El microciclo la consume para mostrar % y asistentes.
-- Estados (definidos en /asistencia):
--   A  = Asistió      C  = Compite   → cuentan como PRESENTE
--   F  = Faltó        S  = Salud     ES = Estudio
--   FA = Familia      NQ = No quizo  → cuentan como FALTA (con motivo)
--   CAN = Cancelado   SE = Sin Empezar → no cuentan (día sin sesión)
create or replace view public.v_asistencia_dia as
select
  a.proyecto,
  a.fecha,
  count(*) filter (where a.estado in ('A','C'))                        as asistentes,
  count(*) filter (where a.estado in ('F','S','ES','FA','NQ'))         as faltantes,
  count(*) filter (where a.estado in ('A','C','F','S','ES','FA','NQ')) as convocados,
  round(
    100.0 * count(*) filter (where a.estado in ('A','C'))
    / nullif(count(*) filter (where a.estado in ('A','C','F','S','ES','FA','NQ')), 0)
  , 0) as porcentaje
from public.asistencia a
group by a.proyecto, a.fecha;


-- ── 5. Seguridad ───────────────────────────────────────────────
-- Se deja alineado con el resto de la plataforma (acceso por anon key
-- con el portero de rutas en middleware.ts). Cuando se active RLS real
-- en todas las tablas —pendiente conocido del backlog— estas dos tablas
-- se incluyen en el mismo barrido.
alter table public.microciclos     disable row level security;
alter table public.microciclo_dias disable row level security;

-- FIN

-- ═══════════════════════════════════════════════════════════════
-- AMPLIACIÓN (22 ago 2026) — escenario, hora y componentes por día
--
-- Los proyectos rotan de sede, así que cada día lleva su ESCENARIO
-- y su HORA. Y en vez de "tipo de día", el formador marca los
-- COMPONENTES a desarrollar (pueden ser varios a la vez).
--
-- Es seguro volver a ejecutar este archivo completo: todo está
-- escrito con "if not exists".
-- ═══════════════════════════════════════════════════════════════

alter table public.microciclo_dias
  add column if not exists escenario   text  default '',
  add column if not exists hora        text  default '',
  add column if not exists componentes jsonb default '[]'::jsonb;

-- ── PASO QUE FALTABA: refrescar la memoria de la API ──────────
--  Supabase guarda en memoria la lista de columnas de cada tabla.
--  Al agregar columnas nuevas con ALTER TABLE, esa memoria puede
--  quedarse con la foto vieja: la columna YA existe en la base,
--  pero la API sigue respondiendo "no la encuentro" (error PGRST204),
--  que es justo el mensaje que salía al guardar el microciclo.
--  Esta línea la obliga a releer. Es instantánea y no toca datos.
notify pgrst, 'reload schema';


-- ── COMPROBACIÓN — mire el resultado de abajo ─────────────────
--  Deben aparecer TRES filas: escenario, hora y componentes.
--  · Si aparecen las tres  → listo, vuelva a la plataforma y guarde.
--  · Si no aparece ninguna → está en el proyecto de Supabase
--    equivocado. El bueno es  fykdyalpuydkwfjqguip.
select column_name  as "columna",
       data_type    as "tipo"
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'microciclo_dias'
   and column_name in ('escenario', 'hora', 'componentes')
 order by column_name;

-- FIN DE LA AMPLIACIÓN
