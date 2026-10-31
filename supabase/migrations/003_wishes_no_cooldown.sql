-- Поздравления без ограничения на одно устройство; общий предел поднят до 300 за 10 минут.
create or replace function public.reviews_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if public.is_admin() then return new; end if;
  new.hidden := false;
  new.approved := coalesce(public.setting('auto_approve'), 'false') = 'true';
  new.created_at := now();
  -- поздравления без ограничения на устройство; для отзывов оставляем 3 за 10 минут
  if new.kind = 'review' and new.client_id is not null then
    select count(*) into n from public.reviews
      where client_id = new.client_id and kind = 'review' and created_at > now() - interval '10 minutes';
    if n >= 3 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  -- общий предел на случай спама
  select count(*) into n from public.reviews where created_at > now() - interval '10 minutes';
  if n >= 300 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.reviews_guard() from public, anon, authenticated;
