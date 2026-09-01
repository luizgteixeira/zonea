/* ============================================================
   ZONEA — Inteligência Territorial & Geoprocessamento da RMBH
   Script Principal Institucional, Gated Content & Decoupled Data
   ============================================================ */

// 1. GUARD DE ACESSO (GATED CONTENT) — sessão real via Supabase Auth
// A Home (index.html) é livre pra qualquer visitante: a busca funciona sem
// conta, com uma consulta grátis a um município confirmado por visitante
// (ver getDeviceId()/get-preview-municipio mais abaixo) — os dados sensíveis
// continuam protegidos por RLS no Supabase, não por esse redirecionamento.
// Só a Poligonal (ferramenta paga) continua exigindo login.
const isGatedPage = window.location.pathname.endsWith('poligonal.html');
if (isGatedPage) {
  getAssinaturaAtiva().then(({ ativa }) => {
    if (!ativa) {
      window.location.href = 'conta.html?access_required=1';
    }
  });
}

// Identificador anônimo por visitante (só um UUID aleatório guardado no
// navegador) — usado exclusivamente pra controlar a consulta gratuita de
// município confirmado (1 por visitante). Não é autenticação nem substitui
// login: é só a chave que a Edge Function get-preview-municipio usa pra
// saber se esse navegador já usou a cortesia.
function getDeviceId() {
  let id = localStorage.getItem('zonea_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('zonea_device_id', id);
  }
  return id;
}

let MUNICIPIOS = [];
let CONFIG = { whatsapp: '5531992609970' }; // fallback caso data/config.json não carregue
let dadosCarregadosComSucesso = true; // vira false se o fetch de municipios.json falhar

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

