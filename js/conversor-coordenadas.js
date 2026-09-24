/* ============================================================
   ZONEA — Conversor de coordenadas geográficas (latitude/longitude) para UTM
   Funções puras, sem dependências: leem latitude e longitude em graus decimais ou em graus,
   minutos e segundos, convertem pra UTM (série de Krüger, a mesma matemática do sentido inverso
   que já usamos no KML — conferida contra o pyproj) e montam o bloco pronto pra colar na
   Ferramenta de Poligonal (formato do memorial: vértice inicial, vértice final, azimute,
   distância, E e N).

   O Zonea trabalha na zona UTM 23S (meridiano central 45° W: a RMBH inteira cabe nela). A
   conversão é sempre feita nessa zona; longitudes fora do fuso 23 dão aviso, porque a distorção
   cresce quanto mais longe do meridiano central.
   ============================================================ */

(function (global) {
  'use strict';

  const ZONA_UTM = 23;
  const K0 = 0.9996;
  const FALSO_LESTE = 500000;
  const FALSO_NORTE = 10000000; // hemisfério sul
  const ELIPSOIDES = {
    sirgas2000: { a: 6378137.0, f: 1 / 298.257222101 },   // GRS80 (SIRGAS 2000 e, na prática, WGS 84)
    sad69: { a: 6378160.0, f: 1 / 298.25 },               // GRS67 modificado
  };

  // ---------- LEITURA ----------
  const num = (t) => parseFloat(String(t).replace(',', '.'));

  // Graus, minutos e segundos -> graus decimais (o sinal vale pro valor todo).
  function dmsParaGraus(graus, min, seg, negativo) {
    const v = Math.abs(graus) + (min || 0) / 60 + (seg || 0) / 3600;
    return negativo ? -v : v;
  }

  // Letra de hemisfério (pt-BR: L = leste, O = oeste). Devolve true se a coordenada é negativa.
  function hemisferioNegativo(letra) {
    return letra ? /[SWO]/i.test(letra) : false;
  }

  // Uma coordenada só (ex.: -19.9208 | 19°55'15"S | 43 56 16,1 W). Devolve { valor } ou { erro }.
  function lerCoordenada(texto) {
    const t = String(texto).trim().replace(/[−–]/g, '-');
    if (!t) return { erro: 'vazia' };

    // graus, minutos e segundos com símbolos: 19°55'15,2"S
    let m = t.match(/^([-+]?)\s*(\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')\s*)?)?([NSLOWEnslowe])?$/);
    if (m) {
      const [, sinal, g, mi, se, letra] = m;
      if (mi !== undefined && num(mi) >= 60) return { erro: 'minutos' };
      if (se !== undefined && num(se) >= 60) return { erro: 'segundos' };
      if (sinal === '-' && letra && !hemisferioNegativo(letra)) return { erro: 'sinal_e_letra' };
      return { valor: dmsParaGraus(num(g), mi === undefined ? 0 : num(mi), se === undefined ? 0 : num(se), sinal === '-' || hemisferioNegativo(letra)) };
    }

    // decimal, com sinal e/ou letra: -19.9208 | 19,9208 S
    m = t.match(/^([-+]?)\s*(\d+(?:[.,]\d+)?)\s*([NSLOWEnslowe])?$/);
    if (m) {
      const [, sinal, g, letra] = m;
      if (sinal === '-' && letra && !hemisferioNegativo(letra)) return { erro: 'sinal_e_letra' };
      return { valor: dmsParaGraus(num(g), 0, 0, sinal === '-' || hemisferioNegativo(letra)) };
    }

    // graus minutos segundos separados só por espaço: 19 55 15,2 S
    m = t.match(/^([-+]?)\s*(\d+)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?\s*([NSLOWEnslowe])?$/);
    if (m) {
      const [, sinal, g, mi, se, letra] = m;
      if (num(mi) >= 60) return { erro: 'minutos' };
      if (se !== undefined && num(se) >= 60) return { erro: 'segundos' };
      return { valor: dmsParaGraus(num(g), num(mi), se === undefined ? 0 : num(se), sinal === '-' || hemisferioNegativo(letra)) };
    }
    return { erro: 'formato' };
  }

  // Divide uma linha "latitude longitude" em duas coordenadas. Aceita tab, ponto e vírgula, vírgula
  // (quando o decimal é ponto) ou o ponto entre as duas metades (depois da letra de hemisfério ou do
  // símbolo de segundos).
  function dividirLinha(linha) {
    const t = String(linha).trim();
    if (/[\t;]/.test(t)) {
      const partes = t.split(/[\t;]/).map((p) => p.trim()).filter(Boolean);
      return partes.length === 2 ? partes : null;
    }
    // corte depois de "S/N/L/O/W/E" ou de aspas/segundos, quando há uma segunda coordenada em seguida
    let m = t.match(/^(.+?(?:[NSLOWEnslowe]|["″”]|'')[\s,]+)(?=[-+]?\d)(.+)$/);
    if (m) return [m[1].replace(/[\s,]+$/, ''), m[2]];
    // decimais ou graus/minutos/segundos só com espaço: contagem de números decide
    const nums = t.replace(/,(?=\s)/g, ' ').split(/\s+/).filter(Boolean);
    if (nums.length === 2) return nums;
    if (/,/.test(t) && !/\d,\d/.test(t)) { // "a, b" com decimal em ponto
      const p = t.split(',').map((x) => x.trim()).filter(Boolean);
      if (p.length === 2) return p;
    }
    if (nums.length === 4) return [nums.slice(0, 2).join(' '), nums.slice(2).join(' ')];
    if (nums.length === 6) return [nums.slice(0, 3).join(' '), nums.slice(3).join(' ')];
    return null;
  }

  const MENSAGENS = {
    vazia: 'está vazia',
    formato: 'formato não reconhecido',
    minutos: 'os minutos precisam ser menores que 60',
    segundos: 'os segundos precisam ser menores que 60',
    sinal_e_letra: 'sinal negativo e letra do hemisfério ao mesmo tempo (use só um)',
    latitude: 'a latitude precisa estar entre -90 e 90 (a primeira coordenada é a latitude)',
    longitude: 'a longitude precisa estar entre -180 e 180',
  };

  // Uma linha inteira -> { lat, lon } ou { erro: 'mensagem' }.
  function lerLinha(linha) {
    const partes = dividirLinha(linha);
    if (!partes) return { erro: MENSAGENS.formato + ' (esperado: latitude e longitude)' };
    const a = lerCoordenada(partes[0]);
    const b = lerCoordenada(partes[1]);
    if (a.erro) return { erro: 'latitude: ' + MENSAGENS[a.erro] };
    if (b.erro) return { erro: 'longitude: ' + MENSAGENS[b.erro] };
    if (Math.abs(a.valor) > 90) return { erro: MENSAGENS.latitude };
    if (Math.abs(b.valor) > 180) return { erro: MENSAGENS.longitude };
    return { lat: a.valor, lon: b.valor };
  }

  // ---------- CONVERSÃO ----------
  // latitude/longitude (graus) -> E/N em UTM (metros), na zona 23S, no elipsoide do datum informado.
  function latLonParaUtm(lat, lon, datum) {
    const elip = ELIPSOIDES[datum] || ELIPSOIDES.sirgas2000;
    const n = elip.f / (2 - elip.f);
    const n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    const A = elip.a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    const alfa = [
      n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180,
      13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
      61 * n3 / 240 - 103 * n4 / 140,
      49561 * n4 / 161280,
    ];
    const fi = lat * Math.PI / 180;
    const dl = (lon - (6 * ZONA_UTM - 183)) * Math.PI / 180; // diferença pro meridiano central
    const c = 2 * Math.sqrt(n) / (1 + n);
    const t = Math.sinh(Math.atanh(Math.sin(fi)) - c * Math.atanh(c * Math.sin(fi)));
    const xi0 = Math.atan2(t, Math.cos(dl));
    const eta0 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let xi = xi0, eta = eta0;
    for (let j = 1; j <= 4; j++) {
      xi += alfa[j - 1] * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
      eta += alfa[j - 1] * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
    }
    return { E: FALSO_LESTE + K0 * A * eta, N: FALSO_NORTE + K0 * A * xi };
  }

  // A longitude cai no fuso 23 (48° W a 42° W)? Fora dele a conversão distorce mais.
  function foraDoFuso23(lon) {
    return lon < -48 || lon > -42;
  }

  // ---------- AZIMUTE E DISTÂNCIA ENTRE DOIS PONTOS UTM ----------
  function azimuteDms(dE, dN) {
    let az = Math.atan2(dE, dN) * 180 / Math.PI;
    if (az < 0) az += 360;
    let cs = Math.round(az * 360000); // centésimos de segundo
    if (cs >= 360 * 360000) cs -= 360 * 360000;
    const graus = Math.floor(cs / 360000);
    const resto = cs - graus * 360000;
    const min = Math.floor(resto / 6000);
    const seg = (resto - min * 6000) / 100;
    return `${graus}°${String(min).padStart(2, '0')}'${seg.toFixed(2).replace('.', ',').padStart(5, '0')}"`;
  }

  const br = (v, casas) => v.toFixed(casas).replace('.', ',');

  // Bloco no formato do memorial (o que a Ferramenta de Poligonal entende ao colar, com 6 colunas):
  // cada linha traz o vértice inicial, o final, o azimute e a distância do segmento, e E/N do inicial.
  function gerarBloco(pontos) {
    return pontos.map((p, i) => {
      const prox = pontos[(i + 1) % pontos.length];
      const dE = prox.E - p.E, dN = prox.N - p.N;
      return [`P${i}`, `P${(i + 1) % pontos.length}`, azimuteDms(dE, dN), br(Math.hypot(dE, dN), 2), br(p.E, 4), br(p.N, 4)].join('\t');
    }).join('\n');
  }

  // Várias linhas de texto -> { pontos: [{lat, lon, E, N, linha}], erros: [{linha, mensagem}], foraDoFuso }
  function converterTexto(texto, datum) {
    const pontos = [];
    const erros = [];
    let fora = false;
    String(texto).split(/\r?\n/).forEach((bruta, i) => {
      if (!bruta.trim()) return;
      const l = lerLinha(bruta);
      if (l.erro) { erros.push({ linha: i + 1, mensagem: l.erro }); return; }
      const utm = latLonParaUtm(l.lat, l.lon, datum);
      if (foraDoFuso23(l.lon)) fora = true;
      pontos.push({ lat: l.lat, lon: l.lon, E: utm.E, N: utm.N, linha: i + 1 });
    });
    return { pontos, erros, foraDoFuso: fora };
  }

  global.ZoneaCoordenadas = { lerCoordenada, lerLinha, latLonParaUtm, foraDoFuso23, azimuteDms, gerarBloco, converterTexto };
})(typeof window !== 'undefined' ? window : globalThis);
