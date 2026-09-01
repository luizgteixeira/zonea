// Zonea — recebe a notificação de pagamento do Mercado Pago e ativa a assinatura.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "mp-webhook" e cole este arquivo em index.ts. A URL pública
// dela (https://SEU-PROJETO.supabase.co/functions/v1/mp-webhook) já é enviada automaticamente
// ao Mercado Pago como notification_url pela função create-mp-preference — não precisa
// configurar nada manualmente no painel do Mercado Pago.
//
// Secret necessário (Edge Functions → Secrets): MP_ACCESS_TOKEN
// auth: "none" porque quem chama isso é o servidor do Mercado Pago, não um usuário logado
// no Zonea — ctx.supabaseAdmin dá acesso com bypass de RLS pra gente mesmo poder gravar o resultado.

import { withSupabase } from "jsr:@supabase/server@^1";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const DIAS_DE_ACESSO = 30;

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    try {
      const url = new URL(req.url);
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        // Algumas notificações do Mercado Pago vêm só na querystring, sem corpo — ok ignorar.
      }

      const data = body?.data as { id?: string } | undefined;
      const paymentId = data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
      const type = (body?.type as string | undefined) ?? (body?.topic as string | undefined)
        ?? url.searchParams.get("type") ?? url.searchParams.get("topic");

      // Só processamos notificações de pagamento; outros tipos (merchant_order etc.) são ignorados.
      if (type !== "payment" || !paymentId) {
        return new Response("ignored", { status: 200 });
      }

      // Idempotência: se esse pagamento já foi processado, não faz nada de novo.
      const { data: existing } = await ctx.supabaseAdmin
        .from("mp_webhook_events")
        .select("id")
        .eq("mp_event_id", String(paymentId))
        .maybeSingle();
      if (existing) {
        return new Response("already processed", { status: 200 });
      }

      // Nunca confia no payload recebido — confirma o status real na API do Mercado Pago.
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      if (!mpRes.ok) {
        console.error("Falha ao consultar pagamento no Mercado Pago:", await mpRes.text());
        return new Response("mp fetch failed", { status: 200 });
      }
      const payment = await mpRes.json();

      await ctx.supabaseAdmin.from("mp_webhook_events").insert({
        mp_event_id: String(paymentId),
        payload: payment,
      });

      if (payment.status === "approved" && payment.external_reference) {
        const expiresAt = new Date(Date.now() + DIAS_DE_ACESSO * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await ctx.supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: "active",
            subscription_expires_at: expiresAt,
            mp_payment_id: String(paymentId),
            plan: "mensal",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.external_reference);
        if (error) console.error("Falha ao ativar assinatura:", error);
      }

      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error(err);
      // Responde 200 mesmo em erro nosso (o erro já foi logado acima) para evitar que o
      // Mercado Pago reenvie a notificação indefinidamente por causa de um bug nosso.
      return new Response("error logged", { status: 200 });
    }
  }),
};
