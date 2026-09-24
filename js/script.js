/* ============================================================
   ZONEA — Inteligência Territorial & Geoprocessamento da RMBH
   Script Principal Institucional, Gated Content & Decoupled Data
   ============================================================ */

// 1. GUARD DE ACESSO — sessão real via Supabase Auth
// Busca, mapa e artigos são 100% livres (os dados dos municípios são públicos e
// vêm de data/municipios.json). A Poligonal (ferramenta paga) exige conta logada:
// as 2 primeiras poligonais são grátis e, depois, só assinante ativo. Quem decide
// isso é a Edge Function usar-poligonal (js/poligonal.js), não este redirecionamento
// — aqui só garantimos que existe uma conta pra contar os créditos.
// Só a página da ferramenta é fechada (exige conta). Comparar o nome inteiro: "desenhar-poligonal.html"
// (a página pública) também TERMINA em "poligonal.html" e não pode cair na trava.
const isGatedPage = /(^|\/)poligonal\.html$/.test(window.location.pathname);
if (isGatedPage) {
  getAssinaturaAtiva().then(({ session }) => {
    if (!session) {
      window.location.href = '/conta.html?access_required=1';
    }
  });
}

let MUNICIPIOS = [];
let CONFIG = { whatsapp: '5531992609970' }; // fallback caso data/config.json não carregue
let dadosCarregadosComSucesso = true; // vira false se o fetch de municipios.json falhar

// Promise que resolve quando MUNICIPIOS já está carregado (ver DOMContentLoaded
// abaixo). script.js e mapa.js escutam
// DOMContentLoaded separadamente — sem isso, mapa.js poderia ler MUNICIPIOS antes
// dele estar pronto. Páginas que precisam de MUNICIPIOS fora da busca (ex. o mapa)
// devem fazer `await window.zoneaDadosProntos;` antes de usá-lo.
let resolverZoneaDadosProntos;
window.zoneaDadosProntos = new Promise((resolve) => { resolverZoneaDadosProntos = resolve; });