function escapeHtml(str) {
  const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

document.addEventListener('DOMContentLoaded', async () => {
  // 2. CARREGAMENTO ASSÍNCRONO DOS DADOS (DECOUPLED JSON — campos públicos)
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
    dadosCarregadosComSucesso = false;
  }

  // Sessão/assinatura do usuário — calculada uma única vez e reaproveitada
  // tanto para os dados protegidos (abaixo) quanto para o header (item 4).
  const assinatura = await getAssinaturaAtiva();

  // 2b. DADOS PROTEGIDOS (link, sistema, detalhes técnicos) — só para assinante
  // ativo, vindos do Supabase (tabela municipios_protegido, atrás de RLS) em
  // vez do arquivo estático, que só tem os campos públicos.
  if (assinatura.ativa) {
    try {
      const { data: protegidos, error } = await supabaseClient
        .from('municipios_protegido')
        .select('slug, link, sistema, detalhes_tecnicos, sistema_referencia, indisponivel, indisponivel_desde');
      if (error) throw error;
      const porSlug = new Map(protegidos.map(p => [p.slug, p]));
      MUNICIPIOS = MUNICIPIOS.map(m => ({ ...m, ...(porSlug.get(m.slug) || {}) }));
    } catch (err) {
      console.error('Erro ao carregar dados protegidos do Zonea:', err);
    }
  }

  // Número de WhatsApp centralizado: aplicado a todos os botões flutuantes da página,
  // já com uma mensagem padrão pra equipe saber do que se trata.
  document.querySelectorAll('.whatsapp-float-btn').forEach(el => {
    el.href = buildWhatsappLink('Olá! Estou no site do Zonea e gostaria de tirar uma dúvida.');
  });

  // Métricas do Hero (Home): total de municípios e fontes oficiais auditadas
  const metricTotal = document.getElementById('metricTotalMunicipios');
  const metricAuditadas = document.getElementById('metricFontesAuditadas');
  if (metricTotal) metricTotal.textContent = MUNICIPIOS.length;
  if (metricAuditadas) metricAuditadas.textContent = MUNICIPIOS.filter(m => m.confirmado).length;

  const metricsUpdated = document.getElementById('metricsUpdated');
  if (metricsUpdated && CONFIG.atualizado_em) {
    metricsUpdated.textContent = `Dados atualizados em ${CONFIG.atualizado_em}`;
  }

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

  // 4. HEADER BOTÃO DE SESSÃO — reflete sessão real do Supabase Auth
  const btnLockToggle = document.getElementById('btnLockToggle');

  function renderHeaderLockUI(session, ativa) {
    if (!btnLockToggle) return;
    if (session && ativa) {
      btnLockToggle.classList.add('unlocked');
      btnLockToggle.innerHTML = '<span>🔓 Assinante Ativo</span>';
      btnLockToggle.title = 'Assinatura ativa. Clique para encerrar sessão.';
    } else if (session) {
      btnLockToggle.classList.remove('unlocked');
      btnLockToggle.innerHTML = '<span>🔒 Assinatura Pendente</span>';
      btnLockToggle.title = 'Sua conta ainda não tem assinatura ativa. Clique para gerenciar.';
    } else {
      btnLockToggle.classList.remove('unlocked');
      btnLockToggle.innerHTML = '<span>🔒 Entrar</span>';
      btnLockToggle.title = 'Clique para entrar ou criar sua conta.';
    }
  }

  if (btnLockToggle) {
    btnLockToggle.addEventListener('click', async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        if (confirm('Deseja encerrar sua sessão no Zonea?')) {
          await supabaseClient.auth.signOut();
          window.location.href = 'servicos.html';
        }
      } else {
        window.location.href = 'conta.html';
      }
    });
  }

  renderHeaderLockUI(assinatura.session, assinatura.ativa);

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
        <div class="suggestion-row" role="option" id="suggestion-${i}" data-nome="${escapeHtml(m.nome)}" data-index="${i}">
          <span>${escapeHtml(m.nome)}</span>
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
        r.classList.toggle('active', idx === activeIndex);
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) {
        statusEl.innerHTML = '<div class="status-message warn visible">Informe um município da RMBH para consultar a fonte oficial.</div>';
        statusEl.className = 'status-message visible';
        return;
      }

      if (!dadosCarregadosComSucesso) {
        statusEl.innerHTML = '<div class="status-message error visible">⚠️ Não foi possível carregar a base de municípios agora — parece um problema de conexão, não do município buscado. Recarregue a página e tente novamente.</div>';
        statusEl.className = 'status-message visible';
        return;
      }

      let found = MUNICIPIOS.find(m => normalize(m.nome) === normalize(val));
      if (!found) {
        statusEl.innerHTML = `<div class="status-message error visible">"${escapeHtml(val)}" não faz parte dos 34 municípios cadastrados da RMBH.</div>`;
        statusEl.className = 'status-message visible';
        return;
      }

      let previaGratisConcedidaAgora = false;

      // Município já confirmado, mas ainda não temos os dados protegidos em memória
      // (visitante sem assinatura ativa) — tenta a consulta gratuita (1 por visitante,
      // controlada no servidor via Edge Function, não pelo navegador).
      if (found.confirmado && !found.link) {
        statusEl.innerHTML = '<div class="status-message ok visible">Consultando fonte oficial...</div>';
        statusEl.className = 'status-message visible';
        try {
          const { data, error } = await supabaseClient.functions.invoke('get-preview-municipio', {
            body: { deviceId: getDeviceId(), slug: found.slug },
          });
          if (!error && data?.allowed && data.municipio) {
            found = { ...found, ...data.municipio };
            previaGratisConcedidaAgora = true;
          }
        } catch (err) {
          console.error('Erro ao consultar prévia gratuita do Zonea:', err);
        }
      }

      if (found.confirmado && found.link) {
        const indisponivel = !!found.indisponivel;
        const reportarHref = buildWhatsappLink(`Olá! Notei que o portal de ${found.nome} parece estar fora do ar no Zonea, gostaria de reportar / ser avisado quando voltar.`);

        statusEl.innerHTML = `
          <div class="result-card confirmed">
            <div class="result-card-head">
              <span class="result-card-title">${indisponivel ? '⚠️' : '✓'} Portal Oficial ${indisponivel ? 'Temporariamente Indisponível' : 'Confirmado'} — ${escapeHtml(found.nome)} (${escapeHtml(found.sistema)})</span>
              <span class="tag confirmado">FONTE AUDITADA</span>
              ${indisponivel ? '<span class="tag indisponivel">FORA DO AR</span>' : ''}
            </div>

            ${previaGratisConcedidaAgora ? `
            <div class="status-message ok visible" style="margin-top: 0; margin-bottom: 16px;">
              🎁 <strong>Essa foi sua consulta gratuita.</strong> Para acessar outros municípios confirmados, <a href="conta.html">crie sua conta e assine</a>.
            </div>
            ` : ''}

            <p class="result-card-desc">Resumo dos dados e camadas urbanísticas mapeadas para este município:</p>

            <div class="tech-details-box">
              📋 <strong>DETALHES TÉCNICOS:</strong> ${escapeHtml(found.detalhes_tecnicos) || 'Acesso liberado ao geoportal oficial.'}
              ${found.sistema_referencia ? `<br>🗺️ <strong>SISTEMA GEORREFERENCIADO:</strong> ${escapeHtml(found.sistema_referencia)}` : ''}
            </div>

            ${indisponivel ? `
            <div class="status-message warn visible" style="margin-top: 0; margin-bottom: 16px;">
              ⚠️ <strong>Portal fora do ar no momento${found.indisponivel_desde ? ` (detectado em ${escapeHtml(found.indisponivel_desde)})` : ''}.</strong> Já auditamos e confirmamos este portal, mas a última checagem técnica não conseguiu resolver o endereço. O link abaixo pode não carregar até a prefeitura restabelecer o serviço.
            </div>
            ` : ''}

            <a href="${escapeHtml(found.link)}" target="_blank" rel="noopener noreferrer" class="result-cta primary">
              <span>Acessar Portal Oficial (${escapeHtml(found.sistema)}) →</span>
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>

            ${indisponivel ? `
            <a href="${reportarHref}" target="_blank" rel="noopener noreferrer" class="result-cta whatsapp" style="margin-top: 10px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.445 4.43-9.874 9.876-9.874 2.637 0 5.115 1.028 6.977 2.89 1.861 1.862 2.887 4.341 2.886 6.979 0 5.447-4.431 9.877-9.878 9.877m0-18.147c-4.561 0-8.272 3.711-8.272 8.27 0 1.58.45 3.09 1.299 4.391l.2.311-.587 2.148 2.199-.577.301.179a8.23 8.23 0 004.858 1.549h.004c4.559 0 8.27-3.712 8.271-8.271.001-2.207-.857-4.282-2.42-5.845a8.212 8.212 0 00-5.853-2.427"/></svg>
              <span>Avise-me quando o portal voltar</span>
            </a>
            ` : ''}
          </div>
        `;
        statusEl.className = 'status-message visible';
      } else if (found.confirmado) {
        // Município já auditado pelo Zonea, mas os campos protegidos (link,
        // detalhes técnicos) não vieram — ou a assinatura não está ativa, ou
        // houve erro ao buscá-los no Supabase (ver console).
        statusEl.innerHTML = `
          <div class="result-card confirmed">
            <div class="result-card-head">
              <span class="result-card-title">🔒 Portal Auditado — ${escapeHtml(found.nome)}</span>
              <span class="tag confirmado">FONTE AUDITADA</span>
            </div>

            <p class="result-card-desc">O Zonea já auditou o portal oficial de ${escapeHtml(found.nome)}, mas os detalhes completos (link direto e dados técnicos) exigem uma assinatura ativa.</p>

            <a href="conta.html" class="result-cta primary">
              <span>Ativar Assinatura →</span>
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </a>
          </div>
        `;
        statusEl.className = 'status-message visible';
      } else {
        const whatsappHref = buildWhatsappLink(`Olá! Necessito de acesso prioritário e catalogação técnica do município de ${found.nome} no Zonea.`);
        statusEl.innerHTML = `
          <div class="result-card pending">
            <div class="result-card-head">
              <span class="result-card-title">📍 Catalogação Técnica em Andamento — ${escapeHtml(found.nome)}</span>
              <span class="tag busca-direta">BUSCA DIRETA</span>
            </div>

            <p class="result-card-desc">Portal oficial em fase de catalogação técnica. Necessita de acesso prioritário? Entre em contato com nossa equipe.</p>

            <div class="tech-details-box">
              ⚙️ <strong>STATUS TÉCNICO:</strong> ${escapeHtml(found.detalhes_tecnicos) || 'Catalogação sob demanda via equipe técnica.'}
              ${found.sistema_referencia ? `<br>🗺️ <strong>SISTEMA GEORREFERENCIADO:</strong> ${escapeHtml(found.sistema_referencia)}` : ''}
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
        const item = btn.closest('.faq-item');
        if (!item) return;
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
    .map(m => `<button type="button" class="quick-link-btn" data-muni="${escapeHtml(m.nome)}" aria-label="Consultar dados oficiais de ${escapeHtml(m.nome)}">${escapeHtml(m.nome)}</button>`)
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
