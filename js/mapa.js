/* ============================================================
   ZONEA — Mapa da RMBH
   Monta o mapa Leaflet com o contorno dos 34 municípios (malha do
   IBGE), casa cada polígono com data/municipios.json por nome, e
   reaproveita renderMunicipioCard() (definida em js/script.js) pra
   mostrar o mesmo card de resultado que a busca da Home já usa.
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const mapaContainer = document.getElementById('mapaContainer');
  const painelEl = document.getElementById('mapaResultado');
  if (!mapaContainer || !painelEl) return; // página sem o mapa — não faz nada

  // Espera js/script.js terminar de carregar e mesclar MUNICIPIOS — os dois
  // arquivos escutam DOMContentLoaded separadamente, então sem essa espera
  // MUNICIPIOS poderia ainda estar vazio quando o mapa começa a montar.
  await window.zoneaDadosProntos;

  let geojson;
  try {
    const res = await fetch('data/rmbh-municipios.geojson');
    if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
    geojson = await res.json();
  } catch (err) {
    console.error('Erro ao carregar a malha geográfica da RMBH:', err);
    mapaContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--cor-cinza); font-size: 13px;">Não foi possível carregar o mapa agora. Recarregue a página.</div>';
    return;
  }

  function encontrarMunicipio(nomeGeojson) {
    return MUNICIPIOS.find(m => normalize(m.nome) === normalize(nomeGeojson));
  }

  function estiloDoMunicipio(m) {
    if (m && m.confirmado && m.link) {
      // portal oficial auditado pelo Zonea
      return { fillColor: '#ECFDF5', color: '#2E8B57', weight: 2, fillOpacity: 0.55 };
    }
    // ainda não confirmado. Contorno escuro e espesso de propósito: um cinza mais
    // claro sumia sobre o tile claro do OpenStreetMap e parecia que só os
    // municípios confirmados existiam no mapa.
    return { fillColor: '#E2E8F0', color: '#475569', weight: 2, fillOpacity: 0.45 };
  }

  const map = L.map(mapaContainer, { scrollWheelZoom: false }).setView([-19.92, -44.05], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 17,
  }).addTo(map);

  // ---------- PROVA DE CONCEITO: consulta de zoneamento (só Contagem) ----------
  // Fase 3 do roadmap pedia camadas de zoneamento sobrepostas no mapa. Auditando o
  // serviço de Contagem descobrimos que não dá pra simplesmente "carregar a camada":
  // são 16.585 feições (zoneamento por LOTE, não por zona), bem mais do que cabe
  // num mapa de navegador. Por isso, em vez de uma camada, é uma consulta pontual:
  // cada clique dentro de Contagem pergunta ao servidor da prefeitura só o lote
  // daquele ponto — leve, e não baixa o cadastro inteiro pra visitante nenhum.
  const ZONEAMENTO_CONTAGEM_URL = 'https://geoprocessamento.contagem.mg.gov.br/arcgis/rest/services/SIGM_BD_Publico/Zoneamento_Publico/FeatureServer/0/query';
  const caixaZoneamentoEl = document.getElementById('mapaZoneamentoContagem');
  const chkZoneamentoEl = document.getElementById('chkZoneamentoContagem');
  const resultadoZoneamentoEl = document.getElementById('mapaZoneamentoResultado');
  let numeroDaConsultaZoneamento = 0; // mesmo padrão da busca: resposta atrasada de um clique antigo é descartada
  let marcadorZoneamento = null;

  function mostrarResultadoZoneamento(estado, texto) {
    if (!resultadoZoneamentoEl) return;
    resultadoZoneamentoEl.className = `status-message ${estado} visible`;
    resultadoZoneamentoEl.textContent = texto;
  }

  function limparResultadoZoneamento() {
    if (!resultadoZoneamentoEl) return;
    resultadoZoneamentoEl.className = 'status-message';
    resultadoZoneamentoEl.textContent = '';
    if (marcadorZoneamento) {
      map.removeLayer(marcadorZoneamento);
      marcadorZoneamento = null;
    }
  }

  async function consultarZoneamentoContagem(lat, lon) {
    const meuNumero = ++numeroDaConsultaZoneamento;
    mostrarResultadoZoneamento('ok', 'Consultando a prefeitura de Contagem...');
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'ZH,ZF',
      returnGeometry: 'false',
      f: 'json',
    });
    let dados;
    try {
      const res = await fetch(`${ZONEAMENTO_CONTAGEM_URL}?${params}`);
      if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
      dados = await res.json();
      if (dados.error) throw new Error(dados.error.message || 'Erro na consulta');
    } catch (err) {
      if (meuNumero !== numeroDaConsultaZoneamento) return;
      console.error('Erro ao consultar o zoneamento de Contagem:', err);
      mostrarResultadoZoneamento('error', 'Não foi possível consultar a prefeitura agora. Tente de novo em instantes.');
      return;
    }
    if (meuNumero !== numeroDaConsultaZoneamento) return; // outro clique chegou primeiro

    const atributos = dados.features?.[0]?.attributes;
    if (marcadorZoneamento) map.removeLayer(marcadorZoneamento);
    marcadorZoneamento = L.circleMarker([lat, lon], {
      radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#D97706', fillOpacity: 1,
    }).addTo(map);

    if (!atributos) {
      marcadorZoneamento.bindTooltip('Sem zoneamento cadastrado aqui', { direction: 'top' }).openTooltip();
      mostrarResultadoZoneamento('warn', 'Não há zoneamento cadastrado exatamente neste ponto — pode ser uma via pública, área verde ou ponto fora do cadastro. Tente clicar dentro de um lote.');
      return;
    }
    const texto = `Zona Homogênea ${atributos.ZH} · Zona Fiscal ${atributos.ZF}`;
    marcadorZoneamento.bindTooltip(texto, { direction: 'top' }).openTooltip();
    mostrarResultadoZoneamento('ok', `${texto}. Código bruto da prefeitura — o nome/descrição da zona não está neste serviço; confira a Lei de Uso do Solo de Contagem para o significado.`);
  }

  // Mostra (ou esconde) a caixa da prova de conceito de acordo com o município
  // selecionado. `lat`/`lon` só vêm quando a seleção veio de um clique ou de uma
  // busca com ponto exato (não do estado inicial da página).
  function atualizarFerramentaZoneamento(m, lat, lon) {
    if (!caixaZoneamentoEl) return;
    const ehContagem = m && m.slug === 'contagem';
    caixaZoneamentoEl.hidden = !ehContagem;
    if (!ehContagem) {
      limparResultadoZoneamento();
      return;
    }
    if (chkZoneamentoEl && chkZoneamentoEl.checked && Number.isFinite(lat) && Number.isFinite(lon)) {
      consultarZoneamentoContagem(lat, lon);
    }
  }

  if (chkZoneamentoEl) {
    chkZoneamentoEl.addEventListener('change', () => {
      if (!chkZoneamentoEl.checked) limparResultadoZoneamento();
    });
  }

  // Centraliza a seleção de município (clique no mapa, busca por endereço/CEP e o
  // estado inicial da página) num só lugar, pra card e ferramenta de zoneamento
  // ficarem sempre coerentes entre si, nos três casos.
  function selecionarMunicipio(m, lat, lon) {
    renderMunicipioCard(m, painelEl);
    atualizarFerramentaZoneamento(m, lat, lon);
  }

  const geoLayer = L.geoJSON(geojson, {
    style: (feature) => estiloDoMunicipio(encontrarMunicipio(feature.properties.name)),
    onEachFeature: (feature, layer) => {
      const m = encontrarMunicipio(feature.properties.name);

      layer.bindTooltip(feature.properties.name, { sticky: true });

      layer.on('mouseover', () => layer.setStyle({ weight: 3 }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
      layer.on('click', (e) => {
        if (m) selecionarMunicipio(m, e.latlng.lat, e.latlng.lng);
      });
    },
  }).addTo(map);

  try {
    map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] });
  } catch (err) {
    console.error('Não foi possível ajustar os limites do mapa:', err);
  }

  // ---------- BUSCA POR ENDEREÇO / CEP ----------
  // Localiza o ponto (BrasilAPI / OpenStreetMap), marca no mapa e mostra o card do município
  // em que ele cai — o mesmo card do clique. Ver js/busca-endereco.js.
  const formBusca = document.getElementById('formBuscaEndereco');
  const inputBusca = document.getElementById('inputEndereco');
  const btnBusca = document.getElementById('btnBuscaEndereco');
  const resultadoBusca = document.getElementById('buscaEnderecoResultado');
  const btnLimparBusca = document.getElementById('btnLimparBusca');
  let numeroDaBusca = 0; // cada busca (ou limpeza) muda o número: resposta atrasada de busca antiga é descartada
  const caixaRmbh = ZoneaEndereco.caixaDaMalha(geojson);
  let marcadorBusca = null;

  function mostrarResultadoBusca(estado, blocos) {
    resultadoBusca.className = `status-message ${estado} visible`;
    resultadoBusca.replaceChildren(...blocos);
  }

  // textContent (e não innerHTML): o texto vem de serviços externos e do que a pessoa digitou.
  function linha(texto, forte) {
    const p = document.createElement('div');
    if (forte) {
      const s = document.createElement('strong');
      s.textContent = texto;
      p.appendChild(s);
    } else {
      p.textContent = texto;
    }
    return p;
  }

  function limparMarcador() {
    if (marcadorBusca) {
      map.removeLayer(marcadorBusca);
      marcadorBusca = null;
    }
  }

  function atualizarBotaoLimpar() {
    if (btnLimparBusca) btnLimparBusca.hidden = inputBusca.value === '' && !marcadorBusca && !resultadoBusca.classList.contains('visible');
  }

  // Apaga tudo o que a busca deixou: texto, resultado, ponto no mapa — e volta a mostrar a RMBH inteira.
  function limparBusca() {
    numeroDaBusca++;
    inputBusca.value = '';
    resultadoBusca.className = 'status-message';
    resultadoBusca.replaceChildren();
    limparMarcador();
    btnBusca.disabled = false;
    try {
      map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] });
    } catch (err) {
      console.error('Não foi possível voltar ao mapa inteiro:', err);
    }
    atualizarBotaoLimpar();
    inputBusca.focus();
  }

  async function executarBusca(evento) {
    evento.preventDefault();
    const entrada = ZoneaEndereco.interpretarEntrada(inputBusca.value);

    if (entrada.tipo === 'vazio') {
      mostrarResultadoBusca('warn', [linha('Digite um endereço ou um CEP para buscar.')]);
      return;
    }
    if (entrada.tipo === 'cep_invalido') {
      mostrarResultadoBusca('warn', [linha('Esse CEP parece incompleto: são 8 números (ex.: 30130-010).')]);
      return;
    }
    if (entrada.tipo === 'curto') {
      mostrarResultadoBusca('warn', [linha('Digite um pouco mais: rua, número e município (ex.: Av. Afonso Pena, 1500, Belo Horizonte).')]);
      return;
    }

    const meuNumero = ++numeroDaBusca;
    btnBusca.disabled = true;
    mostrarResultadoBusca('ok', [linha('Buscando...')]);
    limparMarcador();
    atualizarBotaoLimpar();

    let achado;
    try {
      achado = entrada.tipo === 'cep'
        ? await ZoneaEndereco.buscarCep(entrada.cep, caixaRmbh)
        : await ZoneaEndereco.buscarEndereco(entrada.texto, caixaRmbh);
    } catch (err) {
      if (meuNumero !== numeroDaBusca) return; // a pessoa limpou a busca enquanto esperava
      console.error('Erro na busca por endereço/CEP:', err);
      mostrarResultadoBusca('error', [linha('Não foi possível buscar agora. Confira a conexão e tente de novo em instantes.')]);
      btnBusca.disabled = false;
      return;
    }
    if (meuNumero !== numeroDaBusca) return; // a pessoa limpou a busca enquanto esperava
    btnBusca.disabled = false;

    if (achado.erro === 'cep_nao_encontrado') {
      mostrarResultadoBusca('warn', [linha('Não encontramos esse CEP. Confira os números ou busque pelo endereço.')]);
      return;
    }
    if (achado.erro) {
      mostrarResultadoBusca('warn', [
        linha('Não encontramos esse endereço na RMBH.', true),
        linha('Inclua o bairro e o município (ex.: Rua das Flores, 100, Betim) ou tente pelo CEP.'),
      ]);
      return;
    }

    const feature = ZoneaEndereco.acharFeature(achado.lon, achado.lat, geojson);
    if (!feature) {
      mostrarResultadoBusca('warn', [
        linha('Esse endereço fica fora da Região Metropolitana de Belo Horizonte.', true),
        linha(achado.rotulo),
      ]);
      return;
    }

    marcadorBusca = L.circleMarker([achado.lat, achado.lon], {
      radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#1E5AA8', fillOpacity: 1,
    }).addTo(map);
    marcadorBusca.bindTooltip('Endereço buscado', { direction: 'top' });
    map.setView([achado.lat, achado.lon], achado.precisao === 'cidade' ? 12 : 16);

    const nomeMunicipio = feature.properties.name;
    const precisoes = {
      rua: 'Posição aproximada: localizamos a rua deste CEP, não o terreno.',
      cidade: 'Não conseguimos localizar a rua deste CEP no mapa: o ponto mostra o centro do município, não o endereço.',
      endereco: 'Posição aproximada: confira o local exato no portal da prefeitura.',
    };
    const precisao = precisoes[achado.precisao] || precisoes.endereco;
    mostrarResultadoBusca('ok', [
      linha(`📍 Fica em ${nomeMunicipio}`, true),
      linha(achado.rotulo),
      linha(precisao),
    ]);

    const municipio = encontrarMunicipio(nomeMunicipio);
    if (municipio) selecionarMunicipio(municipio, achado.lat, achado.lon);

    // O mapa fica abaixo da caixa de busca: leva a tela até o ponto marcado.
    mapaContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (formBusca && inputBusca && resultadoBusca) {
    formBusca.addEventListener('submit', async (evento) => {
      await executarBusca(evento);
      atualizarBotaoLimpar();
    });
    inputBusca.addEventListener('input', atualizarBotaoLimpar);
    inputBusca.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (inputBusca.value !== '' || marcadorBusca)) limparBusca();
    });
    if (btnLimparBusca) btnLimparBusca.addEventListener('click', limparBusca);
  }

  // O painel já abre com Belo Horizonte (o maior polo da região), sem precisar
  // de nenhum clique — evita um painel vazio e mostra o card na hora.
  const bh = encontrarMunicipio('Belo Horizonte');
  if (bh) {
    selecionarMunicipio(bh);
  } else {
    painelEl.innerHTML = '<div class="status-message ok visible">Clique em um município no mapa pra ver os dados disponíveis.</div>';
    painelEl.className = 'status-message visible';
  }
});
