/* ============================================================
   ZONEA — Ferramenta de Poligonal
   Tabela editável (digitação célula a célula ou colar do Excel),
   cálculo em cadeia (azimute/distância → ΔE/ΔN), área (Shoelace),
   perímetro, erro de fechamento e renderização SVG.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('poligonalTableBody');
  const btnAddRow = document.getElementById('btnAddRow');
  const btnClosePolygon = document.getElementById('btnClosePolygon');
  const btnResetPoligonal = document.getElementById('btnResetPoligonal');
  const poligonalStatus = document.getElementById('poligonalStatus');

  const svg = document.getElementById('poligonalSvg');

  const resultArea = document.getElementById('resultArea');
  const resultPerimetro = document.getElementById('resultPerimetro');
  const resultFechamento = document.getElementById('resultFechamento');

  if (!tbody) return; // página sem a ferramenta — não faz nada

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CLOSURE_TOLERANCE_M = 0.05; // 5 cm

  // rows[0] = ponto inicial (initialEStr/initialNStr).
  // rows[i>=1] = segmento a partir do ponto anterior (azimuteStr/distanciaStr).
  let rows = [emptyRow()];
  let computed = [];   // computed[i] = { E, N, valid }
  let fieldFlags = []; // fieldFlags[i] = { azimuteInvalid, distanciaInvalid, initialEInvalid, initialNInvalid }

  function emptyRow() {
    return { azimuteStr: '', distanciaStr: '', initialEStr: '', initialNStr: '' };
  }

  // ---------- PARSERS ----------
  function parseNumber(value) {
    if (value === null || value === undefined) return NaN;
    const normalized = String(value).trim().replace(',', '.');
    if (normalized === '') return NaN;
    return Number(normalized);
  }

  function parseAzimuthFlexible(raw) {
    if (raw === null || raw === undefined) return NaN;
    const str = String(raw).trim();
    if (str === '') return NaN;

    // 1) DMS com símbolos: 189°1'24.32"
    let m = str.match(/^(-?\d+)\s*°\s*(\d+)\s*['’]\s*([\d.,]+)\s*["”]?$/);
    if (m) {
      const g = parseFloat(m[1]), mi = parseFloat(m[2]), s = parseFloat(m[3].replace(',', '.'));
      if ([g, mi, s].every(Number.isFinite)) return g + mi / 60 + s / 3600;
    }

    // 2) Trinca separada por espaço: 189 1 24.32
    const tokens = str.split(/\s+/);
    if (tokens.length === 3) {
      const g = parseFloat(tokens[0]), mi = parseFloat(tokens[1]), s = parseFloat(tokens[2].replace(',', '.'));
      if ([g, mi, s].every(Number.isFinite)) return g + mi / 60 + s / 3600;
    }

    // 3) Valor único = graus decimais
    if (tokens.length === 1) {
      const dec = parseFloat(tokens[0].replace(',', '.'));
      if (Number.isFinite(dec)) return dec;
    }

    return NaN;
  }

  // ---------- MATEMÁTICA ----------
  function nextPointFromPolar(prev, distancia, azimuthDeg) {
    const rad = azimuthDeg * (Math.PI / 180);
    return { E: prev.E + distancia * Math.sin(rad), N: prev.N + distancia * Math.cos(rad) };
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

  // ---------- ESTADO: RECALCULA A CADEIA INTEIRA ----------
  function recompute() {
    computed = [];
    fieldFlags = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (i === 0) {
        const Estr = row.initialEStr.trim();
        const Nstr = row.initialNStr.trim();
        const E = parseNumber(row.initialEStr);
        const N = parseNumber(row.initialNStr);
        const valid = Number.isFinite(E) && Number.isFinite(N);

        computed.push({ E: valid ? E : null, N: valid ? N : null, valid });
        fieldFlags.push({
          initialEInvalid: Estr !== '' && !Number.isFinite(E),
          initialNInvalid: Nstr !== '' && !Number.isFinite(N),
        });
      } else {
        const prev = computed[i - 1];
        const azStr = row.azimuteStr.trim();
        const distStr = row.distanciaStr.trim();
        const azDecimal = parseAzimuthFlexible(row.azimuteStr);
        const distancia = parseNumber(row.distanciaStr);
        const azOk = Number.isFinite(azDecimal) && azDecimal >= 0 && azDecimal < 360;
        const distOk = Number.isFinite(distancia) && distancia > 0;
        const selfValid = azOk && distOk;
        const valid = prev.valid && selfValid;

        if (valid) {
          const pt = nextPointFromPolar(prev, distancia, azDecimal);
          computed.push({ E: pt.E, N: pt.N, valid: true });
        } else {
          computed.push({ E: null, N: null, valid: false });
        }

        fieldFlags.push({
          azimuteInvalid: azStr !== '' && !azOk,
          distanciaInvalid: distStr !== '' && !distOk,
        });
      }
    }
  }

  // ---------- STATUS ----------
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

  // ---------- RENDER: CÉLULAS DA TABELA ----------
  function makeInputCell({ field, col, rowIndex, value, disabled, placeholder, invalid }) {
    const td = document.createElement('td');
    if (col) td.dataset.col = col;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-input' + (invalid ? ' input-invalid' : '');
    input.dataset.field = field;
    input.value = value;
    input.placeholder = placeholder || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (disabled) input.disabled = true;
    td.appendChild(input);
    return td;
  }

  function makeComputedCell(text) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-input computed-cell';
    input.value = text;
    input.readOnly = true;
    input.tabIndex = -1;
    td.appendChild(input);
    return td;
  }

  function render() {
    tbody.innerHTML = '';

    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = String(i);
      const c = computed[i];
      const flags = fieldFlags[i];
      const isInitial = i === 0;

      const tdIndex = document.createElement('td');
      tdIndex.textContent = 'P' + i;
      tr.appendChild(tdIndex);

      tr.appendChild(makeInputCell({
        field: 'azimute', col: 'azimute', rowIndex: i,
        value: row.azimuteStr, disabled: isInitial,
        placeholder: isInitial ? '—' : '189°1\'24.32"',
        invalid: !isInitial && flags.azimuteInvalid,
      }));

      tr.appendChild(makeInputCell({
        field: 'distancia', col: 'distancia', rowIndex: i,
        value: row.distanciaStr, disabled: isInitial,
        placeholder: isInitial ? '—' : '45.720',
        invalid: !isInitial && flags.distanciaInvalid,
      }));

      if (isInitial) {
        tr.appendChild(makeInputCell({
          field: 'initialE', col: 'E', rowIndex: i,
          value: row.initialEStr, placeholder: 'Ex: 610046.398',
          invalid: flags.initialEInvalid,
        }));
        tr.appendChild(makeInputCell({
          field: 'initialN', col: 'N', rowIndex: i,
          value: row.initialNStr, placeholder: 'Ex: 7000120.235',
          invalid: flags.initialNInvalid,
        }));
      } else {
        tr.appendChild(makeComputedCell(c.valid ? formatNumber(c.E, 3) : '—'));
        tr.appendChild(makeComputedCell(c.valid ? formatNumber(c.N, 3) : '—'));
      }

      const tdAction = document.createElement('td');
      if (i > 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'row-remove-btn';
        btn.dataset.action = 'remove';
        btn.setAttribute('aria-label', 'Remover linha');
        btn.textContent = '✕';
        tdAction.appendChild(btn);
      }
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
  }

  // Atualização "ao vivo" (digitação): não recria os <input>, só ajusta
  // valores calculados e classes de validação — preserva o foco/cursor.
  function updateComputedDisplayAndValidity() {
    const trs = tbody.querySelectorAll('tr');
    trs.forEach((tr, i) => {
      const c = computed[i];
      const flags = fieldFlags[i];
      const isInitial = i === 0;

      const azInput = tr.querySelector('[data-field="azimute"]');
      const distInput = tr.querySelector('[data-field="distancia"]');
      if (azInput) azInput.classList.toggle('input-invalid', !isInitial && !!flags.azimuteInvalid);
      if (distInput) distInput.classList.toggle('input-invalid', !isInitial && !!flags.distanciaInvalid);

      if (isInitial) {
        const eInput = tr.querySelector('[data-field="initialE"]');
        const nInput = tr.querySelector('[data-field="initialN"]');
        if (eInput) eInput.classList.toggle('input-invalid', !!flags.initialEInvalid);
        if (nInput) nInput.classList.toggle('input-invalid', !!flags.initialNInvalid);
      } else {
        const computedInputs = tr.querySelectorAll('.computed-cell');
        if (computedInputs[0]) computedInputs[0].value = c.valid ? formatNumber(c.E, 3) : '—';
        if (computedInputs[1]) computedInputs[1].value = c.valid ? formatNumber(c.N, 3) : '—';
      }
    });
  }

  // ---------- RENDER: SVG ----------
  function renderSvg(closureEdge) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const points = computed.filter(c => c.valid).map(c => ({ E: c.E, N: c.N }));

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
      text.textContent = 'Preencha o ponto inicial para começar';
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

    const drawnW = rangeE * scale;
    const drawnH = rangeN * scale;
    const offsetX = pad + ((viewW - pad * 2) - drawnW) / 2;
    const offsetY = pad + ((viewH - pad * 2) - drawnH) / 2;

    function toSvg(p) {
      const x = (p.E - minE) * scale + offsetX;
      const y = viewH - ((p.N - minN) * scale + offsetY);
      return { x, y };
    }

    if (points.length >= 3) {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', points.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' '));
      poly.setAttribute('fill', 'rgba(30, 90, 168, 0.10)');
      poly.setAttribute('stroke', 'none');
      svg.appendChild(poly);
    }

    if (points.length >= 2) {
      const line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', points.map(p => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#1E5AA8');
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    }

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

  // ---------- ESTADO DOS BOTÕES ----------
  function updateButtons() {
    const last = computed[computed.length - 1];
    btnClosePolygon.disabled = !(rows.length >= 3 && last && last.valid);
  }

  function renderFull() {
    recompute();
    render();
    renderSvg();
    updateButtons();
  }

  function setFieldValue(rowIndex, field, value) {
    const row = rows[rowIndex];
    if (!row) return;
    if (field === 'azimute') row.azimuteStr = value;
    else if (field === 'distancia') row.distanciaStr = value;
    else if (field === 'initialE') row.initialEStr = value;
    else if (field === 'initialN') row.initialNStr = value;
  }

  // ---------- EVENTOS: DIGITAÇÃO AO VIVO ----------
  tbody.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.classList.contains('cell-input') || input.disabled || input.readOnly) return;
    const rowIndex = Number(input.closest('tr').dataset.rowIndex);
    setFieldValue(rowIndex, input.dataset.field, input.value);
    recompute();
    updateComputedDisplayAndValidity();
    renderSvg();
    updateButtons();
  });

  // ---------- EVENTOS: COLAR (EXCEL) ----------
  tbody.addEventListener('paste', (e) => {
    const input = e.target;
    if (!input.classList.contains('cell-input') || input.disabled || input.readOnly) return;

    const clipboard = e.clipboardData || window.clipboardData;
    const text = clipboard ? clipboard.getData('text') : '';
    if (!text) return;

    const hasMultiple = text.includes('\t') || text.includes('\n');
    if (!hasMultiple) return; // valor único: deixa o navegador colar normalmente

    e.preventDefault();

    const startRowIndex = Number(input.closest('tr').dataset.rowIndex);
    const startField = input.dataset.field;

    const gridRows = text.replace(/\r/g, '').split('\n').filter(r => r.length > 0);
    const grid = gridRows.map(r => r.split('\t').map(c => c.trim()));

    grid.forEach((cols, j) => {
      const targetIndex = startRowIndex + j;
      while (targetIndex >= rows.length) rows.push(emptyRow());
      const isInitial = targetIndex === 0;

      if (cols.length >= 6) {
        if (isInitial) {
          rows[targetIndex].initialEStr = cols[4] || '';
          rows[targetIndex].initialNStr = cols[5] || '';
        } else {
          rows[targetIndex].azimuteStr = cols[2] || '';
          rows[targetIndex].distanciaStr = cols[3] || '';
        }
      } else if (cols.length >= 4) {
        if (isInitial) {
          rows[targetIndex].initialEStr = cols[2] || '';
          rows[targetIndex].initialNStr = cols[3] || '';
        } else {
          rows[targetIndex].azimuteStr = cols[0] || '';
          rows[targetIndex].distanciaStr = cols[1] || '';
        }
      } else if (cols.length >= 2) {
        if (isInitial) {
          rows[targetIndex].initialEStr = cols[0] || '';
          rows[targetIndex].initialNStr = cols[1] || '';
        } else {
          rows[targetIndex].azimuteStr = cols[0] || '';
          rows[targetIndex].distanciaStr = cols[1] || '';
        }
      } else if (cols.length === 1) {
        setFieldValue(targetIndex, startField, cols[0]);
      }
    });

    renderFull();
    showStatus('ok', `✓ ${grid.length} linha(s) importada(s) da área de transferência.`);
  });

  // ---------- EVENTOS: REMOVER LINHA ----------
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.row-remove-btn');
    if (!btn) return;
    const rowIndex = Number(btn.closest('tr').dataset.rowIndex);
    if (rowIndex === 0) return;
    rows.splice(rowIndex, 1);
    renderFull();
  });

  // ---------- EVENTOS: AÇÕES ----------
  btnAddRow.addEventListener('click', () => {
    rows.push(emptyRow());
    renderFull();
  });

  btnClosePolygon.addEventListener('click', () => {
    recompute();
    const last = computed[computed.length - 1];
    if (!(rows.length >= 3 && last && last.valid)) {
      showStatus('error', '❌ Revise as linhas destacadas em vermelho, ou adicione mais pontos (mínimo de 3) antes de fechar a poligonal.');
      return;
    }

    const pts = computed.map(c => ({ E: c.E, N: c.N }));
    const area = shoelaceArea(pts);
    const perimetro = rows.slice(1).reduce((sum, row) => {
      const d = parseNumber(row.distanciaStr);
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);
    const erroFechamento = distanceBetween(pts[pts.length - 1], pts[0]);
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

    renderSvg({ ok: fechou });
  });

  btnResetPoligonal.addEventListener('click', () => {
    const hasData = rows.length > 1 || rows[0].initialEStr || rows[0].initialNStr;
    if (!hasData) return;
    if (!confirm('Deseja limpar todos os pontos inseridos e recomeçar?')) return;

    rows = [emptyRow()];
    resultArea.textContent = '—';
    resultPerimetro.textContent = '—';
    resultFechamento.textContent = '—';
    resultFechamento.classList.remove('warn-value');

    clearStatus();
    renderFull();
  });

  // Estado inicial
  renderFull();
});
