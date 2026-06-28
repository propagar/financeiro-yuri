-- Estrutura de anexos financeiros vinculados aos lançamentos.
-- Os arquivos ficam no Supabase Storage e os metadados nesta tabela.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-attachments',
  'financial-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  bucket_id text not null default 'financial-attachments',
  storage_path text not null,
  file_name text not null,
  content_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  constraint transaction_attachments_storage_path_key unique (bucket_id, storage_path),
  constraint transaction_attachments_bucket_check check (bucket_id = 'financial-attachments'),
  constraint transaction_attachments_file_size_check check (file_size is null or file_size >= 0)
);

create index if not exists transaction_attachments_transaction_id_idx
  on public.transaction_attachments(transaction_id);

create index if not exists transaction_attachments_profile_id_idx
  on public.transaction_attachments(profile_id);

alter table public.transaction_attachments enable row level security;

create policy "Users can manage attachments for their profiles"
  on public.transaction_attachments
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = transaction_attachments.profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = transaction_attachments.profile_id
        and p.user_id = auth.uid()
    )
  );

create policy "Users can upload financial attachments"
  on storage.objects
  for insert
  with check (
    bucket_id = 'financial-attachments'
    and exists (
      select 1
      from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

create policy "Users can read financial attachments"
  on storage.objects
  for select
  using (
    bucket_id = 'financial-attachments'
    and exists (
      select 1
      from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

create policy "Users can delete financial attachments"
  on storage.objects
  for delete
  using (
    bucket_id = 'financial-attachments'
    and exists (
      select 1
      from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );
