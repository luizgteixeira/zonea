# SEO do Zonea: como o Google encontra o site

Este documento explica o que foi feito e, principalmente, **por quê**, para manter o que funciona e não estragar sem querer.

## A ideia da arquiteta que testou o Zonea

> "Eu sugiro que você coloque palavras-chave para o Google buscar, como *desenhar poligonal com coordenadas geográficas*."

Ela acertou no essencial: **as pessoas buscam do jeito que falam**, e o site precisa responder a essas frases. Duas coisas
mudaram a forma de fazer isso:

1. **A ferramenta é invisível para o Google.** Quem não tem login é redirecionado para a página de conta (que tem `noindex`),
   e o Google entra como visitante anônimo. Palavra-chave numa página que o Google não lê não adianta. Por isso existe uma
   **página pública** (`desenhar-poligonal.html`) feita para essas buscas, que explica a ferramenta e leva até ela.
2. **"Coordenadas geográficas" quase sempre significa latitude e longitude**, e a ferramenta trabalha em UTM. Para o texto ser
   verdade, criamos o **conversor de latitude/longitude para UTM** (`js/conversor-coordenadas.js`), que gera o bloco pronto para
   colar na ferramenta. Quem chega pela busca resolve o que procurava, em vez de sair frustrado.

## O que é indexado (e o que não é)

| Página | No Google? | Por quê |
|---|---|---|
| `desenhar-poligonal.html` | **Sim** (no sitemap) | Página pública da ferramenta: texto, conversor, FAQ, dados estruturados |
| `conhecimento/*.html` (4 artigos) | **Sim** | Respondem dúvidas específicas ("erro de fechamento", "memorial descritivo", "converter lat/long") |
| `index`, `mapa`, `servicos`, `faq`, `avaliacoes`, `conhecimento` | **Sim** | |
| `poligonal.html` | **Não** (`noindex`, fora do sitemap) | Exige conta; o redirecionamento faria o Google indexar o login |
| `conta.html` | **Não** (`noindex`) | Área da conta |

**Cuidado ao criar páginas novas:** a trava da ferramenta (`js/script.js`) compara o nome **inteiro** do arquivo. Antes ela usava
"termina em `poligonal.html`", e `desenhar-poligonal.html` **também termina assim**, então a página pública foi mandada para o
login sem ninguém perceber. Se um dia criar outra página cujo nome termine em `poligonal.html`, ela não cai mais na trava, mas
vale conferir.

## Palavras-chave: o que funciona e o que não

* **A "meta keywords" é ignorada pelo Google** desde 2009. Não adianta preencher.
* O que pesa: o **título** (`<title>`), a **descrição** (`meta description`), o **H1** e os **subtítulos**, o **texto** da página, e
  **links** de outras páginas do próprio site com um texto que descreva o destino.
* **Uma página para cada intenção.** "Desenhar poligonal a partir de coordenadas" (página pública) e "converter lat/long para UTM"
  (artigo) são buscas diferentes, com respostas diferentes.
* **Não empilhe palavra-chave.** O Google penaliza texto forçado. A página pública repete "poligonal" em ~1,7% das palavras, bem
  abaixo do limite em que começa a parecer spam.

## Mapa de buscas → páginas

| Alguém busca... | A página que responde |
|---|---|
| desenhar poligonal online / a partir de coordenadas | `desenhar-poligonal.html` |
| calcular área do terreno pelas coordenadas | `desenhar-poligonal.html`, `conhecimento/calcular-area-perimetro-poligonal.html` |
| converter latitude e longitude para UTM | `desenhar-poligonal.html#conversor`, `conhecimento/coordenadas-geograficas-para-utm.html` |
| graus minutos segundos para UTM | `conhecimento/coordenadas-geograficas-para-utm.html` |
| erro de fechamento poligonal | `conhecimento/erro-fechamento-poligonal.html` |
| o que é memorial descritivo | `conhecimento/memorial-descritivo.html` |
| poligonal para DXF / KML / Google Earth | `desenhar-poligonal.html` |
| geoportal / mapa de município da RMBH | `mapa.html`, `index.html` |
| achar município por endereço ou CEP | `mapa.html` |

## Regras para manter o SEO saudável

1. **Cada página tem: um `<title>` de até ~60–70 caracteres, uma `meta description` de 70–160 e exatamente um `<h1>`.**
2. **Páginas de conteúdo têm `canonical`** (as de `conhecimento/` e a página pública já têm).
3. **Toda `<img>` tem `alt`** que descreva a imagem.
4. **Sitemap:** só entram páginas indexáveis; ao criar uma página nova, adicione ao `sitemap.xml`; ao tirar uma, remova.
5. **Não marque as avaliações do próprio site com `AggregateRating`/`Review`:** o Google não mostra estrelas para avaliações que a
   empresa coleta sobre si mesma, e o uso indevido pode gerar penalidade.
6. **Links internos usam o texto que descreve o destino** ("como calcular área e perímetro", e não "clique aqui").
7. Depois de publicar mudanças grandes, no **Google Search Console**: reenvie o `sitemap.xml` e use "Inspecionar URL → Solicitar
   indexação" nas páginas novas. Leva de dias a semanas para aparecer; SEO não é instantâneo.

## Como conferir

Há uma checagem automática usada nesta mudança (títulos, descrições, H1, canonical, dados estruturados, imagens sem `alt`, links
internos quebrados, coerência do sitemap). Se algo aparecer fora do padrão, é o mesmo conjunto de regras acima.

Para ver como o Google lê uma página: Search Console → **Inspeção de URL → Testar URL ativa → Ver página testada**.
