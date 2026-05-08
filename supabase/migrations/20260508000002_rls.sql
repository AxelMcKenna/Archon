-- Row-Level Security: every user-scoped table is locked to the owning user.
-- Global tables (rules_versions, prompt_versions, bca_corpus) are readable by
-- authenticated users but writable only by service_role.

alter table projects enable row level security;
alter table rfi_letters enable row level security;
alter table rfi_items enable row level security;
alter table rfi_extractions enable row level security;
alter table classifications enable row level security;
alter table reconciliation_log enable row level security;
alter table responses enable row level security;
alter table attachments enable row level security;
alter table audit_log enable row level security;
alter table bca_corpus enable row level security;
alter table rules_versions enable row level security;
alter table prompt_versions enable row level security;

-- ── projects: owner-only ──────────────────────────────────────────────
create policy projects_owner_select on projects
  for select using (user_id = auth.uid());
create policy projects_owner_insert on projects
  for insert with check (user_id = auth.uid());
create policy projects_owner_update on projects
  for update using (user_id = auth.uid());
create policy projects_owner_delete on projects
  for delete using (user_id = auth.uid());

-- ── rfi_letters: scoped via parent project ───────────────────────────
create policy rfi_letters_owner on rfi_letters
  for all using (
    exists (select 1 from projects p where p.id = rfi_letters.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = rfi_letters.project_id and p.user_id = auth.uid())
  );

-- ── rfi_items ────────────────────────────────────────────────────────
create policy rfi_items_owner on rfi_items
  for all using (
    exists (
      select 1 from rfi_letters l
      join projects p on p.id = l.project_id
      where l.id = rfi_items.rfi_letter_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from rfi_letters l
      join projects p on p.id = l.project_id
      where l.id = rfi_items.rfi_letter_id and p.user_id = auth.uid()
    )
  );

-- ── rfi_extractions ──────────────────────────────────────────────────
create policy rfi_extractions_owner on rfi_extractions
  for all using (
    exists (
      select 1 from rfi_letters l
      join projects p on p.id = l.project_id
      where l.id = rfi_extractions.rfi_letter_id and p.user_id = auth.uid()
    )
  );

-- ── classifications ──────────────────────────────────────────────────
create policy classifications_owner on classifications
  for all using (
    exists (
      select 1 from rfi_items i
      join rfi_letters l on l.id = i.rfi_letter_id
      join projects p on p.id = l.project_id
      where i.id = classifications.rfi_item_id and p.user_id = auth.uid()
    )
  );

-- ── reconciliation_log ───────────────────────────────────────────────
create policy reconciliation_log_owner on reconciliation_log
  for all using (
    exists (
      select 1 from rfi_items i
      join rfi_letters l on l.id = i.rfi_letter_id
      join projects p on p.id = l.project_id
      where i.id = reconciliation_log.rfi_item_id and p.user_id = auth.uid()
    )
  );

-- ── responses ────────────────────────────────────────────────────────
create policy responses_owner on responses
  for all using (
    exists (
      select 1 from rfi_items i
      join rfi_letters l on l.id = i.rfi_letter_id
      join projects p on p.id = l.project_id
      where i.id = responses.rfi_item_id and p.user_id = auth.uid()
    )
  );

-- ── attachments ──────────────────────────────────────────────────────
create policy attachments_owner on attachments
  for all using (
    (project_id is not null and exists (select 1 from projects p where p.id = attachments.project_id and p.user_id = auth.uid()))
    or
    (rfi_item_id is not null and exists (
      select 1 from rfi_items i
      join rfi_letters l on l.id = i.rfi_letter_id
      join projects p on p.id = l.project_id
      where i.id = attachments.rfi_item_id and p.user_id = auth.uid()
    ))
  );

-- ── audit_log: owner read ────────────────────────────────────────────
create policy audit_log_owner_select on audit_log
  for select using (user_id = auth.uid());

-- ── global reference tables: read-only for authenticated users ───────
create policy bca_corpus_read on bca_corpus
  for select using (auth.role() = 'authenticated');
create policy rules_versions_read on rules_versions
  for select using (auth.role() = 'authenticated');
create policy prompt_versions_read on prompt_versions
  for select using (auth.role() = 'authenticated');
