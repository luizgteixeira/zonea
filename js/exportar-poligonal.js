/* ============================================================
   ZONEA — Exportação da poligonal (DXF, KML e KMZ)
   Funções puras: recebem os vértices já calculados pela Ferramenta de
   Poligonal (E/N em UTM zona 23S, SIRGAS 2000 ou SAD-69) e devolvem o conteúdo
   dos arquivos. Nada aqui mexe na página — quem baixa é baixarArquivo().

   - DXF (AutoCAD R12): desenho em metros, nas mesmas coordenadas UTM da
     ferramenta. Abre em AutoCAD, BricsCAD, LibreCAD, QGIS etc. O DWG é um
     formato proprietário da Autodesk e não dá pra gerar direto no navegador.
   - KML / KMZ (Google Earth): latitude/longitude. O KMZ é o KML compactado
     (aqui, ZIP sem compressão, escrito à mão — sem dependência externa).
     Se o memorial estiver em SAD-69, as coordenadas são convertidas para SIRGAS 2000
     antes (o Google Earth trabalha em WGS84, que é praticamente igual ao SIRGAS 2000);
     sem essa conversão o desenho cairia uns 60 m fora do lugar na RMBH.
   ============================================================ */

(function (global) {
  'use strict';

  // Mesmo sistema que a ferramenta assume: SIRGAS 2000 / UTM zona 23S (EPSG:31983).
  // A RMBH inteira cabe na zona 23 (meridiano central 45° W). Se a ferramenta um dia
  // aceitar outra zona, é aqui (e no aviso de datum da página) que isso muda.
  const ZONA_UTM = 23;
  const K0 = 0.9996;
  const FALSO_LESTE = 500000;
  const FALSO_NORTE = 10000000;            // hemisfério sul

  // Datums aceitos pra ler as coordenadas do memorial. O DXF nunca converte nada (sai nas
  // mesmas coordenadas UTM informadas); só o KML/KMZ precisa de lat/lon em SIRGAS 2000/WGS84.
  //   - SIRGAS 2000: elipsoide GRS80, sem conversão.
  //   - SAD-69: elipsoide GRS67 modificado + translação geocêntrica de 3 parâmetros do IBGE
  //     (Resolução PR 1/2005, SAD-69 → SIRGAS 2000): ΔX = -67,35 m, ΔY = +3,88 m, ΔZ = -38,22 m.
  //     É aproximada (erro típico de poucos metros), e não substitui a transformação oficial.
  const ELIPSOIDES = {
    grs80: { a: 6378137.0, f: 1 / 298.257222101 },
    grs67: { a: 6378160.0, f: 1 / 298.25 },
  };
  const DATUNS = {
    sirgas2000: { rotulo: 'SIRGAS 2000', elipsoide: 'grs80', translacao: null },
    sad69: { rotulo: 'SAD-69', elipsoide: 'grs67', translacao: { dx: -67.35, dy: 3.88, dz: -38.22 } },
  };

  function datumValido(chave) {
    return Object.prototype.hasOwnProperty.call(DATUNS, chave) ? chave : 'sirgas2000';
  }

  // Distância abaixo da qual o último vértice é considerado o mesmo que o primeiro
  // (mesma tolerância de fechamento da ferramenta: 5 cm).
  const TOLERANCIA_FECHAMENTO_M = 0.05;

  // ---------- UTM → latitude/longitude (série de Krüger, 4ª ordem) ----------
  // Devolve a lat/lon NO PRÓPRIO datum do memorial (mesmo elipsoide das coordenadas).
  function utmParaLatLonNoElipsoide(E, N, elipsoide) {
    const { a: SEMIEIXO_A, f: ACHATAMENTO } = elipsoide;
    const n = ACHATAMENTO / (2 - ACHATAMENTO);
    const n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    const A = SEMIEIXO_A / (1 + n) * (1 + n2 / 4 + n4 / 64);
    const beta = [
      n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360,
      n2 / 48 + n3 / 15 - 437 * n4 / 1440,
      17 * n3 / 480 - 37 * n4 / 840,
      4397 * n4 / 161280,
    ];
    const delta = [
      2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45,
      7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
      56 * n3 / 15 - 136 * n4 / 35,
      4279 * n4 / 630,
    ];

    const xi = (N - FALSO_NORTE) / (K0 * A);
    const eta = (E - FALSO_LESTE) / (K0 * A);
    let xiL = xi;
    let etaL = eta;
    for (let j = 1; j <= 4; j++) {
      xiL -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      etaL -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xiL) / Math.cosh(etaL));
    let lat = chi;
    for (let j = 1; j <= 4; j++) lat += delta[j - 1] * Math.sin(2 * j * chi);
    const lon0 = (6 * ZONA_UTM - 183) * Math.PI / 180;
    const lon = lon0 + Math.atan2(Math.sinh(etaL), Math.cos(xiL));
    return { lat, lon }; // radianos
  }

  // lat/lon/altura → X/Y/Z geocêntricos, e a volta (iterativa; converge em poucas voltas)
  function geodesicasParaXyz(lat, lon, h, { a, f }) {
    const e2 = f * (2 - f);
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    return {
      x: (N + h) * Math.cos(lat) * Math.cos(lon),
      y: (N + h) * Math.cos(lat) * Math.sin(lon),
      z: (N * (1 - e2) + h) * Math.sin(lat),
    };
  }

  function xyzParaGeodesicas({ x, y, z }, { a, f }) {
    const e2 = f * (2 - f);
    const p = Math.hypot(x, y);
    let lat = Math.atan2(z, p * (1 - e2));
    for (let i = 0; i < 10; i++) {
      const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
      const h = p / Math.cos(lat) - N;
      lat = Math.atan2(z, p * (1 - e2 * N / (N + h)));
    }
    return { lat, lon: Math.atan2(y, x) };
  }

  // UTM (no datum informado) → latitude/longitude em graus, em SIRGAS 2000 (≈ WGS84).
  function utmParaLatLon(E, N, datum) {
    const d = DATUNS[datumValido(datum)];
    const origem = ELIPSOIDES[d.elipsoide];
    const { lat, lon } = utmParaLatLonNoElipsoide(E, N, origem);
    if (!d.translacao) return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };

    const xyz = geodesicasParaXyz(lat, lon, 0, origem);
    const destino = xyzParaGeodesicas({
      x: xyz.x + d.translacao.dx,
      y: xyz.y + d.translacao.dy,
      z: xyz.z + d.translacao.dz,
    }, ELIPSOIDES.grs80);
    return { lat: destino.lat * 180 / Math.PI, lon: destino.lon * 180 / Math.PI };
  }

  // ---------- PREPARO DOS VÉRTICES ----------
  // A ferramenta calcula P0 (ponto inicial) e um ponto por segmento; numa poligonal
  // que fecha, o último ponto cai em cima do P0. Pra exportar, esse vértice repetido
  // é descartado (o desenho já é fechado) — senão sobraria um segmento de comprimento
  // zero. Se NÃO fechou (erro acima da tolerância), todos os vértices são mantidos.
  function prepararVertices(pontos) {
    const vertices = pontos.map((p, i) => ({ E: p.E, N: p.N, rotulo: 'P' + i }));
    if (vertices.length > 3) {
      const primeiro = vertices[0];
      const ultimo = vertices[vertices.length - 1];
      if (Math.hypot(ultimo.E - primeiro.E, ultimo.N - primeiro.N) <= TOLERANCIA_FECHAMENTO_M) {
        vertices.pop();
      }
    }
    return vertices;
  }

  function areaComSinal(vertices) {
    let soma = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      soma += a.E * b.N - b.E * a.N;
    }
    return soma / 2; // > 0: anti-horário
  }

  function semAcento(texto) {
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  }

  function fmt(valor, casas) {
    return Number(valor).toFixed(casas);
  }

  function formatoBR(valor, casas) {
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  // ---------- DXF (AutoCAD R12, ASCII) ----------
  // Só ASCII de propósito: DXF R12 não tem codificação declarada, e acento vira
  // lixo em vários programas. Por isso os textos do desenho saem sem acento.
  function gerarDXF({ pontos, area, perimetro, erroFechamento, datum }) {
    const v = prepararVertices(pontos);
    const linhas = [];
    const g = (codigo, valor) => { linhas.push(String(codigo), String(valor)); };

    const es = v.map(p => p.E), ns = v.map(p => p.N);
    const minE = Math.min(...es), maxE = Math.max(...es);
    const minN = Math.min(...ns), maxN = Math.max(...ns);
    const extensao = Math.max(maxE - minE, maxN - minN, 1);
    const alturaTexto = Math.max(extensao * 0.02, 0.2);
    const raioMarcador = alturaTexto * 0.4;
    const margem = alturaTexto * 8;

    // Vértices com 6 casas decimais: a 3 (1 mm) o arredondamento já muda a área em ~0,02 m²,
    // e quem abre o DXF no CAD compara com o número da ferramenta.
    // HEADER
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$EXTMIN'); g(10, fmt(minE - margem, 3)); g(20, fmt(minN - margem, 3)); g(30, '0.0');
    g(9, '$EXTMAX'); g(10, fmt(maxE + margem, 3)); g(20, fmt(maxN + margem, 3)); g(30, '0.0');
    g(0, 'ENDSEC');

    // TABLES
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '0.2'); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, 3);
    g(0, 'LAYER'); g(2, 'ZONEA_POLIGONAL'); g(70, 0); g(62, 4); g(6, 'CONTINUOUS'); // ciano: o azul puro some no fundo preto do AutoCAD
    g(0, 'LAYER'); g(2, 'ZONEA_VERTICES'); g(70, 0); g(62, 3); g(6, 'CONTINUOUS');
    g(0, 'LAYER'); g(2, 'ZONEA_TEXTO'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    // ENTITIES
    g(0, 'SECTION'); g(2, 'ENTITIES');

    g(0, 'POLYLINE'); g(8, 'ZONEA_POLIGONAL'); g(66, 1);
    g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(70, 1); // 70 = 1: polilinha fechada
    v.forEach(p => {
      g(0, 'VERTEX'); g(8, 'ZONEA_POLIGONAL');
      g(10, fmt(p.E, 6)); g(20, fmt(p.N, 6)); g(30, '0.0');
    });
    g(0, 'SEQEND'); g(8, 'ZONEA_POLIGONAL');

    v.forEach(p => {
      g(0, 'CIRCLE'); g(8, 'ZONEA_VERTICES');
      g(10, fmt(p.E, 6)); g(20, fmt(p.N, 6)); g(30, '0.0'); g(40, fmt(raioMarcador, 3));
      g(0, 'TEXT'); g(8, 'ZONEA_TEXTO');
      g(10, fmt(p.E + raioMarcador * 1.5, 3)); g(20, fmt(p.N + raioMarcador * 1.5, 3)); g(30, '0.0');
      g(40, fmt(alturaTexto, 3)); g(1, semAcento(p.rotulo));
    });

    const resumo1 = `AREA: ${fmt(area, 2)} m2  |  PERIMETRO: ${fmt(perimetro, 2)} m  |  ERRO DE FECHAMENTO: ${fmt(erroFechamento, 3)} m`;
    const resumo2 = `${DATUNS[datumValido(datum)].rotulo} / UTM 23S (coordenadas como informadas) - gerado pelo Zonea (ferramenta de apoio, nao substitui ART/RRT)`;
    [resumo1, resumo2].forEach((texto, i) => {
      g(0, 'TEXT'); g(8, 'ZONEA_TEXTO');
      g(10, fmt(minE, 3)); g(20, fmt(minN - alturaTexto * (3 + i * 2), 3)); g(30, '0.0');
      g(40, fmt(alturaTexto, 3)); g(1, texto);
    });

    g(0, 'ENDSEC');
    g(0, 'EOF');
    return linhas.join('\r\n') + '\r\n';
  }

  // ---------- KML (Google Earth) ----------
  function escapaXml(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function textoSistemaDeOrigem(datum) {
    if (datumValido(datum) === 'sad69') {
      return `<b>Sistema de origem:</b> SAD-69 / UTM zona 23S, convertido para SIRGAS 2000 (translação de 3 parâmetros do IBGE, ` +
        `precisão de poucos metros) e depois para latitude/longitude. Confira a posição antes de usar.<br>`;
    }
    return `<b>Sistema de origem:</b> SIRGAS 2000 / UTM zona 23S (EPSG:31983), convertido para latitude/longitude.<br>`;
  }

  function gerarKML({ pontos, area, perimetro, erroFechamento, datum }) {
    let v = prepararVertices(pontos);
    const coordenadas = v.map(p => ({ ...p, ...utmParaLatLon(p.E, p.N, datum) }));

    // O anel externo do KML deve ser anti-horário e fechado (primeiro ponto repetido no fim).
    let anel = coordenadas.slice();
    if (areaComSinal(v) < 0) anel.reverse();
    anel.push(anel[0]);
    const textoAnel = anel.map(p => `${fmt(p.lon, 9)},${fmt(p.lat, 9)},0`).join(' ');

    const descricao =
      `<b>Área:</b> ${formatoBR(area, 2)} m²<br>` +
      `<b>Perímetro:</b> ${formatoBR(perimetro, 2)} m<br>` +
      `<b>Erro de fechamento:</b> ${formatoBR(erroFechamento, 3)} m<br>` +
      textoSistemaDeOrigem(datum) +
      `<i>Gerado pelo Zonea — ferramenta de apoio, não substitui ART/RRT. Calculado a partir dos dados informados pelo usuário; o Zonea não atesta a exatidão desses dados.</i>`;

    const marcadores = coordenadas.map(p =>
      `    <Placemark>\n` +
      `      <name>${escapaXml(p.rotulo)}</name>\n` +
      `      <styleUrl>#vertice</styleUrl>\n` +
      `      <description>E ${fmt(p.E, 3)} m · N ${fmt(p.N, 3)} m (UTM 23S)</description>\n` +
      `      <Point><coordinates>${fmt(p.lon, 9)},${fmt(p.lat, 9)},0</coordinates></Point>\n` +
      `    </Placemark>`
    ).join('\n');

    // Cores do KML são aabbggrr. Azul do Zonea (#1E5AA8) = ffa85a1e; preenchimento com transparência.
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
`<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
`  <Document>\n` +
`    <name>Poligonal Zonea</name>\n` +
`    <description><![CDATA[${descricao}]]></description>\n` +
`    <Style id="poligono">\n` +
`      <LineStyle><color>ffa85a1e</color><width>3</width></LineStyle>\n` +
`      <PolyStyle><color>4da85a1e</color></PolyStyle>\n` +
`    </Style>\n` +
`    <Style id="vertice">\n` +
`      <IconStyle><scale>0.6</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>\n` +
`      <LabelStyle><scale>0.8</scale></LabelStyle>\n` +
`    </Style>\n` +
`    <Placemark>\n` +
`      <name>Poligonal</name>\n` +
`      <styleUrl>#poligono</styleUrl>\n` +
`      <description><![CDATA[${descricao}]]></description>\n` +
`      <Polygon>\n` +
`        <tessellate>1</tessellate>\n` +
`        <outerBoundaryIs><LinearRing><coordinates>${textoAnel}</coordinates></LinearRing></outerBoundaryIs>\n` +
`      </Polygon>\n` +
`    </Placemark>\n` +
`${marcadores}\n` +
`  </Document>\n` +
`</kml>\n`;
  }

  // ---------- KMZ = ZIP com o KML dentro (doc.kml) ----------
  const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ZIP "armazenado" (sem compressão): suficiente pra um KML pequeno e bem mais
  // simples que trazer uma biblioteca só pra isso.
  function zipArmazenado(arquivos) {
    const codifica = new TextEncoder();
    const agora = new Date();
    const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();

    const partes = [];
    const central = [];
    let deslocamento = 0;

    arquivos.forEach(({ nome, dados }) => {
      const nomeBytes = codifica.encode(nome);
      const crc = crc32(dados);

      const local = new Uint8Array(30 + nomeBytes.length);
      const dvL = new DataView(local.buffer);
      dvL.setUint32(0, 0x04034b50, true);
      dvL.setUint16(4, 20, true);
      dvL.setUint16(6, 0x0800, true);          // nomes em UTF-8
      dvL.setUint16(8, 0, true);               // método 0 = armazenado
      dvL.setUint16(10, hora, true);
      dvL.setUint16(12, data, true);
      dvL.setUint32(14, crc, true);
      dvL.setUint32(18, dados.length, true);
      dvL.setUint32(22, dados.length, true);
      dvL.setUint16(26, nomeBytes.length, true);
      dvL.setUint16(28, 0, true);
      local.set(nomeBytes, 30);
      partes.push(local, dados);

      const cab = new Uint8Array(46 + nomeBytes.length);
      const dvC = new DataView(cab.buffer);
      dvC.setUint32(0, 0x02014b50, true);
      dvC.setUint16(4, 20, true);
      dvC.setUint16(6, 20, true);
      dvC.setUint16(8, 0x0800, true);
      dvC.setUint16(10, 0, true);
      dvC.setUint16(12, hora, true);
      dvC.setUint16(14, data, true);
      dvC.setUint32(16, crc, true);
      dvC.setUint32(20, dados.length, true);
      dvC.setUint32(24, dados.length, true);
      dvC.setUint16(28, nomeBytes.length, true);
      dvC.setUint32(42, deslocamento, true);
      cab.set(nomeBytes, 46);
      central.push(cab);

      deslocamento += local.length + dados.length;
    });

    const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);
    const fim = new Uint8Array(22);
    const dvF = new DataView(fim.buffer);
    dvF.setUint32(0, 0x06054b50, true);
    dvF.setUint16(8, arquivos.length, true);
    dvF.setUint16(10, arquivos.length, true);
    dvF.setUint32(12, tamanhoCentral, true);
    dvF.setUint32(16, deslocamento, true);

    const todas = [...partes, ...central, fim];
    const total = todas.reduce((s, p) => s + p.length, 0);
    const saida = new Uint8Array(total);
    let pos = 0;
    todas.forEach(p => { saida.set(p, pos); pos += p.length; });
    return saida;
  }

  function gerarKMZ(dadosDaPoligonal) {
    const kml = gerarKML(dadosDaPoligonal);
    return zipArmazenado([{ nome: 'doc.kml', dados: new TextEncoder().encode(kml) }]);
  }

  // ---------- DOWNLOAD (só no navegador) ----------
  function baixarArquivo(nome, conteudo, tipoMime) {
    const blob = new Blob([conteudo], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.ZoneaExport = { DATUNS, utmParaLatLon, prepararVertices, gerarDXF, gerarKML, gerarKMZ, baixarArquivo };
})(typeof window !== 'undefined' ? window : globalThis);
