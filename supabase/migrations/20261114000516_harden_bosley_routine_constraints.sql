alter table public.bosley_routines
  drop constraint if exists bosley_routines_weekday_check;
alter table public.bosley_routines
  add constraint bosley_routines_weekday_check check (
    (recurrence = 'weekly' and weekday is not null and weekday between 0 and 6)
    or (recurrence <> 'weekly' and weekday is null)
  );

create or replace function public.validate_bosley_routine_timezone()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone for Bosley routine';
  end if;
  if tg_op = 'INSERT' and (
    select count(*) from public.bosley_routines
    where user_id = new.user_id
  ) >= 25 then
    raise exception 'A maximum of 25 routines is allowed per account';
  end if;
  return new;
end;
$function$;

drop trigger if exists bosley_routines_validate_timezone on public.bosley_routines;
create trigger bosley_routines_validate_timezone
before insert or update of timezone on public.bosley_routines
for each row execute function public.validate_bosley_routine_timezone();

drop trigger if exists bosley_routines_set_updated_at on public.bosley_routines;
create trigger bosley_routines_set_updated_at
before update on public.bosley_routines
for each row execute function public.tg_set_updated_at();

revoke all on function public.validate_bosley_routine_timezone() from public, anon;
