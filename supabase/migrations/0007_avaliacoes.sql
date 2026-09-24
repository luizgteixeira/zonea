-- Zonea — avaliações dos usuários (prova social)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001 a 0006.
--
-- Como funciona:
--   * Só quem usou a Ferramenta de Poligonal (ou é assinante) consegue avaliar — isso é checado AQUI,
--     no banco, e não só no site. É o que dá credibilidade: toda avaliação é de quem realmente usou.
--   * Uma avaliação por conta. A pessoa pode editar ou apagar a sua; editar volta pra "pendente".
--   * TODA avaliação entra como "pendente" e só aparece no site depois de você aprovar
--     (Table Editor > avaliacoes > coluna status = aprovada). Você também pode escrever a coluna
--     "resposta" — ela aparece publicamente como "Resposta do Zonea".
--   * O público lê só a vista avaliacoes_publicas, que NÃO mostra e-mail nem id de usuário.

-- ============================================================
-- 1. TABELA
-- ============================================================
create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  nome text not null check (char_length(btrim(nome)) between 2 and 40),
  profissao text check (profissao is null or char_length(btrim(profissao)) <= 40),
  comentario text not null check (char_length(btrim(comentario)) between 10 and 600),
  verificado boolean not null default false,   -- usou a Poligonal (definido pelo banco, nunca pelo site)
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  resposta text check (resposta is null or char_length(btrim(resposta)) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index avaliacoes_status_criada_idx on public.avaliacoes (status, created_at desc);

alter table public.avaliacoes enable row level security;

-- ============================================================
-- 2. REGRAS DE NEGÓCIO (triggers)
-- ============================================================
-- Antes de gravar uma avaliação nova: confere se a conta usou a Poligonal (ou assina), limpa os
-- textos e força os campos que só o Zonea controla (status, resposta, verificado).
create function public.avaliacoes_antes_de_inserir()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  perfil record;
begin
  select poligonais_gratis_usadas, subscription_status into perfil
    from public.profiles where id = new.user_id;

  if perfil is null
     or (coalesce(perfil.poligonais_gratis_usadas, 0) = 0 and perfil.subscription_status <> 'active') then
    raise exception 'nao_elegivel: use a Ferramenta de Poligonal antes de avaliar'
      using errcode = 'P0001';
  end if;

  new.nome := btrim(new.nome);
  new.profissao := nullif(btrim(coalesce(new.profissao, '')), '');
  new.comentario := btrim(new.comentario);
  new.verificado := true;
  new.status := 'pendente';
  new.resposta := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger avaliacoes_antes_de_inserir
  before insert on public.avaliacoes
  for each row execute procedure public.avaliacoes_antes_de_inserir();

-- Antes de alterar: quem edita pelo site (tem auth.uid()) só muda o conteúdo — qualquer edição volta
-- a avaliação pra "pendente", e status/resposta/verificado ficam como estavam. Quem edita pelo painel
-- do Supabase (sem auth.uid()) pode aprovar, rejeitar e responder livremente.
create function public.avaliacoes_antes_de_alterar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.verificado := old.verificado;
    new.resposta := old.resposta;
    new.status := 'pendente';
    new.nome := btrim(new.nome);
    new.profissao := nullif(btrim(coalesce(new.profissao, '')), '');
    new.comentario := btrim(new.comentario);
  end if;
  return new;
end;
$$;

create trigger avaliacoes_antes_de_alterar
  before update on public.avaliacoes
  for each row execute procedure public.avaliacoes_antes_de_alterar();

-- ============================================================
-- 3. PERMISSÕES
-- ============================================================
-- A tabela em si só é acessada pelo dono da avaliação (RLS) — o público lê pela vista abaixo.
revoke all on public.avaliacoes from anon, authenticated;
grant select, delete on public.avaliacoes to authenticated;
grant insert (user_id, nota, nome, profissao, comentario) on public.avaliacoes to authenticated;
grant update (nota, nome, profissao, comentario) on public.avaliacoes to authenticated;

create policy "dono le a propria avaliacao"
  on public.avaliacoes for select to authenticated
  using (auth.uid() = user_id);

create policy "dono cria a propria avaliacao"
  on public.avaliacoes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "dono edita a propria avaliacao"
  on public.avaliacoes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dono apaga a propria avaliacao"
  on public.avaliacoes for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 4. LEITURA PÚBLICA (só aprovadas, sem dados pessoais)
-- ============================================================
-- Vistas rodam com as permissões do dono (postgres), por isso enxergam as linhas mesmo com RLS ligado;
-- o filtro status = 'aprovada' e a lista de colunas é que protegem os dados.
create view public.avaliacoes_publicas as
  select id, nome, profissao, nota, comentario, resposta, verificado, created_at
  from public.avaliacoes
  where status = 'aprovada';

create view public.avaliacoes_resumo as
  select count(*)::int as total, coalesce(round(avg(nota)::numeric, 1), 0)::float8 as media
  from public.avaliacoes
  where status = 'aprovada';

revoke all on public.avaliacoes_publicas, public.avaliacoes_resumo from anon, authenticated;
grant select on public.avaliacoes_publicas, public.avaliacoes_resumo to anon, authenticated;
