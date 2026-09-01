// Zonea — registra o interesse de um visitante que ainda não assinou (e-mail ou
// WhatsApp deixado no card de município bloqueado), pra a equipe poder reengajar
// esse contato depois em vez de simplesmente perdê-lo.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "submit-lead" e cole este arquivo em index.ts.
// Não precisa de nenhum secret novo.
//
// auth: "none" porque quem chama isso é um visitante sem conta (sem sessão Supabase).
// Grava direto via ctx.supabaseAdmin (bypass de RLS) — a tabela leads_interesse não
// tem nenhuma policy de client, só a service_role escreve nela.

import { withSupabase } from "jsr:@supabase/server@^1";

const CONTATO_MAX_LEN = 200;

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let body: { contato?: string; municipioSlug?: string; deviceId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }

    const contato = (body.contato ?? "").trim();
    if (!contato || contato.length > CONTATO_MAX_LEN) {
      return Response.json({ error: "invalid_params" }, { status: 400 });
    }

    const { error } = await ctx.supabaseAdmin.from("leads_interesse").insert({
      contato,
      municipio_slug: body.municipioSlug || null,
      device_id: body.deviceId || null,
    });

    if (error) {
      return Response.json({ error: "insert_failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  }),
};
