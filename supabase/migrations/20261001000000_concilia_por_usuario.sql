-- ConciliaBK por usuario (2026-10-01): cada usuario de Brifii obtiene su
-- PROPIA organización/workspace de conciliación al primer uso. La cuenta de
-- servicio (brifyaimaster@gmail.com) conserva la organización principal con
-- los datos legacy. Aplicar en el Supabase de brifii-data.

create or replace function public.current_organization_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  uid uuid := auth.uid();
  org uuid;
  org_principal uuid := '00000000-0000-4000-8000-000000000001';
begin
  if uid is null then
    return null;
  end if;

  -- 1) workspace personal ya creado (cualquier org que NO sea la principal)
  select om.organization_id into org
    from public.organization_members om
    where om.user_id = uid
      and om.organization_id <> org_principal
    order by om.created_at
    limit 1;
  if org is not null then
    return org;
  end if;

  -- 2) cuenta de servicio → organización principal (datos legacy)
  if exists (
    select 1 from auth.users u
     where u.id = uid and u.email = 'brifyaimaster@gmail.com'
  ) then
    return org_principal;
  end if;

  -- 3) crear el workspace personal (una sola vez, con lock anti-carrera)
  perform pg_advisory_xact_lock(
    hashtextextended('concilia-org:' || uid::text, 0));
  select om.organization_id into org
    from public.organization_members om
    where om.user_id = uid
      and om.organization_id <> org_principal
    order by om.created_at
    limit 1;
  if org is not null then
    return org;
  end if;

  insert into public.organizations (id, name)
    values (gen_random_uuid(),
            'Conciliación ' || coalesce(
              (select u.email from auth.users u where u.id = uid),
              uid::text))
    returning id into org;
  insert into public.organization_members (organization_id, user_id, role)
    values (org, uid, 'admin');
  return org;
end;
$function$;

-- El auto-join a la organización principal ya no aplica (ahora es el
-- workspace legacy de la cuenta de servicio): el personal nace con el
-- primer uso vía current_organization_id().
drop trigger if exists on_auth_user_created on auth.users;

-- Quitar de la organización principal a todos menos la cuenta de servicio
-- (así nadie ve el dataset legacy salvo brifyaimaster).
delete from public.organization_members om
using auth.users u
where om.user_id = u.id
  and om.organization_id = '00000000-0000-4000-8000-000000000001'
  and u.email <> 'brifyaimaster@gmail.com';
