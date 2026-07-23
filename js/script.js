/* ============================================================
   ZONEA — Inteligência Territorial & Geoprocessamento da RMBH
   Script Principal Institucional, Gated Content & Decoupled Data
   ============================================================ */

// 1. CHECAGEM DE TOKEN DE ACESSO (GATED CONTENT)
const VALID_ACCESS_TOKENS = new Set(['luiz1701_active', 'active', 'true']);

function hasValidToken() {
  const token = localStorage.getItem('zonea_access_token');
  const legacyAccess = localStorage.getItem('zonea_acesso_liberado') === 'true';
  return VALID_ACCESS_TOKENS.has(token) || legacyAccess;
}

// Guard de Redirecionamento da Home
const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
if (isHomePage && !hasValidToken()) {
  window.location.href = 'servicos.html?access_required=1';
}

let MUNICIPIOS = [];
let CONFIG = { whatsapp: '5531992609970' }; // fallback caso data/config.json não carregue

function normalize(str) {
  // remove marcas diacríticas (acentos) resultantes da decomposição NFD:
  // ocupam a faixa Unicode 0x0300–0x036F (Combining Diacritical Marks)
  const stripped = Array.from(str.normalize('NFD'))
    .filter(ch => { const code = ch.codePointAt(0); return code < 0x0300 || code > 0x036f; })
    .join('');
  return stripped.toLowerCase().trim();
}

