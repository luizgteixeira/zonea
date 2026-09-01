![Logo do Zonea](img/logo.webp)

# Zonea — Inteligência Territorial

**Informação urbanística direto da fonte.** Consulte. Compreenda. Planeje.

---

## O que é o Zonea?

O **Zonea** ajuda você a encontrar, rapidamente, os dados oficiais de mapas e zoneamento de um município — sem precisar caçar em dezenas de sites diferentes de prefeitura.

Cada prefeitura da Região Metropolitana de Belo Horizonte (RMBH) tem seu próprio "geoportal" (o site onde ela publica mapas, zoneamento e informações do território), e esses portais são difíceis de achar e nem sempre funcionam bem. O Zonea funciona como um **ponto de partida único**: você digita o nome do município e ele te leva direto para a fonte oficial correta — sem inventar dados, sem substituir a prefeitura, só facilitando o caminho até lá.

* **Onde atuamos hoje:** Região Metropolitana de Belo Horizonte (RMBH), 34 municípios.
* **O que já está confirmado:** 6 desses municípios têm o portal e o sistema de coordenadas verificados por nós (Belo Horizonte, Betim, Contagem, Nova Lima, Ribeirão das Neves e Santa Luzia). Os outros ainda estão em processo de checagem.
* **Para quem é:** arquitetos, engenheiros, urbanistas, e qualquer pessoa que precise consultar informações territoriais de um município da região.

---

## O que dá pra fazer no site hoje

* **Buscar um município e ir direto à fonte oficial** — digite o nome (o campo até corrige acentos e maiúsculas/minúsculas) e o Zonea mostra o link confirmado do geoportal daquela cidade, junto com um resumo do que tem disponível lá.
* **Saber se o dado é confiável** — cada resultado mostra se o portal já foi auditado por nós ("Fonte Auditada") ou se ainda está em fase de checagem ("Busca Direta"). E se um portal cair fora do ar, o Zonea avisa isso na tela, em vez de simplesmente te mandar para um link quebrado.
* **Aprender os termos técnicos** — uma página de glossário explica, em linguagem simples, conceitos como WMS, WFS, Datum, SIRGAS 2000 e outros termos que aparecem nos portais de geoprocessamento.
* **Desenhar uma poligonal automaticamente** — nossa ferramenta mais nova. Em vez de desenhar manualmente num programa de CAD, você preenche uma tabela (ou cola direto de uma planilha Excel) com as coordenadas do terreno, e o Zonea desenha o formato, calcula a área, o perímetro e avisa se algo não fechou certo.
* **Falar com a gente pelo WhatsApp** — direto em qualquer página, para tirar dúvidas, sugerir um município novo, ou avisar se algo está fora do ar.

A busca de município é livre pra qualquer visitante, sem precisar de conta — inclusive dá pra ver o link real de **um município confirmado gratuitamente**, como prévia. Pra continuar acessando outros municípios confirmados e usar a Ferramenta de Poligonal, é preciso criar conta em `conta.html` e assinar (Pix, boleto ou cartão, via Mercado Pago).

---

## Como o site foi construído (para quem for mexer no código)

O Zonea é um site simples de propósito: só HTML, CSS e JavaScript "puros", sem nenhum framework nem etapa de compilação. Isso significa que qualquer editor de texto e um navegador já bastam para trabalhar nele.

