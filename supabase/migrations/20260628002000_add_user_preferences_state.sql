-- Adiciona o campo de Estado (UF) ao endereço salvo nas preferências do usuário.
alter table public.user_preferences
  add column if not exists state text;
