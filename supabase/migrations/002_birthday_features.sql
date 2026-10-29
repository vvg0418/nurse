-- Обновление к 1 ноября: модерация, поздравления, лайки, антиспам, админка,
-- мысли, фото, голоса друзей, квиз, секретное письмо.
-- Совместимо со старой версией сайта: она по-прежнему читает и пишет отзывы.

-- ---------- настройки и тексты ----------
create table if not exists public.site_texts (
  key text primary key check (char_length(key) between 1 and 80),
  value text not null default '' check (char_length(value) <= 20000),
  updated_at timestamptz not null default now()
);
alter table public.site_texts enable row level security;

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.role() = 'authenticated', false)
     and exists (
       select 1 from public.admins a
       where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;

-- внутренний доступ к настройке; наружу не открыт
create or replace function public.setting(k text) returns text
language sql stable security definer set search_path = ''
as $$ select value from public.site_texts where key = k $$;

create or replace function public.wishes_reveal_at() returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare v text := public.setting('wishes_reveal_at');
begin
  return coalesce(nullif(v, '')::timestamptz, '2026-11-01 00:00:00+04'::timestamptz);
exception when others then
  return '2026-11-01 00:00:00+04'::timestamptz;
end $$;

revoke all on public.site_texts from anon, authenticated;
grant select on public.site_texts to anon, authenticated;
grant insert, update, delete on public.site_texts to authenticated;

create policy "public reads texts" on public.site_texts for select to anon, authenticated
  using (key not like 'secret\_%' escape '\' or public.is_admin());
create policy "admin inserts texts" on public.site_texts for insert to authenticated
  with check (public.is_admin());
create policy "admin updates texts" on public.site_texts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes texts" on public.site_texts for delete to authenticated
  using (public.is_admin());

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
create trigger site_texts_touch before insert or update on public.site_texts
  for each row execute function public.touch_updated_at();

-- ---------- отзывы и поздравления ----------
alter table public.reviews
  add column if not exists approved boolean not null default false,
  add column if not exists kind text not null default 'review',
  add column if not exists client_id text;
alter table public.reviews drop constraint if exists reviews_kind_check;
alter table public.reviews add constraint reviews_kind_check check (kind in ('review', 'wish'));
alter table public.reviews drop constraint if exists reviews_client_id_check;
alter table public.reviews add constraint reviews_client_id_check
  check (client_id is null or char_length(client_id) between 8 and 64);
update public.reviews set approved = true;  -- уже опубликованные остаются на сайте

drop policy if exists "reviews are readable when not hidden" on public.reviews;
drop policy if exists "anyone can add a review" on public.reviews;

revoke all on public.reviews from anon, authenticated;
grant select (id, name, text, kind, created_at) on public.reviews to anon;
grant select on public.reviews to authenticated;
grant insert (name, text, kind, client_id) on public.reviews to anon, authenticated;
grant update (approved, hidden, name, text), delete on public.reviews to authenticated;

create policy "public reads approved" on public.reviews for select to anon, authenticated
  using (hidden = false and approved = true
         and (kind = 'review' or now() >= public.wishes_reveal_at()));
create policy "admin reads all" on public.reviews for select to authenticated
  using (public.is_admin());
create policy "anyone adds" on public.reviews for insert to anon, authenticated
  with check (hidden = false);
create policy "admin updates reviews" on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes reviews" on public.reviews for delete to authenticated
  using (public.is_admin());

-- модерация и защита от спама
create or replace function public.reviews_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if public.is_admin() then return new; end if;
  new.hidden := false;
  new.approved := coalesce(public.setting('auto_approve'), 'false') = 'true';
  new.created_at := now();
  if new.client_id is not null then
    select count(*) into n from public.reviews
      where client_id = new.client_id and created_at > now() - interval '10 minutes';
    if n >= 3 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  select count(*) into n from public.reviews where created_at > now() - interval '10 minutes';
  if n >= 40 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard before insert on public.reviews
  for each row execute function public.reviews_guard();

create index if not exists reviews_kind_idx on public.reviews (kind, created_at desc);
create index if not exists reviews_client_idx on public.reviews (client_id, created_at desc);

-- лайки
create table if not exists public.review_likes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (review_id, client_id)
);
alter table public.review_likes enable row level security;
revoke all on public.review_likes from anon, authenticated;
create index if not exists review_likes_client_idx on public.review_likes (client_id, created_at desc);

create or replace function public.like_review(rid uuid, cid text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if cid is null or char_length(cid) not between 8 and 64 then return null; end if;
  if not exists (
    select 1 from public.reviews r
    where r.id = rid and r.hidden = false and r.approved = true
      and (r.kind = 'review' or now() >= public.wishes_reveal_at())
  ) then return null; end if;
  select count(*) into n from public.review_likes
    where client_id = cid and created_at > now() - interval '10 minutes';
  if n < 60 then
    insert into public.review_likes (review_id, client_id) values (rid, cid)
    on conflict do nothing;
  end if;
  select count(*) into n from public.review_likes where review_id = rid;
  return n;
end $$;

create or replace function public.like_counts() returns table (review_id uuid, likes bigint)
language sql stable security definer set search_path = ''
as $$
  select l.review_id, count(*)
  from public.review_likes l join public.reviews r on r.id = l.review_id
  where r.hidden = false and r.approved = true
  group by l.review_id
$$;

create or replace function public.wishes_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from public.reviews where kind = 'wish' and hidden = false $$;

-- ---------- мысли, фото, голоса друзей ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 4000),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  path text not null check (char_length(path) between 1 and 300),
  caption text not null default '' check (char_length(caption) <= 300),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.greetings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  note text not null default '' check (char_length(note) <= 300),
  path text not null check (char_length(path) between 1 and 300),
  media text not null check (media in ('audio', 'video')),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  sort integer not null default 0,
  question text not null check (char_length(question) between 1 and 300),
  options text[] not null check (array_length(options, 1) between 2 and 6),
  answer integer not null check (answer >= 0),
  created_at timestamptz not null default now(),
  check (answer < array_length(options, 1))
);