* As informações públicas dos municípios ficam num arquivo separado (`data/municipios.json`), fora do código da página — assim dá pra atualizar os dados sem mexer no visual do site.
* O visual (cores, fontes, espaçamentos) é centralizado num único arquivo de estilo (`css/estilo.css`), então mudar a identidade visual do site inteiro é uma questão de editar um lugar só.
* Cada página carrega os dados dinamicamente ao abrir — por isso não dá pra simplesmente abrir os arquivos `.html` clicando duas vezes; é preciso rodar um servidor local (explicado mais abaixo).
* **Login e assinatura** são feitos com [Supabase](https://supabase.com) (banco de dados + autenticação gerenciados) — `js/supabase-client.js` inicializa a conexão (a chave usada ali é pública por design, protegida por Row Level Security no banco, não pelo sigilo dela) e `js/auth.js` cuida do cadastro/login/logout/pagamento na página `conta.html`.
* **Dados sensíveis por município** (link do portal, detalhes técnicos, sistema de referência) não estão mais em `data/municipios.json` — moraram para a tabela `municipios_protegido` no Supabase, protegida por Row Level Security: só é lida por quem está logado **e** com assinatura ativa. O `municipios.json` público só tem os campos que já eram de conhecimento geral (nome, se está confirmado, região, população, área).
* **Consulta gratuita**: a Home não exige login. Quando um visitante sem assinatura busca um município confirmado, `js/script.js` chama a Edge Function `get-preview-municipio`, que libera os dados reais **uma única vez por visitante** — controlado no servidor pela tabela `anon_preview_usado`, usando um ID anônimo gerado no navegador (`getDeviceId()`, só um UUID em `localStorage`, não é autenticação). Depois da primeira vez, volta a pedir assinatura.
* A **Poligonal** (`poligonal.html`) exige sessão **e** assinatura ativa (não só login) — é a ferramenta paga.
* **Pagamento** é via Mercado Pago (Checkout Pro), sem servidor próprio: `conta.html` chama a Edge Function `create-mp-preference` (Supabase) pra gerar o link de pagamento, e a Edge Function `mp-webhook` recebe a confirmação do Mercado Pago e ativa a assinatura automaticamente — ver `supabase/functions/`.

---

## Mapa dos arquivos do projeto

```text
/
├── index.html         # Página principal — busca de municípios (livre, com 1 consulta grátis por visitante)
├── servicos.html      # Sobre o Zonea, casos de uso e chamada para criar conta
├── conhecimento.html  # Glossário com os termos técnicos explicados
├── poligonal.html     # Ferramenta que desenha a poligonal automaticamente (exige assinatura ativa)
├── faq.html           # Perguntas frequentes
├── conta.html          # Cadastro, login e status da assinatura
├── css/
│   └── estilo.css     # Todo o visual do site (cores, fontes, layout)
├── js/
│   ├── script.js            # Busca, menu, guard de páginas restritas e outras funções gerais
│   ├── poligonal.js         # Lógica da ferramenta de poligonal (cálculos e desenho)
│   ├── supabase-client.js   # Inicialização do client Supabase (usado em toda página)
│   └── auth.js               # Cadastro/login/logout, usado só em conta.html
├── data/
│   ├── municipios.json  # Lista pública dos 34 municípios (campos sensíveis vivem no Supabase)
│   └── config.json      # Configurações gerais (ex: número do WhatsApp)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                     # Schema inicial (tabelas + Row Level Security)
│   │   └── 0002_preview_gratis.sql           # Tabela de controle da consulta gratuita
│   └── functions/
│       ├── create-mp-preference/index.ts     # Gera o link de pagamento (Mercado Pago Checkout Pro)
│       ├── mp-webhook/index.ts               # Recebe a confirmação de pagamento e ativa a assinatura
│       └── get-preview-municipio/index.ts    # Libera a consulta gratuita (1 por visitante anônimo)
├── scripts/
│   └── migrate-municipios.mjs    # Script único de importação de municipios.json para o Supabase
├── img/                # Logo, ícones e imagens
├── marketing/          # Material de divulgação (stories exportados, prints) — não faz parte do site em si
└── README.md           # Este arquivo
```

---

## Como rodar o site no seu computador

O site busca os dados de município num arquivo separado enquanto a página carrega. Por causa disso, **não dá pra simplesmente abrir o arquivo `.html` clicando duas vezes** — o navegador bloqueia esse tipo de carregamento por segurança. É preciso "servir" a pasta com um servidor local simples. Duas opções fáceis:

```bash
# Se você tem Python instalado
python -m http.server 8000

# Ou, com Node.js, sem precisar instalar nada
npx serve .
```

Depois, acesse `http://localhost:8000/servicos.html` no navegador (a busca de município é livre; a ferramenta de poligonal exige assinatura ativa — crie uma conta em `conta.html`).

---

## Para onde o projeto está indo

1. **Fase 1 — Base:** estrutura do site e catálogo dos municípios da RMBH. ✅
2. **Fase 2 — Dados confiáveis:** conferir e validar os portais de cada município. *(em andamento)*
3. **Fase 3 — Mapas:** mostrar mapas e camadas geográficas dentro do próprio Zonea.
4. **Fase 4 — Busca avançada:** encontrar informações por endereço, CEP ou número de lote.
5. **Fase 5 — Inteligência territorial:** cruzar dados de diferentes fontes e gerar relatórios automáticos.
6. **Fase 6 — Expansão:** levar o Zonea para outras regiões do Brasil, além da RMBH.

---

## Contato

Desenvolvido por **[Luiz Gustavo](https://www.luizgustavodev.com/)**.

Dúvidas, parcerias ou sugestões? Fale com a gente pelo WhatsApp disponível em qualquer página do site.

📍 Belo Horizonte / MG
