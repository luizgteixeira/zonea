/* script.js - Inteligência de busca e interações para o Portal Zonea */

// Base de municípios da RMBH cadastrados
const MUNICIPIOS = [
  { nome: "Baldim", link: null },
  { nome: "Belo Horizonte", link: "https://prefeitura.pbh.gov.br/bhgeo" },
  { nome: "Betim", link: "https://www.betim.mg.gov.br/portal/secretarias-paginas/308/cartografia/" },
  { nome: "Brumadinho", link: null },
  { nome: "Caeté", link: null },
  { nome: "Capim Branco", link: null },
  { nome: "Confins", link: null },
  { nome: "Contagem", link: "https://geoprocessamento.contagem.mg.gov.br/sigm/" },
  { nome: "Esmeraldas", link: null },
  { nome: "Florestal", link: null },
  { nome: "Ibirité", link: null },
  { nome: "Igarapé", link: null },
  { nome: "Itaguara", link: null },
  { nome: "Itatiaiuçu", link: null },
  { nome: "Jaboticatubas", link: null },
  { nome: "Juatuba", link: null },
  { nome: "Lagoa Santa", link: null },
  { nome: "Mário Campos", link: null },
  { nome: "Mateus Leme", link: null },
  { nome: "Matozinhos", link: null },
  { nome: "Nova Lima", link: "https://novalima.mg.gov.br/cidadao/portal-servicos/servico/geopnl" },
  { nome: "Nova União", link: null },
  { nome: "Pedro Leopoldo", link: null },
  { nome: "Raposos", link: null },
  { nome: "Ribeirão das Neves", link: "https://ribeiraodasneves.mg.gov.br/src/pages/geoneves.html" },
  { nome: "Rio Acima", link: null },
  { nome: "Rio Manso", link: null },
  { nome: "Sabará", link: null },
  { nome: "Santa Luzia", link: "https://geo.santaluzia.mg.gov.br" },
  { nome: "São Joaquim de Bicas", link: null },
  { nome: "São José da Lapa", link: null },
  { nome: "Sarzedo", link: null },
  { nome: "Taquaraçu de Minas", link: null },
  { nome: "Vespasiano", link: null },
];

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('municipio');
  const suggestionsEl = document.getElementById('suggestions');
  const statusEl = document.getElementById('status');
  const form = document.getElementById('geoForm');
  const quickAccessButtons = document.querySelectorAll('.quick-link-btn');

  let activeIndex = -1;
  let currentMatches = [];

  // Normalização de string para busca sem acentos ou capitalização
  function normalizeString(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  // Renderizar a lista de sugestões de autocompletar
  function renderSuggestions(query) {
    const normalizedQuery = normalizeString(query);
    
    currentMatches = normalizedQuery
      ? MUNICIPIOS.filter(m => normalizeString(m.nome).includes(normalizedQuery))
      : [];
    
    activeIndex = -1;

    if (!currentMatches.length) {
      suggestionsEl.classList.remove('open');
      suggestionsEl.innerHTML = '';
      return;
    }

    suggestionsEl.innerHTML = currentMatches.map((m, i) => `
      <div data-index="${i}" class="suggestion-row">
        <span class="suggestion-name">${m.nome}</span>
        <span class="tag ${m.link ? 'confirmado' : 'busca-direta'}">
          ${m.link ? 'confirmado' : 'busca direta'}
        </span>
      </div>
    `).join('');
    
    suggestionsEl.classList.add('open');
  }

  // Preencher input e limpar sugestões
  function selectMunicipio(m) {
    input.value = m.nome;
    suggestionsEl.classList.remove('open');
    statusEl.classList.remove('visible');
    statusEl.className = 'status';
  }

  // Listener para digitação no input
  input.addEventListener('input', () => {
    statusEl.classList.remove('visible');
    statusEl.className = 'status';
    renderSuggestions(input.value);
  });

  // Listener para cliques na caixa de sugestões
  suggestionsEl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-index]');
    if (!row) return;
    const m = currentMatches[Number(row.dataset.index)];
    selectMunicipio(m);
  });

  // Navegação por teclado nas sugestões (ArrowUp, ArrowDown, Enter)
  input.addEventListener('keydown', (e) => {
    const items = suggestionsEl.querySelectorAll('[data-index]');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        const m = currentMatches[activeIndex];
        selectMunicipio(m);
      }
    } else {
      return;
    }

    items.forEach((it, i) => {
      it.classList.toggle('active', i === activeIndex);
      if (i === activeIndex) {
        it.scrollIntoView({ block: 'nearest' });
      }
    });
  });

  // Fechar sugestões ao clicar fora do campo de pesquisa
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field-container')) {
      suggestionsEl.classList.remove('open');
    }
  });

  // Buscar município correspondente
  function findMunicipio(nome) {
    const normalizedQuery = normalizeString(nome);
    // Busca exata primeiro
    let found = MUNICIPIOS.find(m => normalizeString(m.nome) === normalizedQuery);
    if (!found) {
      // Busca por correspondência parcial
      found = MUNICIPIOS.find(m => normalizeString(m.nome).includes(normalizedQuery));
    }
    return found;
  }

  // Submissão do formulário
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = input.value.trim();
    
    if (!nome) {
      statusEl.textContent = 'Informe um município da RMBH para continuar.';
      statusEl.className = 'status warn visible';
      return;
    }

    const municipio = findMunicipio(nome);
    if (!municipio) {
      statusEl.textContent = `"${nome}" não está entre os 34 municípios da RMBH cadastrados.`;
      statusEl.className = 'status warn visible';
      return;
    }

    if (municipio.link) {
      statusEl.textContent = `Redirecionando para o portal oficial de geoprocessamento de ${municipio.nome}...`;
      statusEl.className = 'status ok visible';
      setTimeout(() => {
        window.open(municipio.link, '_blank');
        statusEl.textContent = '';
        statusEl.className = 'status';
      }, 800);
    } else {
      statusEl.textContent = `Portal específico de ${municipio.nome} ainda não confirmado nesta base.`;
      statusEl.className = 'status warn visible';
    }
  });

  // Acesso rápido via botões abaixo do campo
  quickAccessButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const nomeMuni = btn.getAttribute('data-muni');
      const found = MUNICIPIOS.find(m => m.nome === nomeMuni);
      if (found) {
        selectMunicipio(found);
        form.requestSubmit(); // Dispara o submit
      }
    });
  });
});