alter table public.posts enable row level security;
alter table public.gallery enable row level security;
alter table public.greetings enable row level security;
alter table public.quiz_questions enable row level security;

revoke all on public.posts, public.gallery, public.greetings, public.quiz_questions from anon, authenticated;
grant select on public.posts, public.gallery, public.greetings, public.quiz_questions to anon, authenticated;
grant insert, update, delete on public.posts, public.gallery, public.greetings, public.quiz_questions to authenticated;

create policy "public reads posts" on public.posts for select to anon, authenticated
  using (published or public.is_admin());
create policy "public reads gallery" on public.gallery for select to anon, authenticated using (true);
create policy "public reads greetings" on public.greetings for select to anon, authenticated using (true);
create policy "public reads quiz" on public.quiz_questions for select to anon, authenticated using (true);

create policy "admin inserts posts" on public.posts for insert to authenticated with check (public.is_admin());
create policy "admin updates posts" on public.posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes posts" on public.posts for delete to authenticated using (public.is_admin());
create policy "admin inserts gallery" on public.gallery for insert to authenticated with check (public.is_admin());
create policy "admin updates gallery" on public.gallery for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes gallery" on public.gallery for delete to authenticated using (public.is_admin());
create policy "admin inserts greetings" on public.greetings for insert to authenticated with check (public.is_admin());
create policy "admin updates greetings" on public.greetings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes greetings" on public.greetings for delete to authenticated using (public.is_admin());
create policy "admin inserts quiz" on public.quiz_questions for insert to authenticated with check (public.is_admin());
create policy "admin updates quiz" on public.quiz_questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes quiz" on public.quiz_questions for delete to authenticated using (public.is_admin());