function buildWhatsappLink(message) {
  const base = `https://api.whatsapp.com/send/?phone=${CONFIG.whatsapp}`;
  return message ? `${base}&text=${encodeURIComponent(message)}` : base;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 2. CARREGAMENTO ASSÍNCRONO DOS DADOS (DECOUPLED JSON)
  try {
    const [municipiosRes, configRes] = await Promise.all([
      fetch('data/municipios.json'),
      fetch('data/config.json'),
    ]);
    if (!municipiosRes.ok) throw new Error(`Erro HTTP: ${municipiosRes.status}`);
    MUNICIPIOS = await municipiosRes.json();
    if (configRes.ok) CONFIG = await configRes.json();
  } catch (err) {
    console.error('Erro ao carregar dados iniciais do Zonea:', err);
  }

  // Número de WhatsApp centralizado: aplicado a todos os botões flutuantes da página
  document.querySelectorAll('.whatsapp-float-btn').forEach(el => {
    el.href = buildWhatsappLink();
  });

  renderQuickLinks();

  // 3. MENU MOBILE
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const isOpen = navLinks.classList.contains('open');
      mobileMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // 4. HEADER BOTÃO DE BLOQUEIO / LICENÇA
  const btnLockToggle = document.getElementById('btnLockToggle');
  const btnClearToken = document.getElementById('btnClearToken');
  function updateHeaderLockUI() {
    if (!btnLockToggle) return;
    if (hasValidToken()) {
      btnLockToggle.classList.add('unlocked');
      btnLockToggle.innerHTML = '<span>🔓 Assinante Ativo</span>';
      btnLockToggle.title = 'Sessão institucional ativa. Clique para encerrar.';
    } else {
      btnLockToggle.classList.remove('unlocked');
      btnLockToggle.innerHTML = '<span>🔒 Acesso Restrito</span>';
      btnLockToggle.title = 'Clique para ativar sua licença.';
    }
  }

  if (btnLockToggle) {
    btnLockToggle.addEventListener('click', () => {
      if (hasValidToken()) {
        if (confirm('Deseja encerrar sua sessão de assinante no Zonea?')) {
          localStorage.removeItem('zonea_access_token');
          localStorage.removeItem('zonea_acesso_liberado');
          window.location.href = 'servicos.html';
        }
      } else {
        window.location.href = 'servicos.html#unlock-card';
      }
    });
  }
  updateHeaderLockUI();

  // 5. ÁREA DE ATIVAÇÃO NA PÁGINA DE SERVIÇOS
  const tokenInput = document.getElementById('tokenInput');
  const btnActivateToken = document.getElementById('btnActivateToken');
  const activationMessage = document.getElementById('activationMessage');
  const accessStatusBadge = document.getElementById('access-status-badge');

  function showActivationMessage(state, html) {
    if (!activationMessage) return;
    activationMessage.className = `activation-message ${state}`;
    activationMessage.style.display = 'block';
    activationMessage.innerHTML = html;
  }

  if (btnClearToken) {
    btnClearToken.addEventListener('click', () => {
      if (tokenInput) tokenInput.value = '';
      if (activationMessage) {
        activationMessage.style.display = 'none';
        activationMessage.innerHTML = '';
      }
    });
  }

  if (tokenInput && btnActivateToken) {
    if (hasValidToken()) {
      if (accessStatusBadge) {
        accessStatusBadge.textContent = '🔓 LICENÇA ATIVA';
        accessStatusBadge.style.background = '#D4EDDA';
        accessStatusBadge.style.color = '#155724';
        accessStatusBadge.style.borderColor = '#C3E6CB';
      }
      tokenInput.value = 'luiz1701';
      tokenInput.disabled = true;
      btnActivateToken.innerHTML = '<span>Acessar Painel (Início) →</span>';
      btnActivateToken.style.backgroundColor = 'var(--cor-verde)';
      btnActivateToken.onclick = () => { window.location.href = 'index.html'; };
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('access_required')) {
        showActivationMessage('warn', '⚠️ <strong>Aviso de Acesso Restrito:</strong> A consulta aos geodados dos 34 municípios exige uma chave de licença ativa. Digite a senha no campo acima para liberar o acesso ao painel.');
      }

      function executeActivation() {
        const pwd = tokenInput.value.trim();
        if (pwd === 'luiz1701') {
          localStorage.setItem('zonea_access_token', 'luiz1701_active');
          localStorage.setItem('zonea_acesso_liberado', 'true');
          showActivationMessage('ok', '✓ <strong>Acesso Autorizado!</strong> Licença validada com sucesso. Redirecionando para o painel de consulta...');
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 800);
        } else {
          showActivationMessage('error', '❌ <strong>Chave Incorreta:</strong> Confira sua licença ou fale com nossa equipe via WhatsApp para receber uma chave de acesso.');
        }
      }

      btnActivateToken.addEventListener('click', executeActivation);
      tokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeActivation();
        }
      });
    }
  }

  // 6. AUTOCOMPLETE E FORMULÁRIO DE CONSULTA (HOME)
  const input = document.getElementById('municipio');
  const suggestionsEl = document.getElementById('suggestions');
  const statusEl = document.getElementById('status');
  const form = document.getElementById('geoForm');
  const clearBtn = document.getElementById('clearMunicipio');

  let activeIndex = -1;

  function closeSuggestions() {
    activeIndex = -1;
    suggestionsEl.classList.remove('open');
    suggestionsEl.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function updateClearButton() {
    if (clearBtn) clearBtn.classList.toggle('visible', input.value.length > 0);
  }

  function clearSearch() {
    input.value = '';
    closeSuggestions();
    updateClearButton();
    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.className = 'status-message';
    }
    input.focus();
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearSearch);
  }

  if (input && suggestionsEl) {
    input.addEventListener('input', () => {
      const q = normalize(input.value);
      activeIndex = -1;
      updateClearButton();
      if (!q) {
        closeSuggestions();
        return;
      }

      const matches = MUNICIPIOS.filter(m => normalize(m.nome).includes(q));
      if (matches.length === 0) {
        closeSuggestions();
        return;
      }

      suggestionsEl.innerHTML = matches.map((m, i) => `
        <div class="suggestion-row" role="option" id="suggestion-${i}" data-nome="${m.nome}" data-index="${i}">
          <span>${m.nome}</span>
          <span class="tag ${m.confirmado ? 'confirmado' : 'busca-direta'}">
            ${m.confirmado ? 'Confirmado' : 'Busca Direta'}
          </span>
        </div>
      `).join('');

      suggestionsEl.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    });

    // Navegação por teclado
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSuggestions();
        return;
      }

      const rows = suggestionsEl.querySelectorAll('.suggestion-row');
      if (!suggestionsEl.classList.contains('open') || rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % rows.length;
        updateSelectedRow(rows);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + rows.length) % rows.length;
        updateSelectedRow(rows);
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        input.value = rows[activeIndex].dataset.nome;
        closeSuggestions();
        updateClearButton();
        if (form) form.requestSubmit();
      }
    });

    function updateSelectedRow(rows) {
      rows.forEach((r, idx) => {
        r.classList.toggle('selected', idx === activeIndex);
      });
      input.setAttribute('aria-activedescendant', activeIndex >= 0 ? `suggestion-${activeIndex}` : '');
    }

    suggestionsEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-nome]');
      if (row) {
        input.value = row.dataset.nome;
        closeSuggestions();
        updateClearButton();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.input-wrapper')) {
        closeSuggestions();
      }
    });
  }

  // 7. SUBMISSÃO DO FORMULÁRIO & REFINAMENTO DE RESULTADOS
  if (form && input && statusEl) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) {
        statusEl.innerHTML = '<div class="status-message warn visible">Informe um município da RMBH para consultar a fonte oficial.</div>';
        statusEl.className = 'status-message visible';
        return;
      }

      const found = MUNICIPIOS.find(m => normalize(m.nome) === normalize(val));
      if (!found) {
        statusEl.innerHTML = `<div class="status-message error visible">"${val}" não faz parte dos 34 municípios cadastrados da RMBH.</div>`;
        statusEl.className = 'status-message visible';
        return;
      }

      if (found.confirmado && found.link) {
        statusEl.innerHTML = `
          <div class="result-card confirmed">
            <div class="result-card-head">
              <span class="result-card-title">✓ Portal Oficial Confirmado — ${found.nome} (${found.sistema})</span>
              <span class="tag confirmado">FONTE AUDITADA</span>
            </div>

            <p class="result-card-desc">Resumo dos dados e camadas urbanísticas mapeadas para este município:</p>

            <div class="tech-details-box">
              📋 <strong>DETALHES TÉCNICOS:</strong> ${found.detalhes_tecnicos || 'Acesso liberado ao geoportal oficial.'}
            </div>

            <a href="${found.link}" target="_blank" rel="noopener noreferrer" class="result-cta primary">
              <span>Acessar Portal Oficial (${found.sistema}) →</span>
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>
          </div>
        `;
        statusEl.className = 'status-message visible';
      } else {
        const whatsappHref = buildWhatsappLink(`Olá! Necessito de acesso prioritário e catalogação técnica do município de ${found.nome} no Zonea.`);
        statusEl.innerHTML = `
          <div class="result-card pending">
            <div class="result-card-head">
              <span class="result-card-title">📍 Catalogação Técnica em Andamento — ${found.nome}</span>
              <span class="tag busca-direta">BUSCA DIRETA</span>
            </div>

            <p class="result-card-desc">Portal oficial em fase de catalogação técnica. Necessita de acesso prioritário? Entre em contato com nossa equipe.</p>

            <div class="tech-details-box">
              ⚙️ <strong>STATUS TÉCNICO:</strong> ${found.detalhes_tecnicos || 'Catalogação sob demanda via equipe técnica.'}
            </div>

            <a href="${whatsappHref}" target="_blank" rel="noopener noreferrer" class="result-cta whatsapp">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.445 4.43-9.874 9.876-9.874 2.637 0 5.115 1.028 6.977 2.89 1.861 1.862 2.887 4.341 2.886 6.979 0 5.447-4.431 9.877-9.878 9.877m0-18.147c-4.561 0-8.272 3.711-8.272 8.27 0 1.58.45 3.09 1.299 4.391l.2.311-.587 2.148 2.199-.577.301.179a8.23 8.23 0 004.858 1.549h.004c4.559 0 8.27-3.712 8.271-8.271.001-2.207-.857-4.282-2.42-5.845a8.212 8.212 0 00-5.853-2.427"/></svg>
              <span>Solicitar Acesso Prioritário via WhatsApp</span>
            </a>
          </div>
        `;
        statusEl.className = 'status-message visible';
      }
    });
  }

  // 8. FAQ ACCORDION E CATEGORIAS (PÁGINA FAQ)
  const faqQuestions = document.querySelectorAll('.faq-question');
  const catButtons = document.querySelectorAll('.cat-btn');
  const faqGroups = document.querySelectorAll('.faq-group');

  if (faqQuestions.length > 0) {
    faqQuestions.forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const isOpen = item.classList.contains('open');

        const group = item.closest('.faq-group');
        if (group) {
          group.querySelectorAll('.faq-item').forEach(other => {
            if (other !== item) {
              other.classList.remove('open');
              const otherBtn = other.querySelector('.faq-question');
              if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
            }
          });
        }

        item.classList.toggle('open');
        btn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    });
  }

  if (catButtons.length > 0 && faqGroups.length > 0) {
    catButtons.forEach(catBtn => {
      catBtn.addEventListener('click', () => {
        const targetCategory = catBtn.getAttribute('data-category');

        catButtons.forEach(b => b.classList.remove('active'));
        catBtn.classList.add('active');

        faqGroups.forEach(group => {
          const groupCat = group.getAttribute('data-group-category');
          if (targetCategory === 'all' || groupCat === targetCategory) {
            group.style.display = 'block';
          } else {
            group.style.display = 'none';
          }
        });
      });
    });
  }
});

// 9. BOTÕES DE ACESSO RÁPIDO — gerados a partir de data/municipios.json
// (municípios com confirmado:true), em vez de hardcoded no HTML, para que
// novas confirmações de portal oficial apareçam automaticamente aqui.
function renderQuickLinks() {
  const quickLinksEl = document.querySelector('.quick-buttons');
  if (!quickLinksEl || MUNICIPIOS.length === 0) return;

  const destaque = MUNICIPIOS.filter(m => m.confirmado).slice(0, 4);
  quickLinksEl.innerHTML = destaque
    .map(m => `<button type="button" class="quick-link-btn" data-muni="${m.nome}" aria-label="Consultar dados oficiais de ${m.nome}">${m.nome}</button>`)
    .join('');

  // delegação de evento: sobrevive a re-renderizações da lista
  quickLinksEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-link-btn');
    if (!btn) return;
    const input = document.getElementById('municipio');
    const form = document.getElementById('geoForm');
    const clearBtn = document.getElementById('clearMunicipio');
    if (input && form) {
      input.value = btn.getAttribute('data-muni');
      if (clearBtn) clearBtn.classList.add('visible');
      form.requestSubmit();
    }
  });
}
