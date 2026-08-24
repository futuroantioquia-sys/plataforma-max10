-- ═══════════════════════════════════════════════════════════════════════════
--  BLINDAJE · FASE 1  ·  Futuro Antioquia / Plataforma MAX 10
--  Preparado el 22 de agosto de 2026
--
--  DÓNDE SE PEGA:
--     Supabase → proyecto  fykdyalpuydkwfjqguip  → SQL Editor → pegar → RUN
--
--  QUÉ HACE: cierra las puertas que hoy están abiertas y que NADIE de la
--  plataforma usa. Por eso es seguro: no cambia ningún dato y no afecta lo
--  que ven profes, calidosos ni administración.
--
--  LO QUE **NO** HACE: todavía NO cierra la puerta grande (que el navegador
--  hable directo con la base). Eso es la Fase 2 y requiere primero mover las
--  consultas al servidor; si se cierra ahora, la plataforma deja de funcionar.
--
--  CADA PASO SE PUEDE EJECUTAR POR SEPARADO. Al final hay un paso 6 opcional.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PASO 1 · MIRAR CÓMO ESTÁ TODO ANTES DE TOCAR ──────────────────────────
-- Ejecute esto primero y guarde una foto del resultado. No cambia nada.

select c.relname                                              as tabla,
       c.relrowsecurity                                       as candado_puesto,
       has_table_privilege('anon', c.oid, 'SELECT')           as publico_puede_leer,
       has_table_privilege('anon', c.oid, 'UPDATE')           as publico_puede_cambiar,
       has_table_privilege('anon', c.oid, 'DELETE')           as publico_puede_borrar
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public' and c.relkind = 'r'
order  by publico_puede_borrar desc, c.relname;


-- ── PASO 2 · CERRAR TABLAS QUE EL NAVEGADOR NUNCA USA ─────────────────────
-- nomina y proveedores solo se ven desde el servidor. Hoy cualquiera en
-- internet puede leerlas y borrarlas con la clave pública. Se cierran.

revoke all on public.nomina      from anon, authenticated;
revoke all on public.proveedores from anon, authenticated;

alter table public.nomina      enable row level security;
alter table public.proveedores enable row level security;

-- La copia de respaldo de deportistas del 20/08 no la usa nadie: se cierra
-- también (y en el paso 6 opcional se puede borrar del todo).
revoke all on public.deportistas_respaldo_codigo_20260820 from anon, authenticated;


-- ── PASO 3 · CERRAR FUNCIONES QUE NADIE LLAMA ─────────────────────────────
-- `set_jornada_proyecto` permite, con solo la clave pública, cambiar de golpe
-- la JORNADA de TODOS los deportistas de un proyecto. La plataforma no la usa.
revoke execute on function public.set_jornada_proyecto(text, text) from anon, authenticated, public;

-- `hash_clave` es un disparador interno; no debe poder llamarse desde fuera.
revoke execute on function public.hash_clave() from anon, authenticated, public;


-- ── PASO 4 · PONER EL CANDADO (RLS) EN LAS TABLAS QUE NO LO TIENEN ────────
-- Hoy 6 tablas están SIN candado. Se les pone el candado y, a la vez, una
-- llave provisional idéntica al permiso que ya tenían, para que NADA cambie
-- de comportamiento hoy. Sirve para que en la Fase 2 baste con quitar la
-- llave provisional en un solo sitio.

do $$
declare t text;
begin
  foreach t in array array[
    'calificaciones_escolares','config_valoracion','jornada_mes',
    'mensajes','visitas','evaluaciones','fotos_deportistas',
    'pagos_estado','soportes_pago'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists provisional_todo on public.%I', t);
    execute format(
      'create policy provisional_todo on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Comprobación: ninguna tabla debería quedar con el candado abierto.
select c.relname as tabla_sin_candado
from   pg_class c join pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;


-- ── PASO 5 · ESCONDER LAS CONTRASEÑAS DE PROFES Y ADMINISTRADORES ─────────
--
--  ⚠  HAZ ESTE PASO **DESPUÉS** DE PUBLICAR LA NUEVA VERSIÓN DE LA PLATAFORMA
--     Y DE COMPROBAR QUE PROFES Y ADMINISTRADORES ENTRAN BIEN.
--
--  Hoy, con la clave pública, cualquiera puede descargar la columna `clave`
--  (las contraseñas cifradas de los 24 profes y 3 administradores) y ponerse
--  a descifrarlas con calma en su propio computador. Esto lo impide: se deja
--  ver todo MENOS la contraseña. El ingreso sigue funcionando porque se hace
--  por dentro de la base (función `login_verificar`).

revoke select on public.profes from anon, authenticated;
grant  select (id, usuario, nombre, proyectos, foto) on public.profes to anon, authenticated;

revoke select on public.admins from anon, authenticated;
grant  select (id, usuario, nombre, tipo) on public.admins to anon, authenticated;

--  SI ALGO SALE MAL (alguien no puede entrar), deshaz solo este paso:
--     grant select on public.profes to anon, authenticated;
--     grant select on public.admins to anon, authenticated;


-- ── PASO 6 · OPCIONAL: BORRAR LA COPIA VIEJA DE DEPORTISTAS ───────────────
-- Es una copia de los datos de los 1.165 menores que ya no se usa. Mientras
-- exista, es un blanco más. Descomenta la línea si ya no la necesitas:
-- drop table public.deportistas_respaldo_codigo_20260820;


-- ═══════════════════════════════════════════════════════════════════════════
--  FIN DE LA FASE 1.
--  Vuelve a ejecutar el PASO 1 y compara: nomina, proveedores y la copia de
--  respaldo deben aparecer con "publico_puede_leer = false".
-- ═══════════════════════════════════════════════════════════════════════════
