-- Zonea — schema inicial do paywall (Supabase)
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase (Dashboard → SQL Editor → New query → Run).

-- ============================================================
-- 1. PROFILES — perfil/assinante, 1:1 com auth.users
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'active', 'canceled', 'past_due')),
  plan text,
  subscription_expires_at timestamptz,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "usuario le o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- Nenhuma policy de insert/update/delete para authenticated/anon:
-- só a service_role (Edge Functions) escreve nesta tabela.

-- Cria automaticamente uma linha em profiles sempre que um usuário se cadastra
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. MUNICIPIOS_PROTEGIDO — dados sensíveis por município
-- ============================================================
create table public.municipios_protegido (
  slug text primary key,
  nome text not null,
  link text,
  sistema text,
  detalhes_tecnicos text,
  sistema_referencia text,
  indisponivel boolean not null default false,
  indisponivel_desde text,
  updated_at timestamptz not null default now()
);

alter table public.municipios_protegido enable row level security;

create policy "somente assinante ativo le dados protegidos"
  on public.municipios_protegido for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.subscription_status = 'active'
        and (p.subscription_expires_at is null or p.subscription_expires_at > now())
    )
  );

-- Nenhuma policy de insert/update/delete para authenticated/anon:
-- escrita só via service_role (script de migração e, depois, correções manuais).

-- ============================================================
-- 3. MP_WEBHOOK_EVENTS — auditoria e idempotência do webhook do Mercado Pago
-- ============================================================
create table public.mp_webhook_events (
  id bigint generated always as identity primary key,
  mp_event_id text unique,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.mp_webhook_events enable row level security;
-- Sem nenhuma policy: ninguém no client (anon nem authenticated) lê ou escreve aqui,
-- só a service_role a partir da Edge Function mp-webhook.
