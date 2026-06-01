-- Link an attachment to the consent requirement it satisfies, so the
-- requirements checklist can show "evidence attached" against each item.

alter table public.attachments
  add column if not exists linked_requirement_key text,
  add column if not exists linked_requirement_label text,
  add column if not exists linked_requirement_source text;
