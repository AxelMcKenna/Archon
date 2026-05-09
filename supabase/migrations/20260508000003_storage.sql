-- Storage buckets for RFI letters and per-item attachments.
-- Path layout: {user_id}/{project_id}/{letter_id|item_id}/{filename}

insert into storage.buckets (id, name, public)
values ('rfi-uploads', 'rfi-uploads', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- Owner-scoped: first path segment must equal auth.uid()
create policy "rfi_uploads_owner"
  on storage.objects for all to authenticated
  using (bucket_id = 'rfi-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'rfi-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "attachments_owner"
  on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exports_owner"
  on storage.objects for all to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
