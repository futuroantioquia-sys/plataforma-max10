-- ═══════════════════════════════════════════════════════════════════════════
--  DEVOLVER LAS CLAVES DE PROFES Y ADMINISTRADORES
--  Futuro Antioquia · Plataforma Max 10 · 20 de agosto de 2026
--
--  POR QUÉ: la plataforma reportó que la casilla `clave` de los profes está
--  VACÍA en la base (largo 0). Por eso NINGUNO puede entrar. En el respaldo del
--  18 de agosto esas claves estaban completas y cifradas; aquí se devuelven.
--
--  IMPORTANTE: solo escribe donde la clave está VACÍA. Si alguna ya tiene clave,
--  no se toca. Así no se pisa nada que alguien haya arreglado después.
--
--  Las claves van CIFRADAS, igual que estaban. Nadie puede leerlas de aquí.
--  Cada profe vuelve a entrar con su cédula de siempre.
--
--  DÓNDE: Supabase → proyecto fykdyalpuydkwfjqguip → SQL Editor → RUN.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PASO 1 · MIRAR ANTES DE TOCAR ──────────────────────────────────────────
-- Ejecute PRIMERO solo esto y mire el resultado. Si la columna "estado" dice
-- VACIA en todos, se confirma el diagnóstico. (No muestra ninguna clave.)

select usuario,
       case when coalesce(clave,'') = '' then 'VACIA'
            when left(clave,2) = '$2'    then 'cifrada OK'
            else 'texto plano' end as estado,
       length(coalesce(clave,''))          as largo
  from public.profes
 order by usuario;


-- ── PASO 2 · DEVOLVER LAS CLAVES DE LOS PROFES ─────────────────────────────
-- Ejecute este bloque completo.

update public.profes set clave = '$2a$06$SxePGjnmgeW95tX9nw1Rhu.wN9kd2B9HeOSvp8WC4V9fHzQCv6Dne'
 where upper(trim(usuario)) = upper('DUVAN') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$vY24Xpyv7dFE.LlyBhGwZOe5vkA2iTmRGQ5n0FqP40MZdXc4NAY/K'
 where upper(trim(usuario)) = upper('EDGAR') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$EVx2ugp9EzVIgl/2CXnPB.YAEhgQSbnppKjpg6DsN2OANBT8Oqns6'
 where upper(trim(usuario)) = upper('GIRALDO') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$L1hryUHb2GuW9h/lhSWy2.lW2ZbtLhFY9ENy5qSVK7zTNiGhUlCoa'
 where upper(trim(usuario)) = upper('GUZMAN') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$HdRB/A/ywuas/ZTVRSs1a.aPCk.Qs2ymHHzaZH5Ln0nwl8rIErmAC'
 where upper(trim(usuario)) = upper('JESUS') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$YW.t4SnJKIuStxCBh945QOPvfwWPJTJjAx3hhwatu4I4zvtfASjX2'
 where upper(trim(usuario)) = upper('JIMENEZ') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$pm0j9zc4fajd6717WS0PJu1exsxL9eMUsVYCQSc6xbdi544aOADDG'
 where upper(trim(usuario)) = upper('ALEX') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$V2rZPbXjFgdy6gGx/ftmwudDdpfl9br5rrTDlu/dB9/rKent0F.um'
 where upper(trim(usuario)) = upper('ALVAREZ') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$ktDfxjLKdAwEcQeRqaNWVeyNpA8G2c0ndbEHWRpzKWMFzd0k/riV6'
 where upper(trim(usuario)) = upper('CAMILA') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$6mPa6I0LF4p7bkG5Lb.MA.AqLCPAFXjSSBeET8N/H0A4NLGydMC.G'
 where upper(trim(usuario)) = upper('CASTRO') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$1.8eFersqVwC3EYnQYJEku8w2prmZDkALX2m03R/0WX6H/Ap/YMNu'
 where upper(trim(usuario)) = upper('CHALARCA') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$szAxTke/lqJIOEGQ3RyV/OEepwUKLLHgwmxciD29S6hd737EJU9aG'
 where upper(trim(usuario)) = upper('DORIA') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$gC0wvwDN497I5zjOG1bPS.yRYMGI5tA1Pv2w14FiIxRGNkNv6FLuu'
 where upper(trim(usuario)) = upper('KAREN') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$fUntE3p94NC9mXA3x0Z.0ej0.ZlWGPOWLyQMQ24YSF5yaWF6.u/1W'
 where upper(trim(usuario)) = upper('MARLON') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$dnzgyg1ynJR.P.CGGZ0muOUlicdEVJkG1J4t53uo.F2w/Uc9sezkq'
 where upper(trim(usuario)) = upper('MARTIN') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$O2l8hQdGLOHJSPHYnMrGouycFH0X076dOix53EF8RAHxcDiKFap1G'
 where upper(trim(usuario)) = upper('MEJIA') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$X6Y8uDXRHrlwDP0hR6NxruTfTDfLPm7zLO3F.HQFcJywFFtogE21.'
 where upper(trim(usuario)) = upper('MUÑOZ') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$hIDkEOwV7xZjTQkaXuJ5KuhLtvhsOMOC/IwRjRav/DK0iyb2jAJKO'
 where upper(trim(usuario)) = upper('NICOLAS') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$oWeaPGRIRlBgYJHlZI7ZL.Wccb77ETnEtBY0yNTpvwO9K7UVYedl6'
 where upper(trim(usuario)) = upper('QUINTERO') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$zt9/s.aN0eEjlpoFN19OeeDyjMI8m5a7Xi.NM/n8w8C/REb5xSWyi'
 where upper(trim(usuario)) = upper('RAMIREZ') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$VmdsenuU8rBYt/1ZGL3jUubmLS/MkjV2vkAK8ekHazcBAA/NMsNk2'
 where upper(trim(usuario)) = upper('RIOS') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$FGdeGqRjogNKO05feK6PTeigxQvmGObgVGF5FJ6DUsbC.OxBMPHRu'
 where upper(trim(usuario)) = upper('SAMUEL') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$XeVm3suRGMQ7kCIfnxdW5.d78QHmfF0k1g8hnwCtof/xonD.mpR.u'
 where upper(trim(usuario)) = upper('TABARES') and coalesce(clave,'') = '';
