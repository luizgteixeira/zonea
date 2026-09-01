-- Zonea — consulta gratuita (1 município confirmado por visitante anônimo)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001_init.sql.

create table public.anon_preview_usado (
  device_id uuid primary key,
  slug_usado text not null,
  used_at timestamptz not null default now()
);

alter table public.anon_preview_usado enable row level security;
-- Sem nenhuma policy: ninguém no client (anon nem authenticated) lê ou escreve aqui,
-- só a service_role a partir da Edge Function get-preview-municipio.
