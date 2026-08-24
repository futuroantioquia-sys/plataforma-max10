-- ═══════════════════════════════════════════════════════════════════════════
--  BORRAR TODAS LAS CALIFICACIONES  ·  Futuro Antioquia · 23 de agosto de 2026
--
--  QUÉ HACE: deja en cero las notas técnicas (CAL) que hay hoy, para empezar
--  de nuevo. A partir de ahora la única forma de poner una nota es el módulo
--  de ASISTENCIA; Programas y Proyectos solo la muestra.
--
--  LAS NOTAS ESTABAN EN DOS SITIOS DISTINTOS, y por eso a veces no coincidían:
--    1. La tabla `calificaciones` — lo que escribe Asistencia (por mes).
--    2. La columna CAL dentro de `deportistas.columnas` — lo que entró por el
--       Excel de importación y no tiene mes.
--  Se limpian los dos.
--
--  DÓNDE: Supabase → proyecto fykdyalpuydkwfjqguip → SQL Editor → RUN.
--
--  ⚠ ESTO NO SE PUEDE DESHACER con un botón. Por eso el PASO 1 guarda una
--    copia de todo antes de borrar. Ejecute el archivo COMPLETO y de una vez.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PASO 1 · RESPALDO (se guarda una copia con la fecha de hoy) ────────────
create table if not exists public.calificaciones_respaldo_20260823 as
  select * from public.calificaciones;

create table if not exists public.deportistas_cal_respaldo_20260823 as
  select id,
         nombre,
         columnas->>'CAL' as cal_anterior
    from public.deportistas
   where columnas ? 'CAL'
     and btrim(coalesce(columnas->>'CAL','')) <> '';


-- ── PASO 2 · MIRAR QUÉ SE VA A BORRAR ─────────────────────────────────────
--  Ejecute y mire los números antes de continuar.
select 'notas en la tabla calificaciones' as donde,
       count(*)                           as cuantas
  from public.calificaciones
union all
select 'notas dentro de la ficha (columna CAL)',
       count(*)
  from public.deportistas
 where columnas ? 'CAL'
   and btrim(coalesce(columnas->>'CAL','')) <> '';


-- ── PASO 3 · BORRAR ───────────────────────────────────────────────────────
delete from public.calificaciones;

update public.deportistas
   set columnas = columnas - 'CAL',
       updated_at = now()
 where columnas ? 'CAL';


-- ── PASO 4 · COMPROBAR QUE QUEDÓ EN CERO ──────────────────────────────────
--  Las dos filas deben decir 0.
select 'notas en la tabla calificaciones' as donde,
       count(*)                           as quedan
  from public.calificaciones
union all
select 'notas dentro de la ficha (columna CAL)',
       count(*)
  from public.deportistas
 where columnas ? 'CAL'
   and btrim(coalesce(columnas->>'CAL','')) <> '';


-- ── SI SE NECESITA VOLVER ATRÁS ───────────────────────────────────────────
--  El respaldo queda en estas dos tablas:
--     public.calificaciones_respaldo_20260823
--     public.deportistas_cal_respaldo_20260823
--  Para restaurar la tabla de calificaciones:
--     insert into public.calificaciones select * from public.calificaciones_respaldo_20260823;
--  Cuando esté seguro de que ya no las necesita, puede borrarlas:
--     drop table public.calificaciones_respaldo_20260823;
--     drop table public.deportistas_cal_respaldo_20260823;
