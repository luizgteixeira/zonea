// Zonea — consulta pontual o zoneamento de Santa Luzia (dado público da prefeitura).
//
// Deploy: painel do Supabase → Edge Functions → "Deploy a new function" → "Via Editor",
// nomeie a função exatamente como "zoneamento-santa-luzia", cole este arquivo em index.ts e
// DESLIGUE "Verify JWT" (quem chama é qualquer visitante do mapa, sem precisar de conta — a
// busca e o mapa são 100% gratuitos, mesma situação do mp-webhook/avisar-vencimento quanto ao
// Verify JWT, mas aqui quem chama é o próprio navegador do visitante, não outro servidor).
//
// Por que existir: o GeoServer da prefeitura (geopin.santaluzia.mg.gov.br) responde certinho
// quando o Zonea chama direto do servidor (testado com curl), mas NÃO manda cabeçalho
// Access-Control-Allow-Origin — ou seja, bloqueado para chamada direta do navegador (diferente
// do ArcGIS de Contagem, que permite). Por isso existe esta função: ela chama o GeoServer no
// lugar do navegador da pessoa (servidor-a-servidor não tem bloqueio de CORS) e devolve o
// resultado já pronto. Sem isso, dá "Failed to fetch" pra qualquer visitante.
//
// O que devolve: duas camadas, pelos nomes mesmo (não código numérico, como em Contagem) —
// a prefeitura tem duas leis de zoneamento em vigor ao mesmo tempo, então mostramos as duas:
//   planoDiretor2026 → { nome, sigla } | null   (Delimitação de Zoneamento, Plano Diretor 2026)
//   lpuos2008        → { nome, coeficienteBasico, coeficienteMaximo, taxaOcupacao,
//                         taxaPermeabilidade, quotaTerreno } | null   (LPUOS, parâmetros construtivos)
//
// Sem secret nenhum: o GeoServer é público, sem token.

import { withSupabase } from "jsr:@supabase/server@^1";

const GEOSERVER = "https://geopin.santaluzia.mg.gov.br/geoserver/ows";

async function consultarCamada(typeName: string, campos: string[], lat: number, lon: number) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    propertyName: campos.join(","),
    // SRID=4326;POINT(lon lat): o geom da camada é SIRGAS 2000/UTM (metros), não graus — sem o
    // prefixo SRID o GeoServer lê o ponto como se já estivesse em UTM e nunca acha nada.
    CQL_FILTER: `INTERSECTS(geom,SRID=4326;POINT(${lon} ${lat}))`,
  });
  const res = await fetch(`${GEOSERVER}?${params}`);
  if (!res.ok) throw new Error(`GeoServer HTTP ${res.status} em ${typeName}`);
  const dados = await res.json();
  return dados.features?.[0]?.properties ?? null;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let body: { lat?: number; lon?: number } = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    const { lat, lon } = body;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: "invalid_params" }, { status: 400 });
    }
    // Fora do retângulo que envolve Santa Luzia (com ~1km de margem), nem chama o GeoServer à
    // toa — bbox tirado de data/rmbh-municipios.geojson. Município vizinho de BH, então a
    // margem é apertada de propósito: uma folga maior passaria a aceitar pontos de Belo
    // Horizonte, por exemplo.
    if (lat! < -19.8585 || lat! > -19.5968 || lon! < -43.9573 || lon! > -43.7445) {
      return Response.json({ error: "fora_de_santa_luzia" }, { status: 400 });
    }

    try {
      const [pd, lpuos] = await Promise.all([
        consultarCamada(
          "planejamento_urbano:plu_delimitacao_zoneamento_plano_diretor_view",
          ["nome_zoneamento_plano_diretor", "sigla_zoneamento_plano_diretor"],
          lat!,
          lon!,
        ),
        consultarCamada(
          "planejamento_urbano:plu_delimitacao_zoneamento_lpuos_view",
          [
            "nome_zona_lpuos",
            "coeficiente_basico",
            "coeficiente_maximo",
            "taxa_ocupacao",
            "taxa_permeabilidade",
            "quota_terreno",
          ],
          lat!,
          lon!,
        ),
      ]);

      return Response.json({
        planoDiretor2026: pd && {
          nome: pd.nome_zoneamento_plano_diretor,
          sigla: pd.sigla_zoneamento_plano_diretor,
        },
        lpuos2008: lpuos && {
          nome: lpuos.nome_zona_lpuos,
          coeficienteBasico: lpuos.coeficiente_basico,
          coeficienteMaximo: lpuos.coeficiente_maximo,
          taxaOcupacao: lpuos.taxa_ocupacao,
          taxaPermeabilidade: lpuos.taxa_permeabilidade,
          quotaTerreno: lpuos.quota_terreno,
        },
      });
    } catch (err) {
      console.error("Erro ao consultar o GeoServer de Santa Luzia:", err);
      return Response.json({ error: "geoserver_failed" }, { status: 502 });
    }
  }),
};
