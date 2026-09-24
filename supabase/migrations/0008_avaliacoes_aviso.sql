-- Zonea — aviso por e-mail quando chega uma avaliação nova (ou quando uma é editada)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois da 0007_avaliacoes.sql.
--
-- Como funciona:
--   1. Uma avaliação nova (ou uma editada pela própria pessoa, que volta pra "pendente") dispara um
--      webhook do banco pra Edge Function "avisar-avaliacao".
--   2. A função lê a avaliação no banco, marca "notificado_em" ANTES de enviar e manda o e-mail pelo
--      Resend. Como só envia se notificado_em estiver vazio, cada avaliação gera no máximo UM e-mail —
--      mesmo que alguém descubra o endereço da função e fique chamando.
--   3. Aprovar, rejeitar ou responder pelo painel NÃO dispara e-mail (o status deixa de ser "pendente"
--      e a função de aviso só grava notificado_em, que também não dispara).
-- A função precisa estar publicada (ver docs/moderacao-avaliacoes.md) — sem ela, o webhook só falha em
-- silêncio e as avaliações continuam chegando normalmente ao painel.

alter table public.avaliacoes add column if not exists notificado_em timestamptz;

-- Quando a pessoa edita, a avaliação volta pra revisão E pode gerar um novo aviso: zera notificado_em.
-- (Mesma função da 0007, só com essa linha a mais.)
create or replace function public.avaliacoes_antes_de_alterar()
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
    new.notificado_em := null;
    new.nome := btrim(new.nome);
    new.profissao := nullif(btrim(coalesce(new.profissao, '')), '');
    new.comentario := btrim(new.comentario);
  end if;
  return new;
end;
$$;

-- O site nunca grava notificado_em: as permissões por coluna da 0007 (insert/update só de nota, nome,
-- profissao, comentario) já o deixam de fora — só a Edge Function (service_role) escreve nele.

-- O webhook. O schema supabase_functions existe nos projetos Supabase; se por algum motivo não existir,
-- o bloco avisa em vez de falhar, e você cria o webhook pelo painel (Database → Webhooks) apontando pra
-- mesma função.
do $$
begin
  drop trigger if exists avaliacoes_avisar on public.avaliacoes;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'supabase_functions' and p.proname = 'http_request'
  ) then
    create trigger avaliacoes_avisar
      after insert or update on public.avaliacoes
      for each row
      when (new.status = 'pendente' and new.notificado_em is null)
      execute function supabase_functions.http_request(
        'https://fkjmojbbxpilajehvpjy.supabase.co/functions/v1/avisar-avaliacao',
        'POST',
        '{"Content-Type":"application/json"}',
        '{}',
        '5000'
      );
  else
    raise notice 'supabase_functions.http_request não existe neste projeto: crie o webhook em Database > Webhooks (tabela avaliacoes, eventos Insert e Update, Supabase Edge Function avisar-avaliacao, método POST).';
  end if;
end;
$$;