-- ---------- результаты квиза ----------
create table if not exists public.quiz_scores (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Гость' check (char_length(name) between 1 and 40),
  score integer not null check (score >= 0),
  total integer not null check (total between 1 and 50),
  client_id text check (client_id is null or char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  check (score <= total)
);
alter table public.quiz_scores enable row level security;
revoke all on public.quiz_scores from anon, authenticated;
grant select (id, name, score, total, created_at) on public.quiz_scores to anon;
grant select, delete on public.quiz_scores to authenticated;
grant insert (name, score, total, client_id) on public.quiz_scores to anon, authenticated;
create policy "public reads scores" on public.quiz_scores for select to anon, authenticated using (true);
create policy "anyone adds score" on public.quiz_scores for insert to anon, authenticated with check (true);
create policy "admin deletes scores" on public.quiz_scores for delete to authenticated using (public.is_admin());

create or replace function public.quiz_scores_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare n int; q int;
begin
  new.created_at := now();
  select count(*) into q from public.quiz_questions;
  if q = 0 or new.total <> q or new.score > q then
    raise exception 'bad_score' using errcode = 'P0001';
  end if;
  if new.client_id is not null then
    select count(*) into n from public.quiz_scores
      where client_id = new.client_id and created_at > now() - interval '10 minutes';
    if n >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  select count(*) into n from public.quiz_scores where created_at > now() - interval '10 minutes';
  if n >= 60 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists quiz_scores_guard on public.quiz_scores;
create trigger quiz_scores_guard before insert on public.quiz_scores
  for each row execute function public.quiz_scores_guard();

-- ---------- секретное письмо ----------
create table if not exists public.letter_attempts (
  at timestamptz not null default now()
);
alter table public.letter_attempts enable row level security;
revoke all on public.letter_attempts from anon, authenticated;

create or replace function public.letter_norm(code text) returns text
language sql immutable set search_path = ''
as $$ select lower(regexp_replace(trim(coalesce(code, '')), '\s+', ' ', 'g')) $$;

create or replace function public.open_letter(code text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare n int; norm text; h text;
begin
  select count(*) into n from public.letter_attempts where at > now() - interval '1 minute';
  if n >= 20 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into public.letter_attempts default values;
  delete from public.letter_attempts where at < now() - interval '1 hour';
  norm := public.letter_norm(code);
  if norm = '' then return null; end if;
  h := encode(sha256(convert_to(norm, 'UTF8')), 'hex');
  if h = any(string_to_array(coalesce(public.setting('secret_letter_hashes'), ''), ',')) then
    return coalesce(public.setting('secret_letter_text'), '');
  end if;
  return null;
end $$;

create or replace function public.set_letter_codes(codes text[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare joined text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select string_agg(distinct encode(sha256(convert_to(public.letter_norm(c), 'UTF8')), 'hex'), ',')
    into joined
    from unnest(codes) as c
    where public.letter_norm(c) <> '';
  insert into public.site_texts (key, value) values ('secret_letter_hashes', coalesce(joined, ''))
  on conflict (key) do update set value = excluded.value;
  return coalesce(array_length(string_to_array(joined, ','), 1), 0);
end $$;

-- ---------- хранилище медиа ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'audio/aac', 'audio/wav',
  'video/mp4', 'video/webm', 'video/quicktime'
])
on conflict (id) do nothing;

create policy "admin uploads media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy "admin updates media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy "admin deletes media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- ---------- права на функции ----------
revoke all on function public.is_admin() from public;
revoke all on function public.setting(text) from public, anon, authenticated;
revoke all on function public.wishes_reveal_at() from public;
revoke all on function public.reviews_guard() from public, anon, authenticated;
revoke all on function public.quiz_scores_guard() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.like_review(uuid, text) from public;
revoke all on function public.like_counts() from public;
revoke all on function public.wishes_count() from public;
revoke all on function public.open_letter(text) from public;
revoke all on function public.set_letter_codes(text[]) from public, anon;
revoke all on function public.letter_norm(text) from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.wishes_reveal_at() to anon, authenticated;
grant execute on function public.like_review(uuid, text) to anon, authenticated;
grant execute on function public.like_counts() to anon, authenticated;
grant execute on function public.wishes_count() to anon, authenticated;
grant execute on function public.open_letter(text) to anon, authenticated;
grant execute on function public.set_letter_codes(text[]) to authenticated;

-- ---------- значения по умолчанию ----------
insert into public.site_texts (key, value) values
  ('auto_approve', 'false'),
  ('wishes_reveal_at', '2026-11-01T00:00:00+04:00'),
  ('letter_hint', 'Подсказка: то, что знаем только мы двое')
on conflict (key) do nothing;
