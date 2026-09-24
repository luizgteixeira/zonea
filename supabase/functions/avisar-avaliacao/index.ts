// Zonea — avisa por e-mail (Resend) quando chega uma avaliação nova, ou quando uma é editada.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor", nomeie a
// função exatamente como "avisar-avaliacao", cole este arquivo em index.ts e DESLIGUE "Verify JWT"
// (quem chama é o próprio banco, por webhook, sem login de usuário — mesma situação do mp-webhook).
//
// Secrets necessários (Edge Functions → Secrets):
//   RESEND_API_KEY          chave do Resend com permissão de envio (pode ser a mesma do SMTP do Supabase)
//   AVALIACOES_AVISO_PARA   e-mail que recebe o aviso (vários, separados por vírgula)
//
// Quem dispara é o trigger "avaliacoes_avisar" (migração 0008_avaliacoes_aviso.sql).
//
// Segurança: a função NÃO confia no que chega no corpo da requisição. Só usa o id da avaliação, lê
// tudo no banco e reserva o envio (notificado_em) antes de mandar — então cada avaliação real gera no
// máximo um e-mail, e um pedido inventado não gera nenhum.

import { withSupabase } from "jsr:@supabase/server@^1";

const REMETENTE = "Zonea <nao-responder@zonea.com.br>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapaHtml(texto: string): string {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Uma linha só, sem quebras: o texto vem de um usuário e vai pro assunto do e-mail.
function umaLinha(texto: string, max: number): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

type Avaliacao = {
  id: string;
  nota: number;
  nome: string;
  profissao: string | null;
  comentario: string;
  created_at: string;
  updated_at: string;
};

function montarEmail(av: Avaliacao, painelUrl: string) {
  const editada = new Date(av.updated_at).getTime() - new Date(av.created_at).getTime() > 60_000;
  const estrelas = "★".repeat(av.nota) + "☆".repeat(5 - av.nota);
  const nome = umaLinha(av.nome, 40);
  const assunto = `${editada ? "Avaliação editada" : "Nova avaliação"} no Zonea: ${estrelas} de ${nome}`;
  const area = av.profissao ? umaLinha(av.profissao, 40) : "não informada";
  const sql = `update public.avaliacoes set status = 'aprovada' where id = '${av.id}';`;
  const sqlResposta =
    `update public.avaliacoes set status = 'aprovada', resposta = 'Sua resposta aqui' where id = '${av.id}';`;

  const texto = [
    editada
      ? "Uma avaliação foi EDITADA e voltou para a revisão."
      : "Chegou uma avaliação nova, esperando a sua revisão.",
    "",
    `Nota: ${av.nota} de 5 (${estrelas})`,
    `Nome: ${nome}`,
    `Área: ${area}`,
    "",
    "Comentário:",
    av.comentario,
    "",
    "Para aprovar (SQL Editor do Supabase):",
    sql,
    "",
    "Para aprovar e responder:",
    sqlResposta,
    "",
    `Painel: ${painelUrl}`,
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0F172A;line-height:1.55">
  <h2 style="margin:0 0 4px;color:#1E5AA8">${editada ? "Avaliação editada" : "Nova avaliação"}</h2>
  <p style="margin:0 0 16px;color:#475569">${editada ? "Voltou para a revisão." : "Está esperando a sua revisão."}</p>
  <p style="font-size:22px;margin:0 0 8px;color:#F59E0B">${estrelas} <span style="font-size:14px;color:#475569">${av.nota} de 5</span></p>
  <p style="margin:0 0 12px"><strong>${escapaHtml(nome)}</strong> · ${escapaHtml(area)}</p>
  <blockquote style="margin:0 0 20px;padding:12px 16px;background:#F1F5F9;border-left:3px solid #1E5AA8;white-space:pre-wrap">${escapaHtml(av.comentario)}</blockquote>
  <p style="margin:0 0 6px"><strong>Aprovar</strong> (SQL Editor do Supabase):</p>
  <pre style="margin:0 0 14px;padding:10px;background:#0F172A;color:#E2E8F0;font-size:12px;white-space:pre-wrap;word-break:break-all">${escapaHtml(sql)}</pre>
  <p style="margin:0 0 6px"><strong>Aprovar e responder:</strong></p>
  <pre style="margin:0 0 18px;padding:10px;background:#0F172A;color:#E2E8F0;font-size:12px;white-space:pre-wrap;word-break:break-all">${escapaHtml(sqlResposta)}</pre>
  <p style="margin:0"><a href="${escapaHtml(painelUrl)}" style="display:inline-block;background:#1E5AA8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Abrir o painel</a></p>
</div>`;

  return { assunto, texto, html };
}

const ok = (corpo: Record<string, unknown>) => Response.json(corpo, { status: 200 });

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

    // Lidos aqui (e não no topo do arquivo) pra um secret novo valer sem precisar reimplantar.
    const chave = Deno.env.get("RESEND_API_KEY");
    const destinos = (Deno.env.get("AVALIACOES_AVISO_PARA") ?? "").split(",").map((e) => e.trim()).filter(Boolean);
    if (!chave || !destinos.length) {
      console.error("Faltam os secrets RESEND_API_KEY e/ou AVALIACOES_AVISO_PARA — nenhum aviso foi enviado.");
      return ok({ ok: false, erro: "nao_configurado" });
    }

    let corpo: { record?: { id?: string } } = {};
    try {
      corpo = await req.json();
    } catch {
      return ok({ ok: false, erro: "corpo_invalido" });
    }
    const id = corpo?.record?.id;
    if (typeof id !== "string" || !UUID.test(id)) return ok({ ok: false, erro: "id_invalido" });

    // A verdade está no banco, não no que veio na requisição.
    const { data: av, error } = await ctx.supabaseAdmin
      .from("avaliacoes")
      .select("id, nota, nome, profissao, comentario, status, notificado_em, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("Erro ao ler a avaliação:", error);
      return ok({ ok: false, erro: "leitura_falhou" });
    }
    if (!av || av.status !== "pendente" || av.notificado_em) return ok({ ok: true, ignorado: true });

    // Reserva o envio antes de mandar: se dois avisos chegarem juntos, só um consegue marcar.
    // (Gravar notificado_em não dispara o trigger de novo: a condição dele exige notificado_em vazio.)
    const { data: reservada, error: erroReserva } = await ctx.supabaseAdmin
      .from("avaliacoes")
      .update({ notificado_em: new Date().toISOString() })
      .eq("id", id)
      .is("notificado_em", null)
      .select("id");
    if (erroReserva) {
      console.error("Erro ao reservar o aviso:", erroReserva);
      return ok({ ok: false, erro: "reserva_falhou" });
    }
    if (!reservada || !reservada.length) return ok({ ok: true, ignorado: true });

    const host = new URL(Deno.env.get("SUPABASE_URL") ?? "https://x.supabase.co").hostname;
    const ref = host.split(".")[0];
    const painel = `https://supabase.com/dashboard/project/${ref}/editor`;
    const { assunto, texto, html } = montarEmail(av as Avaliacao, painel);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: REMETENTE, to: destinos, subject: assunto, text: texto, html }),
      });
      if (!res.ok) {
        // Sem nova tentativa automática (evitaria laço com o trigger): a avaliação continua no painel.
        console.error("O Resend recusou o envio:", res.status, await res.text());
        return ok({ ok: false, erro: "envio_falhou" });
      }
    } catch (err) {
      console.error("Falha ao chamar o Resend:", err);
      return ok({ ok: false, erro: "envio_falhou" });
    }
    return ok({ ok: true, enviado: true });
  }),
};
