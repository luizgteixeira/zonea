# Pesquisa: o que Belo Horizonte publica sobre lotes

Pesquisado em 25/09/2026, para decidir como fazer uma "busca por lote" no Zonea. Tudo abaixo foi
conferido nos serviços reais da PBH, e não de memória. Os dados mudam: reconferir antes de construir.

## 1. Portal de dados abertos (dados.pbh.gov.br / ckan.pbh.gov.br)

**Lote Cadastro Técnico Municipal** ("lote CTM"), publicado pela Prodabel.

* Licença: **Creative Commons Attribution** (uso livre, inclusive comercial, **com atribuição** à fonte).
* Atualização: **mensal** (arquivo mais recente conferido: `20260901_lote_ctm.csv`, de 15/09/2026).
* Formato: **CSV de ~112 MB** com a cidade inteira, um arquivo novo por mês (o histórico desde 2022 fica no portal).
* Coordenadas: **EPSG:31983 (SIRGAS 2000 / UTM 23S)**, em metros — o mesmo sistema da Ferramenta de Poligonal.
* Campos (dicionário de dados oficial): só quatro.

| Campo | O que é |
|---|---|
| `ID_LT` | identificador interno |
| `NULOTCTM` | código do lote no CTM, 12 caracteres: número da quadra CTM + número do lote |
| `ID_QUADRA_CTM` | identificador da quadra |
| `GEOMETRIA` | polígono do lote (WKT) |

**Não há** endereço, índice cadastral, área nem zoneamento nesse arquivo. Só forma e código do lote.

Outros conjuntos relacionados (mesma licença): Quadra CTM, Lote Aprovado, Divisa Física do Lote,
Tipologia de Uso e Ocupação do Lote (2011 a 2022).

## 2. Serviço de mapas ao vivo (GeoServer, geoservicos.pbh.gov.br)

É o que o BHGeo/BHMap usa. Tem camadas bem mais ricas:

* `ide_bhgeo:LOTE_CTM` — código do lote, quadra, **área em m²** e polígono.
* `ide_bhgeo:CADASTRO_IMOBILIARIO` — **`INDICE_CADASTRAL`** (o número que o profissional conhece, do IPTU),
  endereço (logradouro, número, complemento, CEP), área do terreno e da construção, ano de construção,
  tipologia, zoneamento do IPTU e indicadores de infraestrutura (pavimentação, esgoto, água, iluminação...).
* `certidaoimobiliaria:IPTU_LOTE_CTM_GEO` — liga o lote ao índice cadastral.

**Mas o acesso está fechado para o Zonea:**

* Chamada de navegador vinda de `zonea.com.br` → **HTTP 403**. O servidor só libera a origem
  `bhmap.pbh.gov.br` (o site deles).
* Chamada sem cabeçalho de navegador (`curl` puro) → **HTTP 403**. Há uma proteção contra acesso automático.
* Não há política de licença publicada para essas camadas ao vivo (diferente do portal de dados abertos).

## 3. O que isso significa

| Caminho | Dá pra fazer? | Observação |
|---|---|---|
| Consultar o GeoServer direto do navegador do Zonea | **Não** | Bloqueado (403) por origem. |
| Consultar o GeoServer por um servidor nosso | **Só com autorização** | Funciona fingindo ser navegador, mas isso **contorna uma proteção** do serviço: não fazer sem permissão da PBH/Prodabel. |
| Pedir à PBH/Prodabel para liberar `zonea.com.br` (ou um acesso formal) | **A tentar** | É o que dá os dados ricos (índice cadastral, endereço, área). Depende da resposta. |
| Usar o CSV do portal de dados abertos | **Sim, hoje** | Licença permite. Só traz o **desenho e o código do lote** — sem endereço nem índice cadastral. Precisa de um script que converta o CSV (~112 MB) em arquivos pequenos por região, servidos estáticos, e de reprocessar todo mês. |

## 4. Pontos de atenção

* **Atribuição obrigatória** (CC-BY): "Fonte: Prefeitura de Belo Horizonte / Prodabel — Lote Cadastro Técnico Municipal".
* O lote do CTM é um **desenho cadastral** para fins fiscais e de planejamento. Pode divergir da matrícula/registro de
  imóveis: a página deve dizer que **não substitui** a certidão nem o levantamento topográfico.
* **LGPD:** endereço + área de imóvel, sem nome de proprietário, mas ainda é cadastro imobiliário. Se um dia usarmos
  as camadas ao vivo, confirmar com a PBH o que pode ser reexibido.
* O que o profissional realmente sabe de cabeça é o **índice cadastral** (do IPTU), não o código CTM. Uma "busca por
  número de lote" só com o CSV aberto atenderia pouca gente; o caminho útil é **por endereço → mostrar o lote**.
* Só vale para **Belo Horizonte**. Os outros 33 municípios não foram pesquisados.

## 5. Ideia que casa com o Zonea

As coordenadas do lote já vêm em UTM 23S/SIRGAS 2000, o mesmo sistema da Ferramenta de Poligonal. Dá pra oferecer:
"Importar os vértices deste lote para a Poligonal" (e conferir a área contra o memorial da pessoa).
