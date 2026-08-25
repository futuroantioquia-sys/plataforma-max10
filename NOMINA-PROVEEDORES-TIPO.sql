-- ═══════════════════════════════════════════════════════════════════════════
--  NÓMINA Y PROVEEDORES · COLUMNA "TIPO" + DIRECTORIO INICIAL
--  Futuro Antioquia · Plataforma Max 10 · 25 de agosto de 2026
--
--  QUÉ HACE
--    1. Le agrega la columna TIPO a las tablas `nomina` y `proveedores`
--       (PROFESOR / ADMINISTRATIVO / PROVEEDOR).
--    2. Siembra en `nomina` las 25 personas del directorio: los 22 profesores
--       con su cédula, más Tovios, Diana y Sol Marina como ADMINISTRATIVO.
--    3. A quien ya estuviera en la tabla, NO lo duplica: solo le pone el tipo
--       si lo tenía en blanco.
--
--  ES SEGURO CORRERLO VARIAS VECES. No borra nada y no pisa ningún nombre,
--  cuenta ni banco que usted ya haya escrito.
--
--  DÓNDE: Supabase → proyecto fykdyalpuydkwfjqguip → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PASO 1 · MIRAR ANTES DE TOCAR ──────────────────────────────────────────
-- Corra PRIMERO solo esto, para ver qué hay hoy en las dos tablas.

select 'nomina' as tabla, count(*) as registros from public.nomina
union all
select 'proveedores', count(*) from public.proveedores;


-- ── PASO 2 · AGREGAR LA COLUMNA TIPO ───────────────────────────────────────

alter table public.nomina      add column if not exists tipo text;
alter table public.proveedores add column if not exists tipo text;

-- Todo lo que viva en `proveedores` es, por definición, PROVEEDOR.
update public.proveedores
   set tipo = 'PROVEEDOR'
 where coalesce(tipo, '') = '';


-- ── PASO 3 · SEMBRAR EL DIRECTORIO DE NÓMINA ───────────────────────────────
-- Inserta SOLO a quien todavía no esté (se compara por el documento, sin
-- puntos ni espacios). A los que ya estén no los toca.

insert into public.nomina (nombre, documento, cuenta, banco, tipo)
select v.nombre, v.documento, '', '', v.tipo
  from (values
    -- ── PROFESORES ────────────────────────────────────────────────────────
    ('FREDY ALEXANDER RAMIREZ RIVAS',   '1020464354', 'PROFESOR'),
    ('FELIPE ALVAREZ ALVAREZ',          '1033180115', 'PROFESOR'),
    ('MARIA CAMILA QUINTERO LOPEZ',     '1193081467', 'PROFESOR'),
    ('ALEJANDRO CASTRO ESTRADA',        '1214734807', 'PROFESOR'),
    ('ANDRES FELIPE CHALARCA ROJAS',    '1128389946', 'PROFESOR'),
    ('JHON FREDY DORIA CORONADO',       '1003050289', 'PROFESOR'),
    ('JAVIER DUVAN RIOS OSPINA',        '1002066215', 'PROFESOR'),
    ('EDGAR',                           '98539787',   'PROFESOR'),  -- ⚠ falta el nombre completo
    ('MIGUEL ANGEL BUILES GIRALDO',     '1127792656', 'PROFESOR'),
    ('SEBASTIAN GUZMAN MUÑOZ',          '1000203538', 'PROFESOR'),
    ('JESUS DAVID CASTILLO GONZALEZ',   '1003404311', 'PROFESOR'),
    ('JUAN ANDRES JIMENEZ',             '1036864427', 'PROFESOR'),
    ('KAREN LIZETH BERRIO TORO',        '1000870631', 'PROFESOR'),
    ('MARLON CASTAÑO RIOS',             '1017192180', 'PROFESOR'),
    ('MARTIN MORA CARDENAS',            '1013458275', 'PROFESOR'),
    ('OSCAR FREDY MEJIA FLOREZ',        '1152192324', 'PROFESOR'),
    ('JUAN MANUEL MUÑOZ HERNANDEZ',     '1034776238', 'PROFESOR'),
    ('NICOLAS BARRIOS SAAVEDRA',        '1005372826', 'PROFESOR'),
    ('CRISTIAN CAMILO RAMIREZ AGUDELO', '1017258984', 'PROFESOR'),
    ('JULIAN RIOS HERRERA',             '1036639022', 'PROFESOR'),
    ('SAMUEL COLORADO SERNA',           '1000415036', 'PROFESOR'),
    ('ALEXANDER TABARES GUTIERREZ',     '1000084856', 'PROFESOR'),
    -- ── ADMINISTRATIVOS ───────────────────────────────────────────────────
    ('JAIRO LUIS TOVIOS OVIEDO',        '1063278765', 'ADMINISTRATIVO'),
    ('DIANA FERNANDA CASTRO ESTRADA',   '32183658',   'ADMINISTRATIVO'),
    ('SOL MARINA VILLALBA BARRIOS',     '811036997',  'ADMINISTRATIVO')
  ) as v(nombre, documento, tipo)
 where not exists (
   select 1
     from public.nomina n
    where regexp_replace(coalesce(n.documento, ''), '\D', '', 'g') = v.documento
 );


