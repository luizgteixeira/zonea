// Zonea — cria uma preference de pagamento (Checkout Pro) para o usuário autenticado.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "create-mp-preference" e cole este arquivo em index.ts.
//
// Secret necessário (Edge Functions → Secrets): MP_ACCESS_TOKEN
// withSupabase cuida de CORS, preflight (OPTIONS) e validação do usuário automaticamente.

import { withSupabase } from "jsr:@supabase/server@^1";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// R$ — 30 dias de acesso. Ajuste aqui quando decidir outro valor ou plano.
const PRECO_ASSINATURA = 40.0;
const DIAS_DE_ACESSO = 30;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // ctx.supabase já está autenticado como o usuário que chamou a função.
    const { data: { user }, error } = await ctx.supabase.auth.getUser();
    if (error || !user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    // back_urls dinâmico a partir de onde a chamada veio — funciona local e em produção
    // sem precisar fixar um domínio no código.
    const origin = req.headers.get("origin") || "";
    const baseUrl = origin.replace(/\/$/, "");
    // O Mercado Pago exige que back_urls (com auto_return) sejam HTTPS e públicas — em teste
    // local (http://127.0.0.1:... ou http://localhost:...) isso não é atendido, então
    // simplesmente omitimos back_urls/auto_return nesse caso (o comprador só não é
    // redirecionado automaticamente de volta ao site após pagar; tudo o mais funciona igual).
    const baseUrlEhPublica = /^https:\/\//.test(baseUrl);

    const preference: Record<string, unknown> = {
      items: [
        {
          title: `Assinatura Zonea — ${DIAS_DE_ACESSO} dias de acesso`,
          quantity: 1,
          unit_price: PRECO_ASSINATURA,
          currency_id: "BRL",
        },
      ],
      // external_reference é como o mp-webhook sabe qual usuário ativar quando o pagamento for aprovado.
      // Não preenchemos "payer" de propósito: o Mercado Pago já pede login/e-mail do comprador
      // no próprio checkout, e forçar aqui o e-mail da conta Zonea pode colidir com o e-mail
      // cadastrado como vendedor na aplicação (erro PA_UNAUTHORIZED_RESULT_FROM_POLICIES).
      external_reference: user.id,
      notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
    };

    if (baseUrlEhPublica) {
      preference.back_urls = {
        success: `${baseUrl}/conta.html`,
        pending: `${baseUrl}/conta.html`,
        failure: `${baseUrl}/conta.html`,
      };
      preference.auto_return = "approved";
    }

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      console.error("Erro ao criar preference no Mercado Pago:", await mpRes.text());
      return Response.json({ error: "mp_error" }, { status: 502 });
    }

    const data = await mpRes.json();
    return Response.json({ init_point: data.init_point });
  }),
};
