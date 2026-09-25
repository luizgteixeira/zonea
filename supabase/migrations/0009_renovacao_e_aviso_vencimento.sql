-- Zonea — renovação que SOMA os dias + aviso por e-mail antes do vencimento da assinatura
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001 a 0008.
--
-- O que muda:
--   1. renovar_assinatura(): quem renova ANTES do fim não perde os dias que sobravam. O webhook do
--      Mercado Pago passa a chamar esta função em vez de gravar "hoje + 30 dias" por cima. É uma única
--      instrução no banco, então dois pagamentos ao mesmo tempo também não se atropelam.
--   2. Aviso de vencimento: uma tarefa diária chama a Edge Function "avisar-vencimento", que manda um
--      e-mail (Resend) a quem tem a assinatura acabando em até 3 dias. Cada pessoa recebe UM aviso por
--      período de assinatura: a marca fica em profiles.aviso_vencimento_para, e quando ela renova a
--      validade muda, então o próximo período volta a poder avisar.
--
-- As poligonais grátis continuam sendo 2 por conta, pra sempre (nada aqui as zera).

-- ============================================================
-- 1. RENOVAÇÃO QUE SOMA
-- ============================================================
-- Nova validade = (a maior entre AGORA e a validade atual, se a assinatura ainda vale) + p_dias.
--   * sem assinatura, ou já vencida  -> agora + 30 dias
--   * ainda valendo, com 10 dias     -> validade atual + 30 dias (os 10 dias não se perdem)
-- Devolve a nova validade, ou NULL se o usuário não existe.
-- (Assinatura "ativa" com validade vazia só existe se alguém ativou à mão, sem prazo: aqui ela recebe
-- agora + 30 dias, como qualquer outra.)
create or replace function public.renovar_assinatura(p_user_id uuid, p_dias integer, p_payment_id text)
returns timestamptz
language sql
security definer set search_path = public
as $$
  update public.profiles
     set subscription_status = 'active',
         subscription_expires_at =
           greatest(
             now(),
             case when subscription_status = 'active' then coalesce(subscription_expires_at, now()) else now() end
           ) + make_interval(days => p_dias),
         mp_payment_id = p_payment_id,
         plan = 'mensal',
         updated_at = now()
   where id = p_user_id
  returning subscription_expires_at;
$$;

revoke all on function public.renovar_assinatura(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.renovar_assinatura(uuid, integer, text) to service_role;

-- ============================================================
-- 2. AVISO DE VENCIMENTO
-- ============================================================
alter table public.profiles add column if not exists aviso_vencimento_para timestamptz;
-- (profiles não tem policy de update pro usuário: só a service_role escreve nesta coluna.)

-- Quem precisa receber o aviso agora: assinatura ativa que vence nos próximos p_dias dias e ainda não
-- foi avisada PARA ESSA validade. No máximo 200 por rodada, pra uma rodada nunca virar uma enxurrada.
create or replace function public.usuarios_para_avisar_vencimento(p_dias integer)
returns table (id uuid, email text, expira timestamptz)
language sql
security definer set search_path = public
as $$
  select p.id, p.email, p.subscription_expires_at
    from public.profiles p
   where p.subscription_status = 'active'
     and p.subscription_expires_at > now()
     and p.subscription_expires_at <= now() + make_interval(days => p_dias)
     and p.aviso_vencimento_para is distinct from p.subscription_expires_at
   order by p.subscription_expires_at
   limit 200;
$$;

-- Reserva o aviso ANTES de enviar: devolve true pra quem conseguiu (só uma chamada consegue, mesmo
-- se duas rodadas rodarem juntas). Só vale se a validade ainda é a que a função viu.
create or replace function public.reservar_aviso_vencimento(p_user_id uuid, p_expira timestamptz)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  linhas integer;
begin
  update public.profiles
     set aviso_vencimento_para = p_expira
   where id = p_user_id
     and subscription_expires_at = p_expira
     and aviso_vencimento_para is distinct from p_expira;
  get diagnostics linhas = row_count;
  return linhas = 1;
end;
$$;

-- Se o envio falhar, devolve a reserva pra a próxima rodada tentar de novo (só a de agora).
create or replace function public.liberar_aviso_vencimento(p_user_id uuid, p_expira timestamptz)
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles
     set aviso_vencimento_para = null
   where id = p_user_id and aviso_vencimento_para = p_expira;
$$;

revoke all on function public.usuarios_para_avisar_vencimento(integer) from public, anon, authenticated;
revoke all on function public.reservar_aviso_vencimento(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.liberar_aviso_vencimento(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.usuarios_para_avisar_vencimento(integer) to service_role;
grant execute on function public.reservar_aviso_vencimento(uuid, timestamptz) to service_role;
grant execute on function public.liberar_aviso_vencimento(uuid, timestamptz) to service_role;

-- ============================================================
-- 3. A TAREFA DIÁRIA (pg_cron chama a Edge Function todo dia às 12:00 UTC = 9h em Brasília)
-- ============================================================
-- Precisa das extensões pg_cron e pg_net. Se não estiverem disponíveis, o bloco só avisa (não falha) e
-- você cria a tarefa pelo painel: Integrations → Cron → Create job, tipo "Supabase Edge Function",
-- função avisar-vencimento, método POST, agenda 0 12 * * *.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    begin
      perform cron.unschedule('avisar-vencimento-diario');   -- refaz sem duplicar se rodar de novo
    exception when others then
      null;                                                  -- ainda não existia
    end;
    perform cron.schedule(
      'avisar-vencimento-diario',
      '0 12 * * *',
      $cron$
        select net.http_post(
          url := 'https://fkjmojbbxpilajehvpjy.supabase.co/functions/v1/avisar-vencimento',
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  else
    raise notice 'pg_cron e/ou pg_net indisponíveis neste projeto: crie a tarefa pelo painel (Integrations > Cron > Create job, Supabase Edge Function avisar-vencimento, POST, agenda 0 12 * * *).';
  end if;
exception when others then
  raise notice 'Não foi possível agendar a tarefa automaticamente (%): crie pelo painel (Integrations > Cron).', sqlerrm;
end;
$$;
