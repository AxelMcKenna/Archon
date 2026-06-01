-- Per-run audit log for the ArchiPro crawler (counts + timing per invocation).
create table if not exists public.archipro_crawl_runs (
    id           bigint generated always as identity primary key,
    started_at   timestamptz not null default now(),
    finished_at  timestamptz,
    discovered   integer not null default 0,
    fetched      integer not null default 0,
    skipped      integer not null default 0,
    upserted     integer not null default 0,
    priced       integer not null default 0,
    errors       integer not null default 0,
    notes        text
);

alter table public.archipro_crawl_runs enable row level security;

drop policy if exists archipro_crawl_runs_read on public.archipro_crawl_runs;
create policy archipro_crawl_runs_read on public.archipro_crawl_runs
    for select to authenticated using (true);