-- ── PASO 4 · PONERLE EL TIPO A LOS QUE YA ESTABAN ──────────────────────────
-- Solo escribe donde el tipo está en blanco. No pisa nada ya clasificado.

update public.nomina n
   set tipo = v.tipo
  from (values
    ('1020464354', 'PROFESOR'),       ('1033180115', 'PROFESOR'),
    ('1193081467', 'PROFESOR'),       ('1214734807', 'PROFESOR'),
    ('1128389946', 'PROFESOR'),       ('1003050289', 'PROFESOR'),
    ('1002066215', 'PROFESOR'),       ('98539787',   'PROFESOR'),
    ('1127792656', 'PROFESOR'),       ('1000203538', 'PROFESOR'),
    ('1003404311', 'PROFESOR'),       ('1036864427', 'PROFESOR'),
    ('1000870631', 'PROFESOR'),       ('1017192180', 'PROFESOR'),
    ('1013458275', 'PROFESOR'),       ('1152192324', 'PROFESOR'),
    ('1034776238', 'PROFESOR'),       ('1005372826', 'PROFESOR'),
    ('1017258984', 'PROFESOR'),       ('1036639022', 'PROFESOR'),
    ('1000415036', 'PROFESOR'),       ('1000084856', 'PROFESOR'),
    ('1063278765', 'ADMINISTRATIVO'), ('32183658',   'ADMINISTRATIVO'),
    ('811036997',  'ADMINISTRATIVO')
  ) as v(documento, tipo)
 where regexp_replace(coalesce(n.documento, ''), '\D', '', 'g') = v.documento
   and coalesce(n.tipo, '') = '';


-- ── PASO 5 · COMPROBAR ─────────────────────────────────────────────────────
-- Debe mostrar 22 PROFESOR y 3 ADMINISTRATIVO (más lo que usted ya tuviera).

select coalesce(nullif(tipo, ''), '(sin tipo)') as tipo, count(*) as cuantos
  from public.nomina
 group by 1
 order by 2 desc;

-- Y el listado completo, para revisarlo de una vez:
select nombre, documento, coalesce(nullif(tipo,''),'(sin tipo)') as tipo, cuenta, banco
  from public.nomina
 order by tipo, nombre;


-- ── OJO CON ESTOS DOS ──────────────────────────────────────────────────────
--  · EDGAR (98539787): falta el nombre completo. Corríjalo desde la pantalla
--    de Nómina y Proveedores cuando lo tenga.
--  · SOL MARINA VILLALBA BARRIOS (811036997): ese número parece un NIT de
--    empresa, no una cédula. Si en efecto es empresa, muévala a Proveedores.
