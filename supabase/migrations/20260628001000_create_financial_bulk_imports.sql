-- Sessões de importação em massa de extratos/arquivos financeiros.

alter table public.transaction_attachments
  drop constraint if exists transaction_attachments_source_kind_check,
  add constraint transaction_attachments_source_kind_check check (source_kind in ('attachment', 'document_origin', 'bulk_import_origin'));

create table if not exists public.financial_import_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source_label text not null default 'Importar lançamentos em massa',
  status text not null default 'draft',
  imported_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_import_sessions_status_check check (status in ('draft', 'reviewed', 'imported', 'failed', 'cancelled')),
  constraint financial_import_sessions_imported_count_check check (imported_count >= 0)
);

create table if not exists public.financial_import_files (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null references public.financial_import_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  bucket_id text not null default 'financial-attachments',
  storage_path text not null,
  file_name text not null,
  content_type text,
  file_size bigint,
  file_kind text not null,
  read_status text not null default 'pending',
  read_message text,
  created_at timestamptz not null default now(),
  constraint financial_import_files_storage_path_key unique (bucket_id, storage_path),
  constraint financial_import_files_bucket_check check (bucket_id = 'financial-attachments'),
  constraint financial_import_files_file_size_check check (file_size is null or file_size >= 0),
  constraint financial_import_files_file_kind_check check (file_kind in ('csv', 'ofx', 'pdf', 'spreadsheet', 'unknown'))
);

create table if not exists public.financial_import_items (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null references public.financial_import_sessions(id) on delete cascade,
  import_file_id uuid references public.financial_import_files(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ready',
  occurred_on date,
  description text,
  amount numeric(14,2),
  kind text,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  payment_method text,
  source_type text,
  source_file_name text,
  external_id text,
  notes text,
  created_transaction_id uuid,
  error_message text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint financial_import_items_status_check check (status in ('ready', 'incomplete', 'possible_duplicate', 'error', 'ignored', 'imported')),
  constraint financial_import_items_kind_check check (kind is null or kind in ('despesa', 'receita'))
);

alter table public.transactions
  add column if not exists import_session_id uuid references public.financial_import_sessions(id) on delete set null,
  add column if not exists import_item_id uuid references public.financial_import_items(id) on delete set null;

create index if not exists financial_import_sessions_profile_id_idx on public.financial_import_sessions(profile_id);
create index if not exists financial_import_files_session_id_idx on public.financial_import_files(import_session_id);
create index if not exists financial_import_items_session_id_idx on public.financial_import_items(import_session_id);
create index if not exists transactions_import_session_id_idx on public.transactions(import_session_id);

alter table public.financial_import_sessions enable row level security;
alter table public.financial_import_files enable row level security;
alter table public.financial_import_items enable row level security;

create policy "Users can manage import sessions for their profiles" on public.financial_import_sessions for all using (exists (select 1 from public.profiles p where p.id = financial_import_sessions.profile_id and p.user_id = auth.uid())) with check (exists (select 1 from public.profiles p where p.id = financial_import_sessions.profile_id and p.user_id = auth.uid()));
create policy "Users can manage import files for their profiles" on public.financial_import_files for all using (exists (select 1 from public.profiles p where p.id = financial_import_files.profile_id and p.user_id = auth.uid())) with check (exists (select 1 from public.profiles p where p.id = financial_import_files.profile_id and p.user_id = auth.uid()));
create policy "Users can manage import items for their profiles" on public.financial_import_items for all using (exists (select 1 from public.profiles p where p.id = financial_import_items.profile_id and p.user_id = auth.uid())) with check (exists (select 1 from public.profiles p where p.id = financial_import_items.profile_id and p.user_id = auth.uid()));