update public.profes set clave = '$2a$06$UFVGNGGwdzblVV/ts7vl3O.9kStMDxS3JItgNINdLaZtvJ.rTdG8a'
 where upper(trim(usuario)) = upper('ANDRADE') and coalesce(clave,'') = '';


-- ── PASO 3 · DEVOLVER LAS CLAVES DE LOS ADMINISTRADORES ────────────────────

update public.admins set clave = '$2a$06$AMRpVFs70uxtmGzswUIhmeTvUV/qm7uRtTiH8KGTaTG6kO0RXj/pq'
 where upper(trim(usuario)) = upper('DIANA') and coalesce(clave,'') = '';
update public.admins set clave = '$2a$06$0Q3WuGg0IvagWPxq2YeI5O/tZ0IoTIG6T4CJpd1ScByqm2Ebn1AbK'
 where upper(trim(usuario)) = upper('CASTRO') and coalesce(clave,'') = '';
update public.admins set clave = '$2a$06$GsP4uYxZiAe/buBHRPlO0eFxW9fV2AMfGbhDfrFvlBTzZXiiE0KPC'
 where upper(trim(usuario)) = upper('TOVIOS') and coalesce(clave,'') = '';


-- ── PASO 4 · COMPROBAR ─────────────────────────────────────────────────────
-- Todos deben quedar en "cifrada OK".

select usuario,
       case when coalesce(clave,'') = '' then 'VACIA'
            when left(clave,2) = '$2'    then 'cifrada OK'
            else 'texto plano' end as estado
  from public.profes
 order by usuario;

select usuario,
       case when coalesce(clave,'') = '' then 'VACIA'
            when left(clave,2) = '$2'    then 'cifrada OK'
            else 'texto plano' end as estado
  from public.admins
 order by usuario;
