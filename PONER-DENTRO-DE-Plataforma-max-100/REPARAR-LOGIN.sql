-- ═══════════════════════════════════════════════════════════════════════════
--  REPARAR EL INGRESO DE PROFES Y ADMINISTRADORES
--  Futuro Antioquia · Plataforma Max 10 · 20 de agosto de 2026
--
--  QUÉ HACE: vuelve a crear la función `login_verificar`, que es la ÚNICA que
--  sabe comparar las claves cifradas (bcrypt) de la tabla `profes` y de la
--  tabla `admins`. Sin ella, ningún profe ni administrador puede entrar —
--  solo el usuario maestro ADMON, porque ese no depende de la base.
--
--  DÓNDE SE PEGA: Supabase → proyecto fykdyalpuydkwfjqguip → SQL Editor →
--  pegar todo → RUN. No borra ni cambia ningún dato: solo (re)crea la función.
--
--  ES SEGURO: no muestra claves, no las descifra y no las modifica. Solo
--  responde sí o no, por dentro de la base.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. La extensión que sabe comparar claves cifradas.
create extension if not exists pgcrypto with schema extensions;

-- 2. La función de verificación.
create or replace function public.login_verificar(
  p_tipo    text,
  p_usuario text,
  p_clave   text
)
returns json
language plpgsql
security definer                    -- puede leer aunque la tabla esté cerrada al público
set search_path = public, extensions
as $$
declare
  r record;
  ok boolean;
begin
  -- ── ADMINISTRADOR / CONTABILIDAD / DEPORTIVO ──
  if p_tipo = 'admin' then
    select * into r
      from public.admins
     where upper(trim(usuario)) = upper(trim(p_usuario))
     limit 1;
    if not found then
      return json_build_object('ok', false);
    end if;

    -- Clave cifrada (empieza por $2) o clave en texto plano
    if left(coalesce(r.clave, ''), 2) = '$2' then
      ok := (r.clave = extensions.crypt(p_clave, r.clave));
    else
      ok := (coalesce(r.clave, '') = p_clave);
    end if;
    if not ok then
      return json_build_object('ok', false);
    end if;

    return json_build_object(
      'ok',     true,
      'role',   coalesce(r.tipo, 'deportivo'),
      'nombre', coalesce(r.nombre, '')
    );
  end if;

  -- ── PROFESOR ──
  if p_tipo = 'profe' then
    select * into r
      from public.profes
     where upper(trim(usuario)) = upper(trim(p_usuario))
     limit 1;
    if not found then
      return json_build_object('ok', false);
    end if;

    if left(coalesce(r.clave, ''), 2) = '$2' then
      ok := (r.clave = extensions.crypt(p_clave, r.clave));
    else
      ok := (coalesce(r.clave, '') = p_clave);
    end if;
    if not ok then
      return json_build_object('ok', false);
    end if;

    return json_build_object(
      'ok',        true,
      'usuario',   r.usuario,
      'proyectos', coalesce(to_jsonb(r.proyectos), '[]'::jsonb),
      'foto',      coalesce(r.foto, '')
    );
  end if;

  return json_build_object('ok', false);
end;
$$;

-- 3. Permiso para que la plataforma pueda llamarla con la llave pública.
grant execute on function public.login_verificar(text, text, text) to anon;
grant execute on function public.login_verificar(text, text, text) to authenticated;
grant execute on function public.login_verificar(text, text, text) to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN — ejecutar DESPUÉS, cambiando la cédula por la real.
--  Debe responder {"ok": true, "usuario": "MEJIA", ...}
-- ═══════════════════════════════════════════════════════════════════════════
-- select public.login_verificar('profe', 'MEJIA', 'LA-CEDULA-DE-MEJIA');

-- Para ver qué profes existen y si su clave está cifrada (NO muestra la clave):
-- select usuario,
--        case when left(coalesce(clave,''),2) = '$2' then 'cifrada' else 'texto plano' end as tipo_clave,
--        length(coalesce(clave,'')) as largo
--   from public.profes
--  order by usuario;
