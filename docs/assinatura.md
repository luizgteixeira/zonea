# Como funciona a assinatura (R$ 9,90 por 30 dias)

## Regras (o que o cliente vive)

* **2 poligonais grátis por conta, uma vez só.** O contador (`profiles.poligonais_gratis_usadas`) nunca é zerado. Nada
  devolve créditos: nem o fim de uma assinatura, nem o passar do tempo.
* **Assinar** = pagar R$ 9,90 (Pix, boleto ou cartão, pelo Mercado Pago) e ter **30 dias** de poligonais ilimitadas.
  Durante a assinatura os cálculos **não gastam** os créditos grátis.
* **Não renova sozinho.** Passados os 30 dias, o site bloqueia o cálculo. A pessoa volta a ter só as poligonais grátis
  que **ainda restarem** (quem gastou as 2 antes de assinar volta com 0, quem assinou com 1 gasta volta com 1).
* **Renovar antes do fim soma os dias.** Quem tem 10 dias sobrando e paga de novo passa a ter 40, e não 30. O botão da
  conta vira "Renovar por mais 30 dias" enquanto a assinatura está ativa.
* **Aviso por e-mail 3 dias antes de acabar**, uma vez por período de assinatura, com o botão para renovar.
* **Nada fica guardado:** as poligonais não são salvas no servidor. Depois de vencer, para mexer numa poligonal antiga a
  pessoa precisa assinar de novo e refazer.

## Como o bloqueio acontece (sem nenhuma tarefa agendada)

Quem decide é a Edge Function `usar-poligonal`, a cada tentativa de calcular: a assinatura vale se
`subscription_status = 'active'` **e** `subscription_expires_at` está no futuro. O status escrito no banco continua "active"
depois de vencer; o que manda é a data. A tela (`getAssinaturaAtiva`) usa a mesma regra.

## Como a validade é gravada

O webhook do Mercado Pago (`mp-webhook`), quando um pagamento é **aprovado**, chama a função SQL `renovar_assinatura`
(migração 0009):

| Situação antes do pagamento | Nova validade |
|---|---|
| Nunca assinou, cancelada ou inativa | agora + 30 dias |
| Ativa e vencida | agora + 30 dias (os dias perdidos não voltam) |
| Ativa com 10 dias sobrando | validade atual + 30 dias (40 dias a partir de hoje) |
| Dois pagamentos seguidos | soma os dois (a conta é uma instrução só no banco, então não se atropelam) |

Se essa função falhar (por exemplo, a migração 0009 ainda não foi rodada), o webhook usa um **plano B**: ativa por
agora + 30 dias. Assim, quem pagou nunca fica sem acesso. **Rode a 0009 antes de republicar o `mp-webhook`.**

## O aviso de vencimento

Todo dia às **12:00 UTC (9h em Brasília)**, uma tarefa do banco (pg_cron) chama a Edge Function `avisar-vencimento`.

1. O banco lista quem tem assinatura ativa vencendo em até **3 dias** e ainda não foi avisado **para aquela validade**
   (`usuarios_para_avisar_vencimento`; no máximo 200 por rodada).
2. Para cada pessoa, a função **reserva** o aviso no banco (`reservar_aviso_vencimento`) **antes** de enviar. Só uma
   chamada consegue reservar, então cada pessoa recebe **um** e-mail por período, mesmo se duas rodadas coincidirem.
3. Envia pelo Resend, só para o e-mail da própria conta.
4. Se o Resend falhar, **devolve a reserva** (`liberar_aviso_vencimento`), e a rodada do dia seguinte tenta de novo (ainda
   dentro dos 3 dias).
5. Quem renova ganha uma validade nova, então no fim do período seguinte volta a receber o aviso.

Como não recebe nada de fora, a função é segura: chamá-la várias vezes, ou de fora, só repete o que já foi feito.

## Colocar no ar (uma vez só, nesta ordem)

1. **SQL Editor:** rodar `supabase/migrations/0009_renovacao_e_aviso_vencimento.sql`. Ela pode ser rodada de novo sem
   problema. Se aparecer o aviso de que `pg_cron` ou `pg_net` estão indisponíveis, crie a tarefa pelo painel:
   **Integrations → Cron → Create job**, tipo Supabase Edge Function, função `avisar-vencimento`, método POST, agenda
   `0 12 * * *`. (O `pg_net` já foi instalado ao ativar os Database Webhooks.)
2. **Edge Functions:** publicar `avisar-vencimento` (cole `supabase/functions/avisar-vencimento/index.ts`, nome exato, e
   **desligue "Verify JWT"**). O secret `RESEND_API_KEY` já existe (é o mesmo do aviso de avaliações).
3. **Edge Functions:** republicar `mp-webhook` com o `index.ts` atualizado (**Verify JWT continua desligado**).

## Como testar

**Somar dias** (SQL Editor, com uma conta de teste; pegue o `id` em Authentication → Users):
```sql
update public.profiles set subscription_status='active', subscription_expires_at = now() + interval '10 days' where id = 'ID-DA-CONTA-DE-TESTE';
select public.renovar_assinatura('ID-DA-CONTA-DE-TESTE', 30, 'teste');   -- deve devolver ~40 dias a partir de hoje
```

**Aviso de vencimento** (troque pelo e-mail da sua conta de teste):
```sql
update public.profiles
set subscription_status='active', subscription_expires_at = now() + interval '2 days', aviso_vencimento_para = null
where email = 'SEU-EMAIL-DE-TESTE';

select net.http_post(
  url := 'https://fkjmojbbxpilajehvpjy.supabase.co/functions/v1/avisar-vencimento',
  headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
```
O e-mail deve chegar em segundos ("Sua assinatura do Zonea termina em 2 dias"). Para ver a resposta da função:
```sql
select status_code, left(content, 300) as resposta, created from net._http_response order by created desc limit 3;
```
**Depois do teste, desfaça** (senão a conta de teste fica assinante):
```sql
update public.profiles set subscription_status='inactive', subscription_expires_at = null, aviso_vencimento_para = null
where email = 'SEU-EMAIL-DE-TESTE';
```

## Se algo der errado

* **Nenhum aviso chegou:** rode a consulta de `net._http_response` acima. 404 = função não publicada com esse nome;
  401 = "Verify JWT" ligado; 200 = a função rodou (veja os logs dela: falta de `RESEND_API_KEY` ou o Resend recusando).
* **Confirmar que a tarefa diária existe:** `select jobname, schedule from cron.job;` deve listar `avisar-vencimento-diario`.
* **Um cliente pagou e não ativou:** veja `mp_webhook_events` e os logs do `mp-webhook`; se preciso, ative à mão com
  `select public.renovar_assinatura('ID', 30, 'manual');`.

## Onde o preço aparece (mude tudo junto)

O valor (R$ 9,90) e a validade (30 dias) estão em: `create-mp-preference` (`PRECO_ASSINATURA`, `DIAS_DE_ACESSO`),
`mp-webhook` (`DIAS_DE_ACESSO`), o botão em `conta.html` e em `js/auth.js` (os rótulos "Assinar agora" e "Renovar"), o
texto da FAQ (HTML e dados estruturados) e a página `desenhar-poligonal.html`. O e-mail de aviso de vencimento não cita o
valor de propósito, para não ser mais um lugar a manter.
