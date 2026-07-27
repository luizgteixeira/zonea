/* ============================================================
   ZONEA — Ferramenta de Poligonal
   Cálculo de vértices (E/N) a partir de distância + azimute,
   renderização SVG, área (Shoelace), perímetro e erro de fechamento.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const initialE = document.getElementById('initialE');
  const initialN = document.getElementById('initialN');
  const btnSetInitial = document.getElementById('btnSetInitial');

  const segDistancia = document.getElementById('segDistancia');
  const azGrau = document.getElementById('azGrau');
  const azMin = document.getElementById('azMin');
  const azSeg = document.getElementById('azSeg');
  const btnAddPoint = document.getElementById('btnAddPoint');

  const btnClosePolygon = document.getElementById('btnClosePolygon');
  const btnResetPoligonal = document.getElementById('btnResetPoligonal');
  const poligonalStatus = document.getElementById('poligonalStatus');

  const svg = document.getElementById('poligonalSvg');
  const pointsTableBody = document.getElementById('pointsTableBody');

  const resultArea = document.getElementById('resultArea');
  const resultPerimetro = document.getElementById('resultPerimetro');
  const resultFechamento = document.getElementById('resultFechamento');

  if (!btnSetInitial) return; // página sem a ferramenta — não faz nada

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CLOSURE_TOLERANCE_M = 0.05; // 5 cm

  // Estado: points[0] é o ponto inicial (sem segmento associado).
  // points[i] (i>=1) tem um "segment" correspondente com {distancia, azDecimal, azLabel}.
  let points = [];
  let segments = [];

  function parseNumber(value) {
    if (value === null || value === undefined) return NaN;
    const normalized = String(value).trim().replace(',', '.');
    if (normalized === '') return NaN;
    return Number(normalized);
  }

  function showStatus(state, html) {
    if (!poligonalStatus) return;
    poligonalStatus.className = `status-message ${state} visible`;
    poligonalStatus.innerHTML = html;
  }

  function clearStatus() {
    if (!poligonalStatus) return;
    poligonalStatus.className = 'status-message';
    poligonalStatus.innerHTML = '';
  }

  function formatAzimuthLabel(grau, min, seg) {
    return `${grau}°${min}'${seg.toFixed(2)}"`;
  }

  function azimuthToRadians(grau, min, seg) {
    const decimal = grau + (min / 60) + (seg / 3600);
    return decimal * (Math.PI / 180);
  }

  function nextPointFromPolar(prev, distancia, azimuthRad) {
    const deltaE = distancia * Math.sin(azimuthRad);
    const deltaN = distancia * Math.cos(azimuthRad);
    return { E: prev.E + deltaE, N: prev.N + deltaN };
  }

  function shoelaceArea(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      sum += (a.E * b.N) - (b.E * a.N);
    }
    return Math.abs(sum) / 2;
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.E - b.E, a.N - b.N);
  }

  function formatNumber(value, decimals) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // ---------- RENDER: TABELA DE PONTOS ----------
  function renderTable() {
    if (!pointsTableBody) return;
    pointsTableBody.innerHTML = '';

    if (points.length === 0) {
      pointsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--cor-cinza);">Nenhum ponto inserido ainda. Comece definindo o ponto inicial.</td></tr>`;
      return;
    }

    points.forEach((p, i) => {
      const seg = segments[i]; // undefined para i === 0
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>P${i}</td>
        <td>${formatNumber(p.E, 3)}</td>
        <td>${formatNumber(p.N, 3)}</td>
        <td>${seg ? formatNumber(seg.distancia, 3) + ' m' : '—'}</td>
        <td>${seg ? seg.azLabel : '—'}</td>
      `;
      pointsTableBody.appendChild(tr);
    });
  }

  // ---------- RENDER: SVG ----------
  function renderSvg(closureEdge) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const viewW = 480;
    const viewH = 360;
    const pad = 32;

    if (points.length === 0) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', viewW / 2);
      text.setAttribute('y', viewH / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#94A3B8');
      text.setAttribute('font-size', '13');
      text.setAttribute('font-family', 'monospace');
      text.textContent = 'Defina o ponto inicial para começar';
      svg.appendChild(text);
      return;
    }

    const minE = Math.min(...points.map(p => p.E));
    const maxE = Math.max(...points.map(p => p.E));
    const minN = Math.min(...points.map(p => p.N));
    const maxN = Math.max(...points.map(p => p.N));

    const rangeE = maxE - minE || 1;
    const rangeN = maxN - minN || 1;
    const scale = Math.min((viewW - pad * 2) / rangeE, (viewH - pad * 2) / rangeN);

    // centraliza o desenho na área útil
    const drawnW = rangeE * scale;
    const drawnH = rangeN * scale;
    const offsetX = pad + ((viewW - pad * 2) - drawnW) / 2;
    const offsetY = pad + ((viewH - pad * 2) - drawnH) / 2;

    function toSvg(p) {
      const x = (p.E - minE) * scale + offsetX;
      const y = (viewH) - ((p.N - minN) * scale + offsetY); // inverte N para "cima" na tela
      return { x, y };
    }

    // polígono preenchido (se houver pelo menos 3 pontos)
    if (points.length >= 3) {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', points.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' '));
      poly.setAttribute('fill', 'rgba(30, 90, 168, 0.10)');
      poly.setAttribute('stroke', 'none');
      svg.appendChild(poly);
    }

    // linhas entre os pontos inseridos (na ordem em que foram criados)
    if (points.length >= 2) {
      const line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', points.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#1E5AA8');
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    }

    // aresta de fechamento (último ponto -> primeiro), tracejada
    if (closureEdge && points.length >= 3) {
      const a = toSvg(points[points.length - 1]);
      const b = toSvg(points[0]);
      const closeLine = document.createElementNS(SVG_NS, 'line');
      closeLine.setAttribute('x1', a.x);
      closeLine.setAttribute('y1', a.y);
      closeLine.setAttribute('x2', b.x);
      closeLine.setAttribute('y2', b.y);
      closeLine.setAttribute('stroke', closureEdge.ok ? '#2E8B57' : '#D97706');
      closeLine.setAttribute('stroke-width', '2');
      closeLine.setAttribute('stroke-dasharray', '5,4');
      svg.appendChild(closeLine);
    }

    // vértices
    points.forEach((p, i) => {
      const s = toSvg(p);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', s.x);
      circle.setAttribute('cy', s.y);
      circle.setAttribute('r', i === 0 ? 5 : 4);
      circle.setAttribute('fill', i === 0 ? '#2E8B57' : '#1E5AA8');
      circle.setAttribute('stroke', '#FFFFFF');
      circle.setAttribute('stroke-width', '1.5');
      svg.appendChild(circle);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', s.x + 8);
      label.setAttribute('y', s.y - 8);
      label.setAttribute('font-size', '11');
      label.setAttribute('font-family', 'monospace');
      label.setAttribute('fill', '#4B5563');
      label.textContent = `P${i}`;
      svg.appendChild(label);
    });
  }

  function renderAll(closureEdge) {
    renderTable();
    renderSvg(closureEdge);
  }

  // ---------- ESTADO DOS BOTÕES ----------
  function updateFormState() {
    const hasInitial = points.length >= 1;
    segDistancia.disabled = !hasInitial;
    azGrau.disabled = !hasInitial;
    azMin.disabled = !hasInitial;
    azSeg.disabled = !hasInitial;
    btnAddPoint.disabled = !hasInitial;
    btnClosePolygon.disabled = points.length < 3;
    btnSetInitial.textContent = hasInitial ? 'Redefinir Ponto Inicial' : 'Definir Ponto Inicial';
  }

  // ---------- HANDLERS ----------
  btnSetInitial.addEventListener('click', () => {
    const E = parseNumber(initialE.value);
    const N = parseNumber(initialN.value);

    if (!Number.isFinite(E) || !Number.isFinite(N)) {
      showStatus('error', '❌ Informe valores numéricos válidos para E e N.');
      return;
    }

    points = [{ E, N }];
    segments = [undefined];
    resultArea.textContent = '—';
    resultPerimetro.textContent = '—';
    resultFechamento.textContent = '—';
    resultFechamento.classList.remove('warn-value');

    showStatus('ok', '✓ Ponto inicial definido. Agora adicione os segmentos (distância + azimute).');
    updateFormState();
    renderAll();
  });

  btnAddPoint.addEventListener('click', () => {
    const distancia = parseNumber(segDistancia.value);
    const grau = parseNumber(azGrau.value);
    const min = parseNumber(azMin.value);
    const seg = parseNumber(azSeg.value);

    if (!Number.isFinite(distancia) || distancia <= 0) {
      showStatus('error', '❌ Informe uma distância válida (maior que zero).');
      return;
    }
    if (!Number.isFinite(grau) || grau < 0 || grau >= 360) {
      showStatus('error', '❌ Graus do azimute devem estar entre 0 e 359.');
      return;
    }
    if (!Number.isFinite(min) || min < 0 || min >= 60) {
      showStatus('error', '❌ Minutos do azimute devem estar entre 0 e 59.');
      return;
    }
    if (!Number.isFinite(seg) || seg < 0 || seg >= 60) {
      showStatus('error', '❌ Segundos do azimute devem estar entre 0 e 59,99.');
      return;
    }

    const prev = points[points.length - 1];
    const azimuthRad = azimuthToRadians(grau, min, seg);
    const novoPonto = nextPointFromPolar(prev, distancia, azimuthRad);

    points.push(novoPonto);
    segments.push({ distancia, azDecimal: grau + (min / 60) + (seg / 3600), azLabel: formatAzimuthLabel(grau, min, seg) });

    segDistancia.value = '';
    azGrau.value = '';
    azMin.value = '';
    azSeg.value = '';
    segDistancia.focus();

    const distToStart = distanceBetween(novoPonto, points[0]);
    if (points.length >= 3 && distToStart <= CLOSURE_TOLERANCE_M) {
      showStatus('ok', `✓ Ponto P${points.length - 1} adicionado — está a ${distToStart.toFixed(3)} m do ponto inicial. A poligonal já pode ser fechada.`);
    } else {
      showStatus('ok', `✓ Ponto P${points.length - 1} adicionado.`);
    }

    updateFormState();
    renderAll();
  });

  btnClosePolygon.addEventListener('click', () => {
    if (points.length < 3) {
      showStatus('error', '❌ Insira pelo menos 3 pontos para fechar a poligonal.');
      return;
    }

    const area = shoelaceArea(points);
    const perimetro = segments.reduce((sum, s) => sum + (s ? s.distancia : 0), 0);
    const erroFechamento = distanceBetween(points[points.length - 1], points[0]);
    const fechou = erroFechamento <= CLOSURE_TOLERANCE_M;

    resultArea.textContent = formatNumber(area, 2);
    resultPerimetro.textContent = formatNumber(perimetro, 2);
    resultFechamento.textContent = formatNumber(erroFechamento, 3);
    resultFechamento.classList.toggle('warn-value', !fechou);

    if (fechou) {
      showStatus('ok', `✓ <strong>Poligonal fechada com sucesso.</strong> Erro de fechamento de ${erroFechamento.toFixed(3)} m, dentro da tolerância (${CLOSURE_TOLERANCE_M} m).`);
    } else {
      showStatus('warn', `⚠️ <strong>Poligonal com erro de fechamento de ${erroFechamento.toFixed(3)} m</strong> — acima da tolerância recomendada (${CLOSURE_TOLERANCE_M} m). Revise as distâncias e azimutes informados, ou adicione mais um segmento para aproximar o ponto final do ponto inicial.`);
    }

    renderAll({ ok: fechou });
  });

  btnResetPoligonal.addEventListener('click', () => {
    if (points.length === 0) return;
    if (!confirm('Deseja limpar todos os pontos inseridos e recomeçar?')) return;

    points = [];
    segments = [];
    initialE.value = '';
    initialN.value = '';
    segDistancia.value = '';
    azGrau.value = '';
    azMin.value = '';
    azSeg.value = '';
    resultArea.textContent = '—';
    resultPerimetro.textContent = '—';
    resultFechamento.textContent = '—';
    resultFechamento.classList.remove('warn-value');

    clearStatus();
    updateFormState();
    renderAll();
  });

  // Estado inicial
  updateFormState();
  renderAll();
});
