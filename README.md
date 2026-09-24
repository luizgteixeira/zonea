![Logo do Zonea](img/logo.webp)

# Zonea — Inteligência Territorial

**Informação urbanística direto da fonte.** Consulte. Compreenda. Planeje.

🔗 [zonea.com.br](https://zonea.com.br)

---

## O que é o Zonea?

O **Zonea** ajuda você a encontrar, rapidamente, os dados oficiais de mapas e zoneamento de um município — sem precisar caçar em dezenas de sites diferentes de prefeitura.

Cada prefeitura da Região Metropolitana de Belo Horizonte (RMBH) tem seu próprio "geoportal" (o site onde ela publica mapas, zoneamento e informações do território), e esses portais são difíceis de achar e nem sempre funcionam bem. O Zonea funciona como um **ponto de partida único**: você digita o nome do município, clica nele num mapa ou lê um guia prático — e ele te leva direto para a fonte oficial correta, sem inventar dados, sem substituir a prefeitura, só facilitando o caminho até lá.

* **Onde atuamos hoje:** Região Metropolitana de Belo Horizonte (RMBH), 34 municípios.
* **O que já está confirmado:** 6 desses municípios têm o portal e o sistema de coordenadas verificados por nós (Belo Horizonte, Betim, Contagem, Nova Lima, Ribeirão das Neves e Santa Luzia). Os outros ainda estão em processo de checagem.
* **Para quem é:** arquitetos, engenheiros, urbanistas, e qualquer pessoa que precise consultar informações territoriais de um município da região.

---

## O que dá pra fazer no site hoje

* **Buscar um município e ir direto à fonte oficial** — digite o nome (o campo até corrige acentos e maiúsculas/minúsculas) e o Zonea mostra o link confirmado do geoportal daquela cidade, junto com um resumo do que tem disponível lá.
* **Buscar por endereço ou CEP** — na página do mapa, digite um CEP ou um endereço e o Zonea marca o ponto, diz em qual município da RMBH ele fica e mostra o portal oficial daquela prefeitura (posição aproximada; ainda não busca por número de lote).
* **Explorar o mapa da RMBH** — um mapa interativo (Leaflet + malha oficial do IBGE) com o contorno dos 34 municípios. Clique em qualquer um pra ver o mesmo card de dados da busca e ir direto ao portal da prefeitura.
* **Saber se o dado é confiável** — cada resultado mostra se o portal já foi auditado por nós ("Fonte Auditada") ou se ainda está em fase de checagem ("Busca Direta"). E se um portal cair fora do ar, o Zonea avisa isso na tela, em vez de simplesmente te mandar para um link quebrado.
* **Aprender os termos técnicos e a prática** — a Central de Conhecimento reúne um glossário (WMS, WFS, Datum, SIRGAS 2000 e outros termos que aparecem nos portais de geoprocessamento) e artigos práticos, como calcular área/perímetro de uma poligonal a partir de azimute e distância, o que é erro de fechamento e como corrigi-lo, e o que é um memorial descritivo.
* **Desenhar uma poligonal automaticamente** — em vez de desenhar manualmente num programa de CAD, você preenche uma tabela (ou cola direto de uma planilha Excel) com as coordenadas do terreno, e o Zonea desenha o formato, calcula a área, o perímetro e avisa se algo não fechou certo. Depois de calcular, dá pra **baixar o desenho em DXF** (abre no AutoCAD, BricsCAD, LibreCAD e QGIS) **ou em KML/KMZ** (abre no Google Earth). Se você colar o memorial completo (Vértice Inicial, Vértice Final, Azimute, Distância, E, N), o Zonea usa as coordenadas de cada vértice — o "modo por coordenadas" — e a área sai igual à declarada no documento.
* **Falar com a gente pelo WhatsApp** — direto em qualquer página, para tirar dúvidas, sugerir um município novo, ou avisar se algo está fora do ar.

A busca de município, o mapa e os artigos são **100% gratuitos**, sem precisar de conta — os dados dos municípios são públicos e vêm das próprias prefeituras. O que é pago é a **Ferramenta de Poligonal**: as **2 primeiras poligonais são grátis** (basta criar uma conta gratuita em `conta.html`) e, depois disso, é preciso assinar: **R$ 9,90 por 30 dias**, pagamento único (Pix, boleto ou cartão, via Mercado Pago), sem renovação automática.

---

## Como o site foi construído (para quem for mexer no código)

O Zonea é um site simples de propósito: só HTML, CSS e JavaScript "puros", sem nenhum framework nem etapa de compilação. Isso significa que qualquer editor de texto e um navegador já bastam para trabalhar nele.

* As informações públicas dos municípios ficam num arquivo separado (`data/municipios.json`), fora do código da página — assim dá pra atualizar os dados sem mexer no visual do site.
* O visual (cores, fontes, espaçamentos) é centralizado num único arquivo de estilo (`css/estilo.css`), então mudar a identidade visual do site inteiro é uma questão de editar um lugar só.
* Cada página carrega os dados dinamicamente ao abrir — por isso não dá pra simplesmente abrir os arquivos `.html` clicando duas vezes; é preciso rodar um servidor local (explicado mais abaixo). Todos os links internos gerados por JavaScript usam caminho absoluto a partir da raiz (ex. `/conta.html`), pra funcionar tanto nas páginas do primeiro nível quanto nas de dentro de `conhecimento/`.
* **Login e assinatura** são feitos com [Supabase](https://supabase.com) (banco de dados + autenticação gerenciados) — `js/supabase-client.js` inicializa a conexão (a chave usada ali é pública por design, protegida por Row Level Security no banco, não pelo sigilo dela) e `js/auth.js` cuida do cadastro/login/logout/recuperação de senha/pagamento na página `conta.html`. No cadastro a senha é digitada duas vezes, com um checklist ao vivo (6 caracteres, maiúscula, minúscula, número e caractere especial) — as mesmas regras precisam estar ligadas no painel do Supabase, porque a checagem do navegador é só experiência de uso. O link do e-mail "Esqueci minha senha" volta com `#…type=recovery` e já deixa a pessoa logada: `supabase-client.js` guarda isso (`ZONEA_RECUPERANDO_SENHA`) antes de o SDK limpar o endereço, e `conta.html` mostra o formulário de nova senha (`updateUser`), levando pra lá quem cair em outra página. Só a Poligonal depende disso: busca, mapa e artigos funcionam mesmo com o Supabase fora do ar.
* **Dados dos municípios** (link do portal, sistema, detalhes técnicos, sistema de referência, status de disponibilidade) ficam todos em `data/municipios.json`, um arquivo estático e público — não há mais nenhuma consulta a banco pra buscar ou mostrar um município.
* A antiga trava por município (tabelas `municipios_protegido`, `anon_preview_usado` e `leads_interesse`, e as Edge Functions `get-preview-municipio` e `submit-lead`) **foi removida**: o código saiu do repositório e a migração `0006_remove_trava_por_municipio.sql` apaga as tabelas do Supabase (as duas funções publicadas precisam ser apagadas à mão no painel).
* A **Poligonal** (`poligonal.html`) exige **conta logada**; quem decide se a pessoa ainda pode calcular é a Edge Function `usar-poligonal`. As 2 primeiras poligonais de cada conta são grátis; depois, só assinante ativo. O crédito é gasto no primeiro "Fechar Poligonal e Calcular" de cada poligonal (recalcular a mesma poligonal, com o mesmo ponto inicial, não gasta outro; "Limpar Tudo" começa uma nova). O contador vive em `profiles.poligonais_gratis_usadas` e é incrementado de forma atômica pela função SQL `consumir_poligonal_gratis` (só a `service_role` consegue chamá-la; a página inicial, os serviços e a conta mostram os créditos reais de quem está logado, via `obterCreditosPoligonal()` em `js/supabase-client.js`) — o limite fica numa constante só, `LIMITE_POLIGONAIS_GRATIS`, na Edge Function. O desenho ao vivo enquanto a pessoa digita é livre; o crédito controla o resultado (área, perímetro e erro de fechamento).
* **Exportação da poligonal** (`js/exportar-poligonal.js`): tudo é gerado no próprio navegador, sem dependências. O **DXF** (AutoCAD R12, só ASCII) sai nas mesmas coordenadas UTM zona 23S que a pessoa informou (não converte datum), com camadas `ZONEA_POLIGONAL`, `ZONEA_VERTICES` e `ZONEA_TEXTO`. O **KML/KMZ** converte UTM → latitude/longitude por série de Krüger (diferença de sub-milímetro contra o `pyproj`; SIRGAS 2000 e WGS84 diferem em centímetros, então serve pro Google Earth). A pessoa escolhe o **datum do memorial** (SIRGAS 2000 ou SAD-69) antes de baixar: com SAD-69, as coordenadas passam por uma translação geocêntrica de 3 parâmetros do IBGE (Resolução PR 1/2005: ΔX −67,35 m, ΔY +3,88 m, ΔZ −38,22 m, elipsoide GRS67) até o SIRGAS 2000 — sem isso o desenho cairia ~64 m fora do lugar na RMBH. É aproximada (erro de poucos metros), conferida contra o `pyproj` em sub-milímetro pro mesmo modelo, e só afeta o KML/KMZ. O KMZ é um ZIP sem compressão escrito à mão. O **DWG** não é gerado: é um formato proprietário da Autodesk. Os botões só ficam ativos quando os resultados na tela estão atualizados, e o último vértice repetido do fechamento é descartado no arquivo.
* **Pagamento** é via Mercado Pago (Checkout Pro), sem servidor próprio: `conta.html` chama a Edge Function `create-mp-preference` (Supabase) pra gerar o link de pagamento, e a Edge Function `mp-webhook` recebe a confirmação do Mercado Pago e ativa a assinatura automaticamente — ver `supabase/functions/`. O valor (R$ 9,90) e a validade (30 dias) ficam em `PRECO_ASSINATURA` e `DIAS_DE_ACESSO` em `create-mp-preference` (a validade também em `mp-webhook`); o valor do botão em `conta.html` e o texto da FAQ são escritos à mão, então mudar o preço exige atualizar os três e republicar a função. O webhook guarda cada notificação por pagamento **+ status** (o Pix chega como `pending` e depois `approved`; guardar só o id ignorava a aprovada).
* **Busca por endereço/CEP** (`js/busca-endereco.js`, usada por `js/mapa.js`): tudo no navegador, sem servidor nosso. CEP → [BrasilAPI](https://brasilapi.com.br) só pro **endereço** (rua, bairro, cidade; o ViaCEP é a reserva) e a **posição** vem de geocodificar essa rua no Nominatim, na cidade do CEP — a coordenada que a BrasilAPI devolve costuma ser só o centro do município (todo CEP de BH vem como a Praça Sete), então ela só é usada como último recurso, e a página avisa que o ponto é o centro da cidade; endereço → [Nominatim](https://nominatim.org) do OpenStreetMap, limitado à caixa da RMBH (`bounded=1`) pra não cair numa rua homônima de outro estado. Com a coordenada, um ponto-em-polígono contra `data/rmbh-municipios.geojson` descobre o município e o mapa mostra o mesmo card do clique. Limites conhecidos: o CEP localiza rua/bairro, não o terreno; o Nominatim é fraco em número de casa e o uso gratuito é só pra volume baixo (~1 consulta/s, com atribuição ao OpenStreetMap) — se o Zonea crescer, trocar por um geocodificador pago ou próprio. O texto que vem dos serviços é sempre inserido como texto (nunca HTML), e a página avisa que o que a pessoa digita é enviado a esses serviços.
* **Mapa** (`mapa.html` + `js/mapa.js`): usa [Leaflet](https://leafletjs.com) sobre tiles do OpenStreetMap e uma malha de limites municipais derivada de dados abertos do IBGE (`data/rmbh-municipios.geojson`). Reaproveita a mesma função de renderização de card da busca (`renderMunicipioCard`, em `js/script.js`), então o card é idêntico nos dois lugares.

---

## Mapa dos arquivos do projeto

```text
/
├── index.html         # Página principal — busca de municípios (livre)
├── mapa.html           # Mapa interativo dos 34 municípios da RMBH (livre)
├── servicos.html      # Sobre o Zonea, casos de uso e chamada para criar conta
├── conhecimento.html  # Glossário técnico + índice dos artigos práticos
├── conhecimento/
│   ├── calcular-area-perimetro-poligonal.html   # Guia: azimute/distância → coordenadas, área e perímetro
│   ├── erro-fechamento-poligonal.html           # Guia: o que é erro de fechamento e como corrigir
│   └── memorial-descritivo.html                 # Guia: o que é um memorial descritivo e quando é exigido
├── poligonal.html     # Ferramenta que desenha a poligonal automaticamente (2 grátis por conta, depois assinatura)
├── faq.html           # Perguntas frequentes
├── conta.html          # Cadastro, login e status da assinatura
├── css/
│   └── estilo.css     # Todo o visual do site (cores, fontes, layout)
├── js/
│   ├── script.js            # Busca, menu, guard de páginas restritas e outras funções gerais
│   ├── mapa.js               # Lógica do mapa interativo (Leaflet + malha do IBGE)
│   ├── busca-endereco.js     # Busca por endereço/CEP: BrasilAPI, ViaCEP, Nominatim e ponto-em-polígono (funções puras)
│   ├── poligonal.js         # Lógica da ferramenta de poligonal (cálculos e desenho)
│   ├── exportar-poligonal.js # Gera os arquivos DXF, KML e KMZ da poligonal (funções puras, sem dependências)
│   ├── supabase-client.js   # Inicialização do client Supabase (usado em toda página)
│   └── auth.js               # Cadastro (senha dupla + checklist), login, recuperação de senha e pagamento, só em conta.html
├── docs/
│   └── pesquisa-lotes-belo-horizonte.md  # O que BH publica sobre lotes (dados abertos x GeoServer) e o que dá pra fazer
├── data/
│   ├── municipios.json         # Os 34 municípios: dados públicos + portal oficial auditado de cada um
│   ├── config.json             # Configurações gerais (ex: número do WhatsApp)
│   └── rmbh-municipios.geojson # Malha dos limites dos 34 municípios (derivada de dados abertos do IBGE)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                     # Schema inicial (tabelas + Row Level Security)
│   │   ├── 0002_preview_gratis.sql           # (histórico) Tabela da antiga consulta gratuita por dispositivo — removida na 0006
│   │   ├── 0003_leads_interesse.sql          # (histórico) Tabela da antiga captura de contato — removida na 0006
│   │   ├── 0004_mapa_demo_bh.sql             # (histórico) Flag is_demo da antiga regra "Belo Horizonte grátis" — removida na 0006
│   │   ├── 0005_poligonais_gratis.sql        # Contador de poligonais grátis por conta + função atômica de consumo
│   │   └── 0006_remove_trava_por_municipio.sql # Apaga as tabelas da antiga trava por município
│   ├── email-templates/
│   │   ├── confirmar-cadastro.html           # E-mail de confirmação de cadastro em português (colar no Supabase > Authentication > Emails)
│   │   └── redefinir-senha.html              # E-mail "Esqueci minha senha" em português
│   └── functions/
│       ├── create-mp-preference/index.ts     # Gera o link de pagamento (Mercado Pago Checkout Pro)
│       ├── usar-poligonal/index.ts           # Controla o uso da Poligonal: 2 grátis por conta, depois assinatura
│       └── mp-webhook/index.ts               # Recebe a confirmação de pagamento e ativa a assinatura
├── .github/workflows/
│   └── mirror-hostinger.yml      # Espelha automaticamente todo push em main pro repositório de deploy
├── .htaccess           # Manda o navegador conferir o HTML antes de usar a cópia guardada (Cache-Control no-cache)
├── robots.txt          # Diretivas de indexação para buscadores
├── sitemap.xml          # Mapa do site para SEO
├── img/                # Logo, ícones e imagens
├── marketing/          # Material de divulgação — não faz parte do site em si
│   ├── prints/          # Capturas de tela para redes sociais
│   ├── story-export/    # Stories exportados (Instagram)
│   ├── ads/              # Conceitos de anúncio (Design Canvas — .dc.html editáveis + PNGs finais)
│   └── ad-assets/        # Material de apoio dos anúncios (recortes de tela, variações de logo)
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

Depois, acesse `http://localhost:8000/servicos.html` no navegador (busca, mapa e artigos são livres; a ferramenta de poligonal exige uma conta logada — crie uma em `conta.html`; as 2 primeiras poligonais são grátis, e isso depende do Supabase estar no ar).

---

## Deploy

O site é hospedado na Hostinger. O fluxo é: você trabalha e dá push neste repositório (`zonea`) — o workflow `.github/workflows/mirror-hostinger.yml` espelha automaticamente todo push na branch `main` para um segundo repositório (`zonea-hostinger`), que é o que a Hostinger está de fato conectada para publicar. Não existe build nem deploy manual: um `git push` aqui já é suficiente pro site novo ir ao ar.

**Cache dos arquivos:** a Hostinger entrega `.js` e `.css` com validade de 7 dias, então quem já visitou o site continuaria com a cópia velha. Por isso todo `<script>` e `<link>` de arquivo do site leva uma versão no endereço (`js/auth.js?v=20260924g`). **Ao mudar qualquer `.js` ou `.css`, troque essa versão em todas as páginas HTML** (uma busca e substituição resolve). O HTML em si não precisa disso: o `.htaccess` manda o navegador conferir sempre.

**Configuração que vive no painel (não no código):**

* **Supabase, Edge Functions:** a `mp-webhook` precisa ter **Verify JWT desligado** — quem a chama é o Mercado Pago, que não tem login do Zonea (com a opção ligada, o Supabase devolve 401 e nenhum pagamento ativa a assinatura). Secrets: `MP_ACCESS_TOKEN` (o token de **produção** do Mercado Pago, não o de teste). Qualquer mudança em `supabase/functions/` precisa ser publicada no painel; o push do GitHub não faz isso.
* **Supabase, e-mails de login:** SMTP próprio pelo Resend (`smtp.resend.com`, porta 465, usuário `resend`, remetente `nao-responder@zonea.com.br`, com o domínio `zonea.com.br` verificado no Resend via registros DNS na Hostinger) — o e-mail embutido do Supabase limita a ~2 por hora e derruba o cadastro. Modelos em português em `supabase/email-templates/`.
* **Supabase, URLs e senha:** Authentication > URL Configuration com **Site URL** `https://zonea.com.br` e **Redirect URLs** incluindo `https://zonea.com.br/conta.html` (pro link de recuperação de senha); Sign In / Providers > Email com as regras de senha do cadastro (mínimo 6, maiúscula, minúscula, número e símbolo).
* **Mercado Pago:** aplicação com as credenciais de produção ativadas e chave Pix cadastrada na conta que recebe (sem isso o Checkout não oferece Pix). A conta vendedora **não consegue pagar a si mesma** — pra testar, use outra pessoa ou outro banco.

---

## Para onde o projeto está indo

1. **Fase 1 — Base:** estrutura do site e catálogo dos municípios da RMBH. ✅
2. **Fase 2 — Dados confiáveis:** conferir e validar os portais de cada município. *(em andamento — 6 de 34 confirmados)*
3. **Fase 3 — Mapas:** visor interativo com os limites dos 34 municípios. ✅ *(camadas de zoneamento/WMS sobrepostas ainda não — ver Fase 5)*
4. **Fase 4 — Busca avançada:** encontrar o município e o portal certo por endereço ou CEP ✅ *(feito no mapa)*. A busca por **número de lote** ficou pendente: não existe cadastro nacional, cada prefeitura tem o seu (índice cadastral, inscrição imobiliária…), então depende de a prefeitura publicar os dados, município a município — a começar por Belo Horizonte, já pesquisada em `docs/pesquisa-lotes-belo-horizonte.md` (o portal de dados abertos publica o desenho dos lotes em CSV com licença CC-BY, mas o serviço com índice cadastral e endereço só aceita chamadas do site da PBH).
5. **Fase 5 — Inteligência territorial:** camadas geográficas (WMS/WFS) sobre o mapa, cruzamento de dados de diferentes fontes e relatórios automáticos.
6. **Fase 6 — Expansão:** levar o Zonea para outras regiões do Brasil, além da RMBH.

---

## Contato

Desenvolvido por **[Luiz Gustavo](https://www.luizgustavodev.com/)**.

Dúvidas, parcerias ou sugestões? Fale com a gente pelo WhatsApp disponível em qualquer página do site.

📍 Belo Horizonte / MG
