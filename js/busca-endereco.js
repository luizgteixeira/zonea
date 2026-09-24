/* ============================================================
   ZONEA — Busca por endereço ou CEP (página do mapa)
   Descobre em qual município da RMBH fica o endereço/CEP digitado:
     1. CEP → BrasilAPI (rua, bairro, cidade e, quando tem, latitude/longitude);
        se não vier coordenada, ou a BrasilAPI cair, tenta o ViaCEP + geocodificação.
     2. Endereço → Nominatim (OpenStreetMap), limitado à caixa da RMBH pra não
        cair numa rua de mesmo nome em outro estado.
     3. Com a coordenada, ponto-em-polígono contra a malha do IBGE (a mesma do mapa).
   Tudo no navegador, sem servidor do Zonea: o que a pessoa digita vai direto pra
   esses serviços públicos e nada é guardado por nós.
   ============================================================ */

(function (global) {
  'use strict';

  const BRASILAPI_CEP = 'https://brasilapi.com.br/api/cep/v2/';
  const VIACEP = 'https://viacep.com.br/ws/';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const TEMPO_LIMITE_MS = 10000;

  // ---------- ENTRADA ----------
  // Devolve { tipo: 'vazio' | 'cep' | 'cep_invalido' | 'curto' | 'endereco', ... }
  function interpretarEntrada(texto) {
    const t = String(texto == null ? '' : texto).trim().replace(/\s+/g, ' ');
    if (!t) return { tipo: 'vazio' };
    if (/^[\d.\-\s]+$/.test(t)) {
      const digitos = t.replace(/\D/g, '');
      return digitos.length === 8 ? { tipo: 'cep', cep: digitos } : { tipo: 'cep_invalido' };
    }
    if (t.length < 5) return { tipo: 'curto' };
    return { tipo: 'endereco', texto: t };
  }

  // ---------- REDE ----------
  async function buscarJson(url) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    try {
      const res = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
      let json = null;
      try { json = await res.json(); } catch { /* corpo vazio ou não-JSON */ }
      return { status: res.status, ok: res.ok, json };
    } finally {
      clearTimeout(relogio);
    }
  }

  // Geocodifica um texto dentro da caixa da RMBH ({ oeste, sul, leste, norte }).
  async function geocodificar(texto, caixa) {
    const params = new URLSearchParams({
      format: 'jsonv2', limit: '1', countrycodes: 'br', addressdetails: '0', q: texto,
    });
    if (caixa) {
      params.set('viewbox', `${caixa.oeste},${caixa.norte},${caixa.leste},${caixa.sul}`);
      params.set('bounded', '1');
    }
    const r = await buscarJson(`${NOMINATIM}?${params.toString()}`);
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
    const primeiro = Array.isArray(r.json) ? r.json[0] : null;
    if (!primeiro) return null;
    const lat = parseFloat(primeiro.lat);
    const lon = parseFloat(primeiro.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, rotulo: primeiro.display_name };
  }

  function rotuloDoCep(rua, bairro, cidade, uf) {
    return [rua, bairro, [cidade, uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
  }

  // Resultado: { lat, lon, rotulo, precisao: 'cep' } ou { erro: 'cep_nao_encontrado' | 'nao_localizado' }
  async function buscarCep(cep, caixa) {
    let rua = '', bairro = '', cidade = '', uf = '';
    let brasilApiOk = false;

    try {
      const r = await buscarJson(BRASILAPI_CEP + cep);
      if (r.status === 404) return { erro: 'cep_nao_encontrado' };
      if (r.ok && r.json) {
        brasilApiOk = true;
        rua = r.json.street || ''; bairro = r.json.neighborhood || '';
        cidade = r.json.city || ''; uf = r.json.state || '';
        const c = r.json.location && r.json.location.coordinates;
        const lat = c ? parseFloat(c.latitude) : NaN;
        const lon = c ? parseFloat(c.longitude) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon, rotulo: rotuloDoCep(rua, bairro, cidade, uf), precisao: 'cep' };
        }
      }
    } catch (err) {
      console.error('BrasilAPI indisponível, tentando o ViaCEP:', err);
    }

    // BrasilAPI sem coordenada (ou fora do ar): pega o endereço no ViaCEP e geocodifica.
    if (!brasilApiOk) {
      const v = await buscarJson(`${VIACEP}${cep}/json/`);
      if (!v.ok || !v.json) throw new Error('ViaCEP indisponível');
      if (v.json.erro) return { erro: 'cep_nao_encontrado' };
      rua = v.json.logradouro || ''; bairro = v.json.bairro || '';
      cidade = v.json.localidade || ''; uf = v.json.uf || '';
    }

    const consulta = [rua, cidade, uf].filter(Boolean).join(', ') || [bairro, cidade, uf].filter(Boolean).join(', ');
    if (!consulta) return { erro: 'nao_localizado' };
    const achou = await geocodificar(consulta, caixa);
    if (!achou) return { erro: 'nao_localizado' };
    return { lat: achou.lat, lon: achou.lon, rotulo: rotuloDoCep(rua, bairro, cidade, uf), precisao: 'cep' };
  }

  // Resultado: { lat, lon, rotulo, precisao: 'endereco' } ou { erro: 'nao_localizado' }
  async function buscarEndereco(texto, caixa) {
    const achou = await geocodificar(texto, caixa);
    if (!achou) return { erro: 'nao_localizado' };
    return { lat: achou.lat, lon: achou.lon, rotulo: achou.rotulo, precisao: 'endereco' };
  }

  // ---------- GEOMETRIA ----------
  // Ponto dentro de um anel (regra par-ímpar). Coordenadas GeoJSON: [lon, lat].
  function pontoNoAnel(lon, lat, anel) {
    let dentro = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  function pontoNoPoligono(lon, lat, aneis) {
    if (!aneis.length || !pontoNoAnel(lon, lat, aneis[0])) return false;
    for (let k = 1; k < aneis.length; k++) {
      if (pontoNoAnel(lon, lat, aneis[k])) return false; // caiu num buraco
    }
    return true;
  }

  function pontoNaGeometria(lon, lat, geometria) {
    if (!geometria) return false;
    if (geometria.type === 'Polygon') return pontoNoPoligono(lon, lat, geometria.coordinates);
    if (geometria.type === 'MultiPolygon') return geometria.coordinates.some(p => pontoNoPoligono(lon, lat, p));
    return false;
  }

  // Feature do GeoJSON que contém o ponto, ou null se estiver fora da RMBH.
  function acharFeature(lon, lat, geojson) {
    const features = (geojson && geojson.features) || [];
    return features.find(f => pontoNaGeometria(lon, lat, f.geometry)) || null;
  }

  // Caixa envolvente de toda a malha, pra limitar a geocodificação à RMBH.
  function caixaDaMalha(geojson) {
    let oeste = Infinity, sul = Infinity, leste = -Infinity, norte = -Infinity;
    const visita = (c) => {
      if (typeof c[0] === 'number') {
        oeste = Math.min(oeste, c[0]); leste = Math.max(leste, c[0]);
        sul = Math.min(sul, c[1]); norte = Math.max(norte, c[1]);
      } else {
        c.forEach(visita);
      }
    };
    ((geojson && geojson.features) || []).forEach(f => f.geometry && visita(f.geometry.coordinates));
    return Number.isFinite(oeste) ? { oeste, sul, leste, norte } : null;
  }

  global.ZoneaEndereco = {
    interpretarEntrada, buscarCep, buscarEndereco, acharFeature, caixaDaMalha, pontoNaGeometria,
  };
})(typeof window !== 'undefined' ? window : globalThis);
