
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

* **Busca Inteligente:** Autocomplete com normalização de strings (ignora acentos e maiúsculas).
* **Status de Transparência:** Diferenciação visual entre **"Portal Confirmado"** (link validado) e **"Busca Direta"** (município cadastrado, mas sem link validado no código atual).
* **Gated Content (Acesso Restrito):** Implementação de barreira de acesso experimental para validação de modelo de negócio (Senha de teste: `luiz1701`).
* **Acessibilidade:** Suporte total a navegação por teclado e respeito às preferências de movimento do sistema (`prefers-reduced-motion`).
* **Suporte Integrado:** Botão flutuante do **WhatsApp** para contato direto e suporte técnico.

---

## 🎨 Design System e Identidade

A interface do Zonea foi projetada para transmitir **confiança, precisão e tecnologia**, utilizando uma estética limpa inspirada em cartografia.

* **Cores Oficiais:** Azul (#1E5AA8) e Verde (#2E8B57).
* **Tipografia:** `Inter` para conteúdos institucionais e `JetBrains Mono` para dados técnicos e microtipografia.
* **Estética Técnica:** Fundo sutil composto por **linhas de coordenadas geográficas**, **curvas de nível em SVG** e uma imagem de **cartografia sistemática** como marca d'água.

---

## 🛠️ Tecnologias e Padrões

O projeto utiliza uma arquitetura de frontend estático, preparada para evoluções em geoprocessamento:

* **Frontend:** HTML5 semântico, CSS3 (Variables, Grid, Flexbox) e Vanilla JavaScript.
* **Geotecnologias (Roadmap):** Suporte planejado para GeoJSON, WFS, WMS, ArcGIS REST Services e integração com GeoServer.
* **Escalabilidade:** Migração planejada para separar o catálogo de municípios da lógica de interface via arquivos JSON.

---

## 🏗️ Estrutura do Projeto

```text
/
├── public/
│   ├── index.html        # Painel de consulta principal (Acesso restrito)
│   ├── servicos.html     # Landing page de serviços e conversão
│   ├── faq.html          # Central de ajuda e termos técnicos
│   ├── css/
│   │   └── estilo.css    # Design System e regras visuais
│   ├── js/
│   │   └── script.js     # Lógica de busca, autocomplete e redirecionamento
│   └── img/              # Ativos visuais e cartográficos
└── README.md
```

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
