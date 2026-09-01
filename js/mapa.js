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
      // confirmado e com dados liberados pra esse visitante (BH sempre, ou assinante ativo)
      return { fillColor: '#ECFDF5', color: '#2E8B57', weight: 2, fillOpacity: 0.55 };
    }
    if (m && m.confirmado) {
      // confirmado, mas exige assinatura ativa pra ver os dados
      return { fillColor: '#EFF6FF', color: '#1E5AA8', weight: 2, fillOpacity: 0.55, dashArray: '4 3' };
    }
    // ainda não confirmado — dado público de qualquer forma, sem trava.
    // Contorno mais escuro que o cinza-claro usado nas tags: sobre o tile
    // do OpenStreetMap (já claro), um cinza pálido some visualmente.
    return { fillColor: '#F8FAFC', color: '#94A3B8', weight: 1.5, fillOpacity: 0.35 };
  }

  const map = L.map(mapaContainer, { scrollWheelZoom: false }).setView([-19.92, -44.05], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 17,
  }).addTo(map);

  let layerBelohorizonte = null;

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

      if (m && m.slug === 'belo-horizonte') {
        layerBelohorizonte = layer;
      }
    },
  }).addTo(map);

  try {
    map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] });
  } catch (err) {
    console.error('Não foi possível ajustar os limites do mapa:', err);
  }

  // Belo Horizonte ganha um selo fixo "GRÁTIS" — e o painel já abre com os
  // dados dele, sem precisar de nenhum clique, pra mostrar o produto na hora.
  if (layerBelohorizonte) {
    layerBelohorizonte.bindTooltip('GRÁTIS', { permanent: true, direction: 'center', className: 'mapa-badge-demo' });
    const bh = encontrarMunicipio('Belo Horizonte');
    if (bh) renderMunicipioCard(bh, painelEl);
  } else {
    painelEl.innerHTML = '<div class="status-message ok visible">Clique em um município no mapa pra ver os dados disponíveis.</div>';
    painelEl.className = 'status-message visible';
  }
});
