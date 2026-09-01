// Zonea — libera a consulta gratuita de UM município confirmado por visitante anônimo.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "get-preview-municipio" e cole este arquivo em index.ts.
// Não precisa de nenhum secret novo.
//
// auth: "none" porque quem chama isso é um visitante sem conta (sem sessão Supabase).
// O controle de "só uma vez" é feito com um ID anônimo gerado no navegador (deviceId,
// só um UUID salvo no localStorage do visitante — não é autenticação), checado e
// gravado na tabela anon_preview_usado via ctx.supabaseAdmin (bypass de RLS).

import { withSupabase } from "jsr:@supabase/server@^1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let body: { deviceId?: string; slug?: string } = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }

    const { deviceId, slug } = body;
    if (!deviceId || !UUID_RE.test(deviceId) || !slug) {
      return Response.json({ error: "invalid_params" }, { status: 400 });
    }

    const { data: jaUsado } = await ctx.supabaseAdmin
      .from("anon_preview_usado")
      .select("device_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (jaUsado) {
      return Response.json({ allowed: false });
    }

    const { data: municipio, error } = await ctx.supabaseAdmin
      .from("municipios_protegido")
      .select("slug, link, sistema, detalhes_tecnicos, sistema_referencia, indisponivel, indisponivel_desde")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !municipio) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    // Registra o uso ANTES de responder. A chave primária (device_id) garante que,
    // se duas requisições chegarem quase juntas (duplo clique, duas abas), só uma
    // consegue inserir — a outra cai no catch abaixo e não libera a consulta.
    const { error: insertError } = await ctx.supabaseAdmin
      .from("anon_preview_usado")
      .insert({ device_id: deviceId, slug_usado: slug });

    if (insertError) {
      return Response.json({ allowed: false });
    }

    return Response.json({ allowed: true, municipio });
  }),
};
