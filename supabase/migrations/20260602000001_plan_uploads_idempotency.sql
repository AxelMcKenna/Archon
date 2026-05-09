-- Content-hash idempotency for plan_uploads.
--
-- Same file (sha256), same analyser version + prompt + provider + model
-- ⇒ existing analysed row should be reused. The partial index makes the
-- cache lookup an index-only scan.

alter table public.plan_uploads
  add column if not exists content_hash text,
  add column if not exists provider     text,
  add column if not exists model_id     text;

create index if not exists plan_uploads_cache_lookup_idx
  on public.plan_uploads (content_hash, analyser_version, prompt_version, provider, model_id)
  where status = 'analysed';