// Substitui o confirm() do navegador por um aviso no estilo do site. Devolve uma Promise:
// true se a pessoa confirmou, false se cancelou (botão, Esc ou clique fora).
function confirmarZonea({ titulo, mensagem, confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'zonea-dialog';
    dlg.setAttribute('aria-labelledby', 'zoneaDialogTitulo');
    dlg.innerHTML = `
      <form method="dialog" class="zonea-dialog-corpo">
        <h2 id="zoneaDialogTitulo" class="zonea-dialog-titulo"></h2>
        <p class="zonea-dialog-msg"></p>
        <div class="zonea-dialog-acoes">
          <button type="submit" value="cancelar" class="btn-secondary" autofocus></button>
          <button type="submit" value="ok" class="zonea-dialog-ok"></button>
        </div>
      </form>`;
    dlg.querySelector('.zonea-dialog-titulo').textContent = titulo;
    dlg.querySelector('.zonea-dialog-msg').textContent = mensagem;
    const [btnCancelar, btnOk] = dlg.querySelectorAll('button');
    btnCancelar.textContent = cancelar;
    btnOk.textContent = confirmar;
    if (perigo) btnOk.classList.add('perigo');

    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    // clique no fundo escuro (fora da caixa) cancela
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancelar'); });

    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

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

// Renderiza o card de resultado de um município (confirmado com portal auditado /
// ainda não confirmado) dentro de `container`. Usado pela busca da Home e pelo
// mapa (js/mapa.js) — é a mesma decisão de estado nos dois lugares, baseada só em
// `found.confirmado`/`found.link`, ambos vindos de data/municipios.json.
function renderMunicipioCard(found, container) {
  let html;

  if (found.confirmado && found.link) {
    const indisponivel = !!found.indisponivel;
    const reportarHref = buildWhatsappLink(`Olá! Notei que o portal de ${found.nome} parece estar fora do ar no Zonea, gostaria de reportar / ser avisado quando voltar.`);

    html = `
      <div class="result-card confirmed">
        <div class="result-card-head">
          <span class="result-card-title">${indisponivel ? '⚠️' : '✓'} Portal Oficial ${indisponivel ? 'Temporariamente Indisponível' : 'Confirmado'} — ${escapeHtml(found.nome)} (${escapeHtml(found.sistema)})</span>
          <span class="tag confirmado">FONTE AUDITADA</span>
          ${indisponivel ? '<span class="tag indisponivel">FORA DO AR</span>' : ''}
        </div>

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
  } else {
    const whatsappHref = buildWhatsappLink(`Olá! Necessito de acesso prioritário e catalogação técnica do município de ${found.nome} no Zonea.`);
    html = `
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
  }

  container.innerHTML = html;
  container.className = 'status-message visible';
}

document.addEventListener('DOMContentLoaded', async () => {
  // 2. CARREGAMENTO ASSÍNCRONO DOS DADOS (DECOUPLED JSON — campos públicos)
  try {
    // Caminho absoluto a partir da raiz — script.js também é usado por páginas
    // dentro de subpastas (ex. conhecimento/*.html), onde um caminho relativo
    // resolveria errado (ex. conhecimento/data/... em vez de data/...).
    const [municipiosRes, configRes] = await Promise.all([
      fetch('/data/municipios.json'),
      fetch('/data/config.json'),
    ]);
    if (!municipiosRes.ok) throw new Error(`Erro HTTP: ${municipiosRes.status}`);
    MUNICIPIOS = await municipiosRes.json();
    if (configRes.ok) CONFIG = await configRes.json();
  } catch (err) {
    console.error('Erro ao carregar dados iniciais do Zonea:', err);
    dadosCarregadosComSucesso = false;
  }

  // Busca, mapa e artigos dependem só dos dados estáticos acima — liberam já,
  // sem esperar (nem depender de) o Supabase. Sessão/assinatura só importa pro
  // botão do header (item 4) e pro guard da Poligonal, e carrega em paralelo.
  resolverZoneaDadosProntos();
  const assinaturaPromise = getAssinaturaAtiva();

  // Número de WhatsApp centralizado: aplicado a todos os botões flutuantes da página,
  // já com uma mensagem padrão pra equipe saber do que se trata.
  document.querySelectorAll('.whatsapp-float-btn').forEach(el => {
    el.href = buildWhatsappLink('Olá! Estou no site do Zonea e gostaria de tirar uma dúvida.');
  });

  // Localização aproximada do visitante (por IP, sem pedir permissão nenhuma) —
  // toque decorativo no rodapé, no mesmo espírito das coordenadas do Zonea.
  // Guarda o resultado no localStorage por 30 dias: cada visitante só gera UMA
  // chamada ao serviço externo, não uma a cada página vista, pra não pesar na
  // cota gratuita do provedor. Falha em silêncio: sem resposta, o badge some.
  const visitorLocationEl = document.getElementById('visitorLocation');
  const visitorCoordsEl = document.getElementById('visitorCoords');
  if (visitorLocationEl && visitorCoordsEl) {
    const CACHE_KEY = 'zonea_visitor_location';
    const CACHE_DIAS = 30;

    function formatarLocalizacao(lat, lon, city, region) {
      const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
      const local = [city, region].filter(Boolean).join(' / ');
      return `${latStr}, ${lonStr}${local ? ' · ' + local.toUpperCase() : ''}`;
    }

    function mostrarTexto(texto) {
      visitorCoordsEl.textContent = texto;
      visitorLocationEl.hidden = false;
    }

    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { /* cache inválido, ignora */ }

    const cacheValido = cache && cache.texto && cache.timestamp
      && (Date.now() - cache.timestamp) < CACHE_DIAS * 24 * 60 * 60 * 1000;

    if (cacheValido) {
      mostrarTexto(cache.texto);
    } else {
      fetch('https://get.geojs.io/v1/ip/geo.json')
        .then(res => res.json())
        .then(data => {
          const lat = parseFloat(data.latitude);
          const lon = parseFloat(data.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const texto = formatarLocalizacao(lat, lon, data.city, data.region);
          mostrarTexto(texto);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ texto, timestamp: Date.now() }));
          } catch { /* localStorage indisponível (modo privado etc.) — sem problema, só não guarda */ }
        })
        .catch(() => { /* sem localização hoje — tudo bem, o resto do site funciona normalmente */ });
    }
  }

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
      btnLockToggle.innerHTML = '<span>👤 Minha conta</span>';
      btnLockToggle.title = 'Você está logado, sem assinatura ativa. Clique para encerrar sessão.';
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
        const sair = await confirmarZonea({
          titulo: 'Encerrar sessão?',
          mensagem: 'Você sai da sua conta neste navegador. Dá pra entrar de novo quando quiser.',
          confirmar: 'Sair',
        });
        if (sair) {
          await supabaseClient.auth.signOut();
          window.location.href = '/servicos.html';
        }
      } else {
        window.location.href = '/conta.html';
      }
    });
  }

  assinaturaPromise
    .then(({ session, ativa }) => renderHeaderLockUI(session, ativa))
    .catch((err) => console.error('Erro ao carregar a sessão do Zonea:', err));

  // Textos de "As 2 primeiras poligonais são grátis" (início e serviços): quem já está logado vê a
  // situação REAL da própria conta — quantas restam, ou que já usou todas e agora é só assinar.
  // Visitante sem conta ou falha na consulta: fica o texto padrão da página.
  function aplicarCreditosNaPagina(creditos) {
    const linhas = document.querySelectorAll('[data-creditos="linha"]');
    const ctas = document.querySelectorAll('[data-creditos="cta"]');
    if (!creditos || (!linhas.length && !ctas.length)) return;

    let linhaHtml;
    let ctaTexto;
    let ctaHref;
    let esgotou = false;
    if (creditos.assinante) {
      linhaHtml = '✓ <strong>Assinatura ativa</strong> — poligonais ilimitadas.';
      ctaTexto = 'Abrir a Ferramenta de Poligonal →';
      ctaHref = 'poligonal.html';
    } else if (creditos.restantes > 0) {
      linhaHtml = `🎁 <strong>Você ainda tem ${creditos.restantes} de ${creditos.limite} poligonais grátis.</strong>`;
      ctaTexto = 'Usar a Ferramenta de Poligonal →';
      ctaHref = 'poligonal.html';
    } else {
      linhaHtml = `⚠️ <strong>Você já usou suas ${creditos.limite} poligonais grátis.</strong> Assine para continuar calculando.`;
      ctaTexto = 'Assinar para continuar →';
      ctaHref = 'conta.html';
      esgotou = true;
    }

    linhas.forEach((el) => {
      el.innerHTML = linhaHtml;
      if (esgotou) el.style.color = '#B45309';
    });
    ctas.forEach((el) => {
      const link = el.closest('a');
      if (link) link.setAttribute('href', ctaHref);
      const rotulo = el.querySelector('span') || el;
      rotulo.textContent = ctaTexto;
    });
  }

  assinaturaPromise
    .then(({ session }) => (session ? obterCreditosPoligonal() : null))
    .then(aplicarCreditosNaPagina)
    .catch((err) => console.error('Erro ao mostrar os créditos de Poligonal:', err));

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
    form.addEventListener('submit', (e) => {
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

      const found = MUNICIPIOS.find(m => normalize(m.nome) === normalize(val));
      if (!found) {
        statusEl.innerHTML = `<div class="status-message error visible">"${escapeHtml(val)}" não faz parte dos 34 municípios cadastrados da RMBH.</div>`;
        statusEl.className = 'status-message visible';
        return;
      }

      renderMunicipioCard(found, statusEl);
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
