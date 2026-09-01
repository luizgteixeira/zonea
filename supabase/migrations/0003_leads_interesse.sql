-- Zonea — captura de interesse (visitante sem assinatura pede pra ser avisado)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001 e 0002.

create table public.leads_interesse (
  id uuid primary key default gen_random_uuid(),
  contato text not null,
  municipio_slug text,
  device_id text,
  criado_em timestamptz not null default now()
);

alter table public.leads_interesse enable row level security;
-- Sem nenhuma policy: ninguém no client (anon nem authenticated) lê ou escreve aqui,
-- só a service_role a partir da Edge Function submit-lead.
