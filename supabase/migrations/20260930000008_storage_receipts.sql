-- PayMind schema v1 — part 7: private `receipts` Storage bucket.
-- Objects live at receipts/<auth.uid()>/<file>. Only the owner can read / write / delete
-- them; nothing is public. Receipt images are stored only when privacy_settings.keep_receipts
-- is on (enforced by the ai-parse-bill Edge Function). Guarded so the migration also runs on
-- a bare Postgres without the Supabase storage schema (local pgTAP runs).

do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping receipts bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('receipts', 'receipts', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do nothing;

  execute $p$create policy receipts_select_own on storage.objects for select to authenticated
    using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy receipts_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy receipts_update_own on storage.objects for update to authenticated
    using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy receipts_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
end;
$$;
