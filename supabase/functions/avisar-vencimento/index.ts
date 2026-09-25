// Zonea — avisa por e-mail (Resend) quem está com a assinatura perto de acabar.
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor", nomeie a
// função exatamente como "avisar-vencimento", cole este arquivo em index.ts e DESLIGUE "Verify JWT"
// (quem chama é o agendador do banco, sem login de usuário — mesma situação do mp-webhook).
//
// Secret necessário (Edge Functions → Secrets): RESEND_API_KEY (o mesmo do aviso de avaliações).
// Quem chama todo dia às 12:00 UTC (9h em Brasília) é a tarefa criada pela migração
// 0009_renovacao_e_aviso_vencimento.sql.
//
// Segurança: a função não recebe nada de fora. Quem avisar é decidido no banco (assinatura ativa que
// vence em até 3 dias), cada pessoa recebe UM aviso por período de assinatura (a reserva é gravada
// ANTES de enviar), então chamar a função muitas vezes, ou de fora, só repete o que já foi feito.

import { withSupabase } from "jsr:@supabase/server@^1";

const REMETENTE = "Zonea <nao-responder@zonea.com.br>";
const DIAS_DE_ANTECEDENCIA = 3;
const LINK_CONTA = "https://zonea.com.br/conta.html";

function escapaHtml(texto: string): string {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function montarEmail(expiraIso: string, agora: Date) {
  const dias = Math.max(1, Math.ceil((new Date(expiraIso).getTime() - agora.getTime()) / 86_400_000));
  const quando = dias === 1 ? "1 dia" : `${dias} dias`;
  const data = dataBR(expiraIso);
  const assunto = `Sua assinatura do Zonea termina em ${quando}`;

  const texto = [
    "Olá!",
    "",
    `A sua assinatura da Ferramenta de Poligonal do Zonea termina em ${quando} (${data}).`,
    "",
    "O que acontece depois:",
    "- A ferramenta deixa de calcular novas poligonais, e você volta a ter só as poligonais grátis que ainda restarem na sua conta.",
    "- Nada é cobrado sozinho: a assinatura não renova automaticamente.",
    "",
    "Quer continuar? Renove antes do fim: os dias que sobrarem são somados aos 30 novos, então você não perde nada.",
    `Renovar pela sua conta: ${LINK_CONTA}`,
    "",
    "Você recebe este aviso porque tem uma assinatura ativa no Zonea (zonea.com.br).",
  ].join("\n");

  const html = `<div style="background:#F1F5F9;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:28px 32px;color:#0F172A;line-height:1.6;font-size:15px">
    <div style="font-size:22px;font-weight:800;color:#1E5AA8;letter-spacing:.5px">ZONEA</div>
    <h1 style="font-size:20px;margin:18px 0 10px">Sua assinatura termina em ${escapaHtml(quando)}</h1>
    <p style="margin:0 0 14px">A assinatura da Ferramenta de Poligonal vale até <strong>${escapaHtml(data)}</strong>.</p>
    <p style="margin:0 0 6px"><strong>O que acontece depois</strong></p>
    <ul style="margin:0 0 16px;padding-left:20px">
      <li>A ferramenta deixa de calcular novas poligonais, e você volta a ter só as poligonais grátis que ainda restarem na sua conta.</li>
      <li>Nada é cobrado sozinho: a assinatura <strong>não renova automaticamente</strong>.</li>
    </ul>
    <p style="margin:0 0 20px">Quer continuar? <strong>Renove antes do fim:</strong> os dias que sobrarem são somados aos 30 novos, então você não perde nada.</p>
    <p style="margin:0 0 22px"><a href="${LINK_CONTA}" style="display:inline-block;background:#1E5AA8;color:#FFFFFF;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px">Renovar minha assinatura</a></p>
    <p style="margin:0;font-size:12px;color:#64748B">Você recebe este aviso porque tem uma assinatura ativa no Zonea (zonea.com.br).</p>
  </div>
</div>`;

  return { assunto, texto, html };
}

const ok = (corpo: Record<string, unknown>) => Response.json(corpo, { status: 200 });

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

    // Lido aqui (e não no topo do arquivo) pra um secret novo valer sem precisar reimplantar.
    const chave = Deno.env.get("RESEND_API_KEY");
    if (!chave) {
      console.error("Falta o secret RESEND_API_KEY — nenhum aviso de vencimento foi enviado.");
      return ok({ ok: false, erro: "nao_configurado" });
    }

    const { data: lista, error } = await ctx.supabaseAdmin.rpc("usuarios_para_avisar_vencimento", {
      p_dias: DIAS_DE_ANTECEDENCIA,
    });
    if (error) {
      console.error("Erro ao listar quem precisa ser avisado (a migração 0009 foi rodada?):", error);
      return ok({ ok: false, erro: "lista_falhou" });
    }

    const agora = new Date();
    let enviados = 0;
    let falhas = 0;
    let jaAvisados = 0;

    for (const u of (lista ?? []) as Array<{ id: string; email: string; expira: string }>) {
      if (!u.email) continue;

      // Reserva antes de enviar: se outra rodada já pegou este aviso, pula.
      const { data: reservou, error: erroReserva } = await ctx.supabaseAdmin.rpc("reservar_aviso_vencimento", {
        p_user_id: u.id,
        p_expira: u.expira,
      });
      if (erroReserva) {
        console.error("Erro ao reservar o aviso:", erroReserva);
        falhas++;
        continue;
      }
      if (!reservou) {
        jaAvisados++;
        continue;
      }

      const { assunto, texto, html } = montarEmail(u.expira, agora);
      let enviou = false;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: REMETENTE, to: [u.email], subject: assunto, text: texto, html }),
        });
        if (res.ok) {
          enviou = true;
        } else {
          console.error("O Resend recusou o envio:", res.status, await res.text());
        }
      } catch (err) {
        console.error("Falha ao chamar o Resend:", err);
      }

      if (enviou) {
        enviados++;
      } else {
        // Devolve a reserva: a rodada de amanhã tenta de novo (ainda dentro dos 3 dias).
        falhas++;
        const { error: erroLiberar } = await ctx.supabaseAdmin.rpc("liberar_aviso_vencimento", {
          p_user_id: u.id,
          p_expira: u.expira,
        });
        if (erroLiberar) console.error("Erro ao liberar a reserva:", erroLiberar);
      }
    }

    return ok({ ok: true, avaliados: (lista ?? []).length, enviados, falhas, jaAvisados });
  }),
};
