-- ============================================================
-- OPENPLATE — photos for meals and favorites 
--
-- * meals.image_url / favorites.image_url: a link to the photo shown on the
--   cards. Either a photo uploaded in the app (Supabase Storage, below) or any
--   direct image link pasted there. AI agents don't set photos.
-- * meal-photos bucket: public to read (the links go straight into <img>),
--   only signed-in members can upload, replace or delete.
--
-- Run before the agent-write migration. Safe to re-run.
-- ============================================================

alter table public.meals add column if not exists image_url text;
alter table public.favorites add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Created only if missing, so re-running never drops anything.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members upload meal photos') then
    create policy "Members upload meal photos" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'meal-photos' and (select public.meals_user_has_access()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members update meal photos') then
    create policy "Members update meal photos" on storage.objects
      for update to authenticated
      using (bucket_id = 'meal-photos' and (select public.meals_user_has_access()))
      with check (bucket_id = 'meal-photos' and (select public.meals_user_has_access()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members delete meal photos') then
    create policy "Members delete meal photos" on storage.objects
      for delete to authenticated
      using (bucket_id = 'meal-photos' and (select public.meals_user_has_access()));
  end if;
end
$$;
