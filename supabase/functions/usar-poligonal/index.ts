// Zonea — controla o uso da Ferramenta de Poligonal (2 poligonais grátis por conta,
// depois exige assinatura ativa).
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "usar-poligonal" e cole este arquivo em index.ts.
// Não precisa de nenhum secret novo. Depende da migration 0005_poligonais_gratis.sql.
//
// Duas ações (body JSON { "acao": ... }):
//   "status"   → só informa quantos créditos a conta tem; não gasta nada.
//   "consumir" → gasta 1 crédito (assinante ativo não gasta: é ilimitado).
//
// Sempre responde 200 com { permitido: boolean, ... } quando a checagem funcionou —
// "sem créditos" não é erro, é uma resposta normal (permitido: false). Erros de verdade
// (não logado, corpo inválido, falha no banco) usam status 4xx/5xx.

import { withSupabase } from "jsr:@supabase/server@^1";

// Única fonte da verdade do limite. Se mudar, ajuste também os textos "2 poligonais
// grátis" do site (servicos.html, index.html, conta.html, faq.html, README).
const LIMITE_POLIGONAIS_GRATIS = 2;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    // ctx.supabase já está autenticado como o usuário que chamou a função.
    const { data: { user }, error: userError } = await ctx.supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: { acao?: string } = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    if (body.acao !== "status" && body.acao !== "consumir") {
      return Response.json({ error: "invalid_params" }, { status: 400 });
    }

    // Leitura com service_role: a decisão de acesso nunca depende do que o navegador diz.
    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("subscription_status, subscription_expires_at, poligonais_gratis_usadas")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Erro ao ler o perfil:", profileError);
      return Response.json({ error: "profile_not_found" }, { status: 500 });
    }

    const assinante = profile.subscription_status === "active" &&
      (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date());

    if (assinante) {
      return Response.json({ permitido: true, assinante: true, limite: LIMITE_POLIGONAIS_GRATIS });
    }

    const usadas = profile.poligonais_gratis_usadas as number;

    if (body.acao === "status") {
      const restantes = Math.max(0, LIMITE_POLIGONAIS_GRATIS - usadas);
      return Response.json({
        permitido: restantes > 0,
        assinante: false,
        limite: LIMITE_POLIGONAIS_GRATIS,
        usadas,
        restantes,
      });
    }

    // acao === "consumir": o próprio UPDATE condicional decide (atômico), não o "usadas"
    // lido acima — que já pode estar defasado se houver duas chamadas ao mesmo tempo.
    const { data: usadasDepois, error: rpcError } = await ctx.supabaseAdmin.rpc(
      "consumir_poligonal_gratis",
      { p_user_id: user.id, p_limite: LIMITE_POLIGONAIS_GRATIS },
    );

    if (rpcError) {
      console.error("Erro ao consumir crédito:", rpcError);
      return Response.json({ error: "consume_failed" }, { status: 500 });
    }

    if (usadasDepois === null || usadasDepois === undefined) {
      return Response.json({
        permitido: false,
        assinante: false,
        limite: LIMITE_POLIGONAIS_GRATIS,
        usadas: LIMITE_POLIGONAIS_GRATIS,
        restantes: 0,
      });
    }

    return Response.json({
      permitido: true,
      assinante: false,
      limite: LIMITE_POLIGONAIS_GRATIS,
      usadas: usadasDepois,
      restantes: Math.max(0, LIMITE_POLIGONAIS_GRATIS - usadasDepois),
    });
  }),
};
