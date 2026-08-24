-- ═══════════════════════════════════════════════════════════════════════
--  FUTURO ANTIOQUIA — ARREGLOS DE CÓDIGOS DE DEPORTISTA
--  Proyecto correcto: fykdyalpuydkwfjqguip  (el ACTIVO, plan Pro)
--
--  CÓMO USARLO
--  1. Entra a supabase.com → proyecto fykdyalpuydkwfjqguip → "SQL Editor".
--  2. Ejecuta UN BLOQUE A LA VEZ, en orden, y revisa el resultado.
--  3. Los bloques que empiezan con SELECT solo MUESTRAN, no cambian nada.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 1 — RESPALDO COMPLETO  (ejecutar SIEMPRE, primero que todo)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.deportistas_respaldo_20260820 as
select * from public.deportistas;

select count(*) as filas_respaldadas from public.deportistas_respaldo_20260820;
-- Debe darte el mismo número de deportistas que muestra la plataforma.


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 2 — VER la afiliación vacía del 15/08 (NO borra nada todavía)
-- ───────────────────────────────────────────────────────────────────────
select id, nombre, created_at,
       (select count(*) from jsonb_each_text(columnas) e
         where trim(coalesce(e.value,'')) <> '') as campos_con_dato
from public.deportistas
where upper(trim(nombre)) = 'NUEVO DEPORTISTA';
-- Espera 1 fila, con "campos_con_dato" muy bajo (2 o 3): es el registro vacío.
-- Si "campos_con_dato" es alto, ¡PARA! No es el fantasma. Avísame.


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 3 — Comprobar que no tenga pagos ni nada colgando
-- ───────────────────────────────────────────────────────────────────────
with f as (select id from public.deportistas where upper(trim(nombre))='NUEVO DEPORTISTA')
select 'pagos_estado' t, count(*) from pagos_estado  where deportista_id in (select id from f)
union all select 'asistencia',    count(*) from asistencia     where deportista_id in (select id from f)
union all select 'soportes_pago', count(*) from soportes_pago  where deportista_id in (select id from f)
union all select 'documentos',    count(*) from documentos_deportista where deportista_id in (select id from f)
union all select 'mensajes',      count(*) from mensajes       where deportista_id in (select id from f)
union all select 'otros_pagos',   count(*) from otros_pagos    where deportista_id in (select id from f);
-- TODOS deben dar 0. Si alguno da más de 0, ¡PARA! y avísame.


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 4 — BORRAR la afiliación vacía  (solo si los bloques 2 y 3 dieron bien)
-- ───────────────────────────────────────────────────────────────────────
delete from public.deportistas
where upper(trim(nombre)) = 'NUEVO DEPORTISTA'
returning id, nombre;


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 5 — VER el código de Matías antes de corregirlo
-- ───────────────────────────────────────────────────────────────────────
select id, nombre,
       (select max(trim(columnas->>kk)) from jsonb_object_keys(columnas) kk
         where kk ~* '^c[oó]d' and trim(coalesce(columnas->>kk,'')) <> '') as codigo_actual
from public.deportistas
where nombre ilike '%APR%EZ%' or nombre ilike '%MAT%AS FERN%';
-- Debe salir Matías Fernández Apráez con código "26".
-- Confirma también que 26401 esté libre:
select count(*) as ya_existe_26401 from public.deportistas
where (select max(trim(columnas->>kk)) from jsonb_object_keys(columnas) kk
        where kk ~* '^c[oó]d') = '26401';
-- Debe dar 0.


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 6 — CORREGIR el código de Matías: 26 → 26401
-- ───────────────────────────────────────────────────────────────────────
update public.deportistas d
set columnas = d.columnas || jsonb_build_object(
      (select kk from jsonb_object_keys(d.columnas) kk where kk ~* '^c[oó]d' limit 1),
      '26401'),
    updated_at = now()
where nombre ilike '%APR%EZ%'
  and (select max(trim(d.columnas->>kk)) from jsonb_object_keys(d.columnas) kk
        where kk ~* '^c[oó]d') = '26'
returning id, nombre;


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 7 — VER cuántos nombres distintos tiene la columna del código
-- ───────────────────────────────────────────────────────────────────────
select (select string_agg(kk,' | ' order by kk) from jsonb_object_keys(columnas) kk
         where kk ~* '^c[oó]d') as nombre_de_la_columna,
       count(*) as cuantos_deportistas
from public.deportistas group by 1 order by 2 desc;
-- Aquí verás si tienes "CÓDIGO", "CODIGO" y "CÓDIGO DEL DEPORTISTA" separados.


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 8 — UNIFICAR las tres columnas en una sola: "CÓDIGO"
-- ───────────────────────────────────────────────────────────────────────
update public.deportistas d
set columnas = (d.columnas - 'CODIGO' - 'CÓDIGO DEL DEPORTISTA' - 'CODIGO DEL DEPORTISTA')
               || jsonb_build_object('CÓDIGO', coalesce(
                    nullif(trim(d.columnas->>'CÓDIGO'), ''),
                    nullif(trim(d.columnas->>'CODIGO'), ''),
                    nullif(trim(d.columnas->>'CÓDIGO DEL DEPORTISTA'), ''),
                    nullif(trim(d.columnas->>'CODIGO DEL DEPORTISTA'), ''),
                    '')),
    updated_at = now()
where d.columnas ?| array['CODIGO','CÓDIGO DEL DEPORTISTA','CODIGO DEL DEPORTISTA'];


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 9 — VERIFICACIÓN FINAL (compara contra el respaldo del bloque 1)
-- ───────────────────────────────────────────────────────────────────────
with antes as (
  select id, (select max(trim(columnas->>kk)) from jsonb_object_keys(columnas) kk
              where kk ~* '^c[oó]d' and trim(coalesce(columnas->>kk,'')) <> '') as cod
  from public.deportistas_respaldo_20260820
), despues as (
  select id, columnas->>'CÓDIGO' as cod,
    (select string_agg(kk,' | ' order by kk) from jsonb_object_keys(columnas) kk
      where kk ~* '^c[oó]d') as claves
  from public.deportistas
)
select
  (select count(*) from despues)                                as total_ahora,
  (select count(*) from despues where claves = 'CÓDIGO')        as con_una_sola_columna,
  (select count(*) from despues where claves <> 'CÓDIGO')       as con_columna_rara,
  (select count(*) from despues where coalesce(cod,'') = '')    as quedaron_sin_codigo,
  (select count(*) from antes a join despues d using(id)
     where a.cod is distinct from d.cod
       and not (a.cod = '26' and d.cod = '26401'))              as codigos_alterados_por_error;
-- LO QUE DEBES VER:
--   con_una_sola_columna  = total_ahora
--   con_columna_rara            = 0
--   quedaron_sin_codigo         = 0
--   codigos_alterados_por_error = 0   ← si NO es 0, restaura con el bloque 10


-- ───────────────────────────────────────────────────────────────────────
-- BLOQUE 10 — DESHACER TODO (solo si algo salió mal)
-- ───────────────────────────────────────────────────────────────────────
-- delete from public.deportistas;
-- insert into public.deportistas select * from public.deportistas_respaldo_20260820;
