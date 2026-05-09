insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('rfi-uploads', 'rfi-uploads', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;
