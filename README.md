
# Zonea — Inteligência Territorial

> **Slogan:** Informação urbanística direto da fonte.
> **Princípio:** Consulte. Compreenda. Planeje.

O **Zonea** é uma plataforma de consulta e exploração de dados territoriais, urbanísticos e georreferenciados. Ele atua como uma **camada de descoberta e organização**, facilitando o acesso a informações oficiais distribuídas em diversos portais municipais e sistemas de geoprocessamento.

---

## 🗺️ Propósito e Escopo

O projeto busca reduzir a fragmentação de dados urbanísticos, conectando profissionais e cidadãos diretamente às bases públicas oficiais (WMS, WFS, GeoJSON, etc.) sem substituir os sistemas de origem.

* **Foco Inicial:** Região Metropolitana de Belo Horizonte (RMBH).
* **Cobertura:** 34 municípios cadastrados, com portais de alta prioridade já integrados (BHGeo, SIGM, GeoPNL, entre outros).
* **Público-alvo:** Profissionais de planejamento urbano, arquitetos, engenheiros, analistas territoriais e cidadãos interessados em dados municipais.

---

## 🚀 Funcionalidades Atuais

* **Busca Inteligente:** Autocomplete acessível (padrão ARIA combobox), com normalização de strings (ignora acentos e maiúsculas) e navegação completa por teclado (setas, Enter, Esc).
* **Botão de Limpar:** Reseta o campo de busca e o resultado exibido (portal confirmado ou pendente) com um clique.
* **Acesso Rápido:** Atalhos para os municípios com portal já confirmado, gerados dinamicamente a partir de `data/municipios.json`.
* **Status de Transparência:** Diferenciação visual entre **"Portal Confirmado"** (link validado) e **"Busca Direta"** (município cadastrado, mas sem link validado no código atual).
* **Central de Conhecimento:** Glossário técnico interativo com os principais conceitos de geoprocessamento e padrões OGC (WMS, WFS, GeoServer, ArcGIS REST, GeoJSON, SIG).
* **Acesso por Licença:** Camada de ativação de acesso à Home, validada no cliente — fale com a equipe via WhatsApp para obter uma chave de teste.
* **Acessibilidade:** Navegação por teclado, `aria-label`/`aria-expanded` sincronizados nos componentes interativos e respeito a `prefers-reduced-motion`.
* **Suporte Integrado:** Botão flutuante do **WhatsApp** (número centralizado em `data/config.json`) para contato direto e suporte técnico.

---

## 🎨 Design System e Identidade

A interface do Zonea foi projetada para transmitir **confiança, precisão e tecnologia**, utilizando uma estética limpa inspirada em cartografia.

* **Cores Oficiais:** Azul (#1E5AA8) e Verde (#2E8B57).
* **Tipografia:** `Plus Jakarta Sans` para conteúdos institucionais e `JetBrains Mono` para dados técnicos e microtipografia.
* **Estética Técnica:** Fundo sutil composto por **linhas de coordenadas geográficas** e uma marca d'água cartográfica leve (WebP), desativada em telas pequenas para poupar banda.

---

## 🛠️ Tecnologias e Padrões

O projeto utiliza uma arquitetura de frontend estático, preparada para evoluções em geoprocessamento:

* **Frontend:** HTML5 semântico, CSS3 (Variables, Grid, Flexbox) e Vanilla JavaScript — sem dependências ou build step.
* **Dados desacoplados:** Catálogo de municípios (`data/municipios.json`) e configurações institucionais (`data/config.json`) carregados via `fetch`, fora da lógica de interface.
* **SEO:** Open Graph em todas as páginas e dados estruturados `FAQPage` (JSON-LD) na página de dúvidas.
* **Geotecnologias (Roadmap):** Suporte planejado para GeoJSON, WFS, WMS, ArcGIS REST Services e integração com GeoServer.

---

## 🏗️ Estrutura do Projeto

```text
/
├── index.html         # Painel de consulta principal (acesso por licença)
├── servicos.html      # Módulos, casos de uso e ativação de licença
├── conhecimento.html  # Central de Conhecimento — glossário técnico SIG
├── faq.html           # Dúvidas frequentes (com schema FAQPage)
├── css/
│   └── estilo.css     # Design System e regras visuais
├── js/
│   └── script.js      # Busca, autocomplete, licença e integrações
├── data/
│   ├── municipios.json  # Catálogo dos 34 municípios da RMBH
│   └── config.json      # Configurações institucionais (ex.: WhatsApp)
├── img/               # Ativos visuais e cartográficos
└── README.md
```

---

## ▶️ Como executar localmente

O projeto não tem build step, mas os dados são carregados via `fetch`, então **abrir os arquivos `.html` direto no navegador (`file://`) não funciona** — o navegador bloqueia a requisição por CORS. Sirva a pasta com um servidor estático simples:

```bash
# Python
python -m http.server 8000

# Node (sem instalação)
npx serve .
```

Depois acesse `http://localhost:8000/servicos.html` (a Home exige uma chave de licença ativa — peça uma à equipe).

---

## 🗺️ Roadmap de Evolução

1. **Fase 1 — Fundação:** Estrutura inicial e catálogo da RMBH.
2. **Fase 2 — Dados Territoriais:** Validação de portais e organização de metadados.
3. **Fase 3 — Visualização:** Implementação de mapas interativos e camadas geográficas.
4. **Fase 4 — Pesquisa Avançada:** Consultas por CEP, endereço, lote e índice cadastral.
5. **Fase 5 — Inteligência Territorial:** Cruzamento de dados e relatórios automatizados.
6. **Fase 6 — Expansão Nacional:** Cobertura de outras regiões brasileiras.

---

## 📞 Contato e Desenvolvimento

Desenvolvido por **[Luiz Gustavo](https://www.luizgustavodev.com/)**. Para parcerias, sugestões ou suporte, utilize o canal oficial via WhatsApp disponível na plataforma.

**Localização Técnica:** 19.9167° S, 43.9345° W · BELO HORIZONTE / MG.
