create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Гость' check (char_length(name) between 1 and 60),
  text text not null check (char_length(text) between 5 and 600),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.reviews is 'Отзывы с сайта. Чтобы скрыть отзыв, поставьте hidden = true.';

alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (name, text) on public.reviews to anon, authenticated;

create policy "reviews are readable when not hidden"
  on public.reviews for select
  to anon, authenticated
  using (hidden = false);

create policy "anyone can add a review"
  on public.reviews for insert
  to anon, authenticated
  with check (hidden = false);

create index reviews_created_at_idx on public.reviews (created_at desc);
