do $$
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  alter table projects
    add column if not exists project_details jsonb;
end $$;
