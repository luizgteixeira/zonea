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

  const geoLayer = L.geoJSON(geojson, {
    style: (feature) => estiloDoMunicipio(encontrarMunicipio(feature.properties.name)),
    onEachFeature: (feature, layer) => {
      const m = encontrarMunicipio(feature.properties.name);

      layer.bindTooltip(feature.properties.name, { sticky: true });

      layer.on('mouseover', () => layer.setStyle({ weight: 3 }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
      layer.on('click', () => {
        if (m) renderMunicipioCard(m, painelEl);
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
    if (municipio) renderMunicipioCard(municipio, painelEl);

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
    renderMunicipioCard(bh, painelEl);
  } else {
    painelEl.innerHTML = '<div class="status-message ok visible">Clique em um município no mapa pra ver os dados disponíveis.</div>';
    painelEl.className = 'status-message visible';
  }
});
