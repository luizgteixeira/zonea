/* ============================================================
   ZONEA — Relatório da Poligonal em PDF
   Gera o PDF inteiro no navegador, escrito à mão (sem biblioteca e sem enviar nada a
   servidor): texto na fonte padrão Helvetica, que todo leitor de PDF já tem, e o desenho
   da poligonal em vetor, então continua nítido em qualquer zoom ou impressão.

   Recebe os mesmos dados que os arquivos DXF/KML (js/exportar-poligonal.js) e devolve os
   bytes do PDF. Carregue exportar-poligonal.js antes: os vértices vêm de lá, pra o relatório
   descrever exatamente o mesmo polígono dos outros arquivos.
   ============================================================ */

(function (global) {
  'use strict';

  const PAGINA = { w: 595.28, h: 841.89 }; // A4 em pontos (1 pt = 1/72 pol)
  const MARGEM = 42;
  const RODAPE = 36;                       // faixa reservada ao rodapé, acima da margem inferior
  const TOLERANCIA_FECHAMENTO_M = 0.05;    // a mesma da ferramenta e dos outros arquivos

  const COR = {
    escuro: [0.059, 0.09, 0.165],
    cinza: [0.278, 0.333, 0.412],
    claro: [0.58, 0.64, 0.72],
    borda: [0.8, 0.835, 0.878],
    fundo: [0.945, 0.961, 0.976],
    azul: [0.118, 0.353, 0.659],
    azulSuave: [0.882, 0.929, 0.976],
    verde: [0.141, 0.431, 0.267],
    aviso: [0.706, 0.325, 0.035],
    branco: [1, 1, 1],
  };

  // Larguras dos caracteres da Helvetica (milésimos de em), códigos 32 a 255 da codificação
  // WinAnsi (cp1252). Servem pra alinhar à direita, centralizar e quebrar linhas com precisão.
  const LARGURAS = {
    regular: [
      278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
      556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,
      556, 1000, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 1000, 611, 1000,
      1000, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 1000, 500, 667,
      278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
      722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
      556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
    ],
    negrito: [
      278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
      975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
      333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
      611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
      556, 1000, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 1000, 611, 1000,
      1000, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 1000, 500, 667,
      278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
      722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
      556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
      611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
    ],
  };

  // ---------- TEXTO (WinAnsi / cp1252) ----------
  // Fora do ASCII e do Latin-1, o cp1252 tem só estes (aspas curvas, travessões, reticências...).
  const EXTRAS_CP1252 = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
    0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
    0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
  };

  function bytesCp1252(texto) {
    const saida = [];
    for (const ch of String(texto)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) saida.push(c);
      else if (c >= 160 && c <= 255) saida.push(c);
      else if (EXTRAS_CP1252[c]) saida.push(EXTRAS_CP1252[c]);
      else if (c === 9 || c === 10 || c === 13) saida.push(32);
      else saida.push(63); // "?" pro que a fonte não tem
    }
    return saida;
  }

  function larguraTexto(texto, tam, negrito) {
    const tabela = negrito ? LARGURAS.negrito : LARGURAS.regular;
    return bytesCp1252(texto).reduce((soma, b) => soma + (tabela[b - 32] || 0), 0) * tam / 1000;
  }

  // Texto como string literal do PDF: parênteses e barra escapados, e tudo fora do ASCII
  // visível em octal — assim o arquivo inteiro é ASCII puro.
  function literalPdf(texto) {
    const partes = bytesCp1252(texto).map((b) => {
      if (b === 40 || b === 41 || b === 92) return '\\' + String.fromCharCode(b);
      if (b < 32 || b > 126) return '\\' + b.toString(8).padStart(3, '0');
      return String.fromCharCode(b);
    });
    return '(' + partes.join('') + ')';
  }

  function quebrarLinhas(texto, larguraMax, tam, negrito) {
    const linhas = [];
    let atual = '';
    String(texto).split(/\s+/).filter(Boolean).forEach((palavra) => {
      const tentativa = atual ? atual + ' ' + palavra : palavra;
      if (atual && larguraTexto(tentativa, tam, negrito) > larguraMax) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  // ---------- NÚMEROS ----------
  const n = (v) => String(Number(v.toFixed(3)));           // número dentro do PDF (sempre com ponto)
  const cor = (c) => `${n(c[0])} ${n(c[1])} ${n(c[2])}`;
  const fmt = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  // Azimute em graus, minutos e segundos (com centésimos), do vetor (dE, dN).
  function azimuteDms(dE, dN) {
    let az = Math.atan2(dE, dN) * 180 / Math.PI;
    if (az < 0) az += 360;
    let cs = Math.round(az * 360000);                       // centésimos de segundo
    if (cs >= 360 * 360000) cs -= 360 * 360000;
    const graus = Math.floor(cs / 360000);
    const resto = cs - graus * 360000;
    const min = Math.floor(resto / 6000);
    const seg = (resto - min * 6000) / 100;
    return `${graus}°${String(min).padStart(2, '0')}'${seg.toFixed(2).replace('.', ',').padStart(5, '0')}"`;
  }

  function dataHora(d) {
    const dois = (x) => String(x).padStart(2, '0');
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }

  // ---------- PÁGINA (lista de operações de desenho) ----------
  function novaPagina() {
    const ops = [];
    return {
      ops,
      texto(x, y, txt, { tam = 9, negrito = false, cor: c = COR.escuro, alinhar = 'esq' } = {}) {
        const w = larguraTexto(txt, tam, negrito);
        const xi = alinhar === 'dir' ? x - w : alinhar === 'centro' ? x - w / 2 : x;
        ops.push(`BT /${negrito ? 'F2' : 'F1'} ${n(tam)} Tf ${cor(c)} rg ${n(xi)} ${n(y)} Td ${literalPdf(txt)} Tj ET`);
      },
      linha(x1, y1, x2, y2, { cor: c = COR.borda, largura = 0.6, tracejado = null } = {}) {
        ops.push(`q ${cor(c)} RG ${n(largura)} w ${tracejado ? `[${tracejado.join(' ')}] 0 d ` : ''}${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S Q`);
      },
      retangulo(x, y, w, h, { preenche = null, contorno = null, largura = 0.6 } = {}) {
        const p = ['q'];
        if (preenche) p.push(`${cor(preenche)} rg`);
        if (contorno) p.push(`${cor(contorno)} RG ${n(largura)} w`);
        p.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
        p.push(preenche && contorno ? 'B' : preenche ? 'f' : 'S', 'Q');
        ops.push(p.join(' '));
      },
      caminho(pts, { fechar = false, preenche = null, contorno = null, largura = 1 } = {}) {
        const p = ['q'];
        if (preenche) p.push(`${cor(preenche)} rg`);
        if (contorno) p.push(`${cor(contorno)} RG ${n(largura)} w 1 j 1 J`);
        pts.forEach((pt, i) => p.push(`${n(pt.x)} ${n(pt.y)} ${i === 0 ? 'm' : 'l'}`));
        if (fechar) p.push('h');
        p.push(preenche && contorno ? 'B' : preenche ? 'f' : 'S', 'Q');
        ops.push(p.join(' '));
      },
      circulo(cx, cy, r, { preenche = null, contorno = null, largura = 0.8 } = {}) {
        const k = 0.5523 * r;
        const p = ['q'];
        if (preenche) p.push(`${cor(preenche)} rg`);
        if (contorno) p.push(`${cor(contorno)} RG ${n(largura)} w`);
        p.push(`${n(cx + r)} ${n(cy)} m`,
          `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
          `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
          `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
          `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c h`);
        p.push(preenche && contorno ? 'B' : preenche ? 'f' : 'S', 'Q');
        ops.push(p.join(' '));
      },
    };
  }

  // ---------- DESENHO DA POLIGONAL ----------
  function desenharPoligono(pg, caixa, vertices, fechou) {
    const { x, y, w, h } = caixa; // y = base da caixa
    const pad = 36;
    const Es = vertices.map(v => v.E);
    const Ns = vertices.map(v => v.N);
    const minE = Math.min(...Es), maxE = Math.max(...Es);
    const minN = Math.min(...Ns), maxN = Math.max(...Ns);
    const amplE = (maxE - minE) || 1;
    const amplN = (maxN - minN) || 1;
    const escala = Math.min((w - 2 * pad) / amplE, (h - 2 * pad) / amplN);
    const ox = x + (w - amplE * escala) / 2;
    const oy = y + (h - amplN * escala) / 2;
    const pts = vertices.map(v => ({ x: ox + (v.E - minE) * escala, y: oy + (v.N - minN) * escala }));

    pg.caminho(pts, { fechar: true, preenche: COR.azulSuave });
    if (fechou) {
      pg.caminho(pts, { fechar: true, contorno: COR.azul, largura: 1.4 });
    } else {
      pg.caminho(pts, { fechar: false, contorno: COR.azul, largura: 1.4 });
      pg.linha(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, { cor: COR.aviso, largura: 1.2, tracejado: [4, 3] });
    }

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pts.forEach((p, i) => {
      pg.circulo(p.x, p.y, i === 0 ? 3.8 : 3, { preenche: i === 0 ? COR.verde : COR.azul, contorno: COR.branco, largura: 0.8 });
    });

    // Rótulos: tenta primeiro "pra fora" do polígono; se bater noutro rótulo ou num vértice
    // (segmentos curtos deixam vértices colados), gira e afasta até achar um espaço livre.
    const ocupados = [];
    const bate = (c) =>
      ocupados.some(o => !(c.x1 < o.x0 || c.x0 > o.x1 || c.y1 < o.y0 || c.y0 > o.y1)) ||
      pts.some(q => q.x > c.x0 - 4 && q.x < c.x1 + 4 && q.y > c.y0 - 4 && q.y < c.y1 + 4);
    const dentroDaCaixa = (c) => c.x0 >= x + 4 && c.x1 <= x + w - 4 && c.y0 >= y + 4 && c.y1 <= y + h - 4;
    pts.forEach((p, i) => {
      const rotulo = vertices[i].rotulo;
      const larg = larguraTexto(rotulo, 7.5, false);
      const base = Math.atan2(p.y - cy, p.x - cx);
      let escolhido = null;
      for (const raio of [10, 15, 21, 28]) {
        for (const desvio of [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]) {
          const ang = base + desvio * Math.PI / 180;
          const tx = p.x + Math.cos(ang) * raio;
          const ty = p.y + Math.sin(ang) * raio;
          const caixaRotulo = { x0: tx - larg / 2, x1: tx + larg / 2, y0: ty - 4.5, y1: ty + 4.5 };
          if (!bate(caixaRotulo) && dentroDaCaixa(caixaRotulo)) { escolhido = { tx, ty, caixaRotulo }; break; }
        }
        if (escolhido) break;
      }
      if (!escolhido) {
        const tx = p.x + Math.cos(base) * 10, ty = p.y + Math.sin(base) * 10;
        escolhido = { tx, ty, caixaRotulo: { x0: tx - larg / 2, x1: tx + larg / 2, y0: ty - 4.5, y1: ty + 4.5 } };
      }
      ocupados.push(escolhido.caixaRotulo);
      pg.texto(escolhido.tx, escolhido.ty - 2.6, rotulo, { tam: 7.5, alinhar: 'centro', cor: COR.cinza });
    });

    // Seta do norte (E à direita, N pra cima: o desenho já está orientado)
    const nx = x + w - 26, ny = y + h - 46;
    pg.caminho([{ x: nx, y: ny + 18 }, { x: nx - 6, y: ny }, { x: nx, y: ny + 5 }, { x: nx + 6, y: ny }], { fechar: true, preenche: COR.escuro });
    pg.texto(nx, ny + 22, 'N', { tam: 9, negrito: true, alinhar: 'centro' });

    // Escala gráfica: um comprimento "redondo" (1, 2 ou 5 × 10^k m) perto de 22% da largura
    const alvo = (w * 0.22) / escala;
    const pot = Math.pow(10, Math.floor(Math.log10(alvo)));
    const fator = alvo / pot;
    const redondo = (fator >= 5 ? 5 : fator >= 2 ? 2 : 1) * pot;
    const compr = redondo * escala;
    const bx = x + 16, by = y + 18;
    pg.retangulo(bx, by, compr / 2, 4, { preenche: COR.escuro, contorno: COR.escuro, largura: 0.5 });
    pg.retangulo(bx + compr / 2, by, compr / 2, 4, { preenche: COR.branco, contorno: COR.escuro, largura: 0.5 });
    pg.texto(bx, by - 9, '0', { tam: 7, alinhar: 'centro', cor: COR.cinza });
    pg.texto(bx + compr, by - 9, `${fmt(redondo, redondo < 1 ? 1 : 0)} m`, { tam: 7, alinhar: 'centro', cor: COR.cinza });
  }

  // ---------- RELATÓRIO ----------
  function gerarPDF(dados) {
    const exp = global.ZoneaExport || {};
    const datuns = exp.DATUNS || { sirgas2000: { rotulo: 'SIRGAS 2000' }, sad69: { rotulo: 'SAD-69' } };
    const preparar = exp.prepararVertices || ((p) => p.map((q, i) => ({ E: q.E, N: q.N, rotulo: 'P' + i })));
    const { pontos, area, perimetro, erroFechamento } = dados;
    const datum = datuns[dados.datum] ? dados.datum : 'sirgas2000';
    const titulo = String(dados.titulo || '').trim().slice(0, 80);
    const responsavel = String(dados.responsavel || '').trim().slice(0, 80);
    const agora = dados.geradoEm instanceof Date ? dados.geradoEm : new Date();
    const vertices = preparar(pontos);
    const fechou = erroFechamento <= TOLERANCIA_FECHAMENTO_M;

    const largUtil = PAGINA.w - 2 * MARGEM;
    const limiteInferior = MARGEM + RODAPE;
    const paginas = [];

    function pagina() {
      const pg = novaPagina();
      paginas.push(pg);
      return pg;
    }

    // --- cabeçalho (página 1) ---
    let pg = pagina();
    let y = PAGINA.h - MARGEM;
    pg.texto(MARGEM, y - 16, 'ZONEA', { tam: 22, negrito: true, cor: COR.azul });
    pg.texto(MARGEM, y - 28, 'CONECTANDO VOCÊ AOS DADOS OFICIAIS', { tam: 6.5, cor: COR.verde });
    pg.texto(PAGINA.w - MARGEM, y - 10, 'Relatório da Poligonal', { tam: 15, negrito: true, alinhar: 'dir' });
    pg.texto(PAGINA.w - MARGEM, y - 24, `Gerado em ${dataHora(agora)}`, { tam: 8, cor: COR.cinza, alinhar: 'dir' });
    pg.linha(MARGEM, y - 38, PAGINA.w - MARGEM, y - 38, { cor: COR.azul, largura: 1.2 });
    y -= 58;

    // --- identificação (opcional) ---
    [['Identificação', titulo], ['Responsável técnico', responsavel]].forEach(([rotulo, valor]) => {
      if (!valor) return;
      pg.texto(MARGEM, y, rotulo.toUpperCase(), { tam: 6.5, cor: COR.claro, negrito: true });
      quebrarLinhas(valor, largUtil, 12, true).slice(0, 2).forEach((linha, i) => {
        pg.texto(MARGEM, y - 14 - i * 14, linha, { tam: 12, negrito: true });
      });
      y -= 14 + Math.min(2, quebrarLinhas(valor, largUtil, 12, true).length) * 14 + 6;
    });

    // --- resultados ---
    const folga = 8;
    const larguraCaixa = (largUtil - 3 * folga) / 4;
    const alturaCaixa = 58;
    const caixas = [
      ['ÁREA', `${fmt(area, 2)} m²`, `${fmt(area / 10000, 4)} ha`, COR.borda, COR.escuro],
      ['PERÍMETRO', `${fmt(perimetro, 2)} m`, 'soma dos segmentos', COR.borda, COR.escuro],
      ['ERRO DE FECHAMENTO', `${fmt(erroFechamento, 3)} m`,
        fechou ? 'dentro da tolerância (0,05 m)' : 'ACIMA da tolerância (0,05 m)',
        fechou ? COR.verde : COR.aviso, fechou ? COR.verde : COR.aviso],
      ['VÉRTICES', String(vertices.length), 'contando o P0', COR.borda, COR.escuro],
    ];
    caixas.forEach(([rotulo, valor, sub, borda, corValor], i) => {
      const bx = MARGEM + i * (larguraCaixa + folga);
      pg.retangulo(bx, y - alturaCaixa, larguraCaixa, alturaCaixa, { preenche: COR.fundo, contorno: borda, largura: 0.9 });
      pg.texto(bx + 9, y - 15, rotulo, { tam: 6.5, negrito: true, cor: COR.cinza });
      pg.texto(bx + 9, y - 35, valor, { tam: valor.length > 12 ? 13 : 16, negrito: true, cor: corValor });
      pg.texto(bx + 9, y - 49, sub, { tam: 7, cor: COR.cinza });
    });
    y -= alturaCaixa + 14;

    // --- sistema de coordenadas ---
    let sistema = `Sistema de coordenadas: UTM, zona 23S (meridiano central 45° W). Datum informado: ${datuns[datum].rotulo}.`;
    if (datum === 'sad69') sistema += ' O desenho e a tabela estão nas coordenadas como informadas; a conversão para SIRGAS 2000 só é feita nos arquivos KML/KMZ.';
    quebrarLinhas(sistema, largUtil, 8.5, false).forEach((linha) => {
      pg.texto(MARGEM, y, linha, { tam: 8.5, cor: COR.cinza });
      y -= 11.5;
    });
    y -= 8;

    // --- desenho ---
    const alturaDesenho = 222;
    pg.retangulo(MARGEM, y - alturaDesenho, largUtil, alturaDesenho, { contorno: COR.borda, largura: 0.9 });
    pg.texto(MARGEM + 10, y - 16, 'DESENHO DA POLIGONAL', { tam: 6.5, negrito: true, cor: COR.claro });
    desenharPoligono(pg, { x: MARGEM, y: y - alturaDesenho, w: largUtil, h: alturaDesenho }, vertices, fechou);
    y -= alturaDesenho + 6;
    pg.texto(MARGEM, y - 6, fechou
      ? 'O ponto verde é o P0 (ponto inicial). Use a escala gráfica: o desenho não está numa escala fixa de impressão.'
      : 'O ponto verde é o P0. A linha tracejada laranja fecha o polígono, mas o erro de fechamento passou da tolerância.',
      { tam: 7.5, cor: COR.cinza });
    y -= 26;

    // --- tabela de vértices ---
    const colunas = [
      { titulo: 'VÉRTICE', x: MARGEM + 10, alinhar: 'esq' },
      { titulo: 'E (m)', x: MARGEM + 168, alinhar: 'dir' },
      { titulo: 'N (m)', x: MARGEM + 288, alinhar: 'dir' },
      { titulo: 'AZIMUTE ATÉ O PRÓXIMO', x: MARGEM + 410, alinhar: 'dir' },
      { titulo: 'DISTÂNCIA (m)', x: MARGEM + largUtil - 10, alinhar: 'dir' },
    ];
    const alturaLinha = 15;

    function cabecalhoTabela(p, topo) {
      p.retangulo(MARGEM, topo - 18, largUtil, 18, { preenche: COR.fundo, contorno: COR.borda, largura: 0.6 });
      colunas.forEach(c => p.texto(c.x, topo - 12, c.titulo, { tam: 6.5, negrito: true, cor: COR.cinza, alinhar: c.alinhar }));
      return topo - 18;
    }

    if (y - 60 < limiteInferior) { pg = pagina(); y = PAGINA.h - MARGEM; }
    pg.texto(MARGEM, y, 'VÉRTICES E SEGMENTOS', { tam: 6.5, negrito: true, cor: COR.claro });
    y = cabecalhoTabela(pg, y - 8);

    vertices.forEach((v, i) => {
      if (y - alturaLinha < limiteInferior) {
        pg = pagina();
        y = cabecalhoTabela(pg, PAGINA.h - MARGEM);
      }
      const prox = vertices[(i + 1) % vertices.length];
      const dE = prox.E - v.E, dN = prox.N - v.N;
      if (i % 2 === 1) pg.retangulo(MARGEM, y - alturaLinha, largUtil, alturaLinha, { preenche: [0.976, 0.984, 0.992] });
      const celulas = [v.rotulo, fmt(v.E, 3), fmt(v.N, 3), azimuteDms(dE, dN), fmt(Math.hypot(dE, dN), 3)];
      colunas.forEach((c, k) => pg.texto(c.x, y - 10.5, celulas[k], { tam: 8.5, negrito: k === 0, alinhar: c.alinhar }));
      y -= alturaLinha;
    });
    pg.linha(MARGEM, y, MARGEM + largUtil, y, { cor: COR.borda, largura: 0.6 });
    y -= 12;

    // --- notas ---
    const notas = [
      `Cada linha traz o segmento que sai do vértice até o seguinte (o do último fecha o polígono em ${vertices[0].rotulo}). Azimutes e distâncias foram recalculados a partir das coordenadas; a área usa a fórmula de Gauss sobre o polígono fechado.`,
      'Ferramenta de apoio: não substitui ART/RRT, levantamento topográfico, matrícula do imóvel nem a análise da prefeitura. O Zonea calcula a partir dos dados informados por quem preencheu a tabela e não confere nem atesta que eles estão corretos; a responsabilidade pelo uso do resultado é de quem informa os dados e de quem o utiliza.',
    ];
    const alturaNotas = notas.reduce((soma, t) => soma + quebrarLinhas(t, largUtil, 7, false).length * 9 + 4, 0) + 12;
    if (y - alturaNotas < limiteInferior) { pg = pagina(); y = PAGINA.h - MARGEM; }
    pg.texto(MARGEM, y, 'NOTAS', { tam: 6.5, negrito: true, cor: COR.claro });
    y -= 11;
    notas.forEach((t) => {
      quebrarLinhas(t, largUtil, 7, false).forEach((linha) => {
        pg.texto(MARGEM, y, linha, { tam: 7, cor: COR.cinza });
        y -= 9;
      });
      y -= 4;
    });

    // --- rodapé de todas as páginas ---
    paginas.forEach((p, i) => {
      p.linha(MARGEM, MARGEM + 14, PAGINA.w - MARGEM, MARGEM + 14, { cor: COR.borda, largura: 0.6 });
      p.texto(MARGEM, MARGEM + 3, `Gerado pelo Zonea em ${dataHora(agora)} · zonea.com.br · Ferramenta de apoio, não substitui ART/RRT`, { tam: 7, cor: COR.claro });
      p.texto(PAGINA.w - MARGEM, MARGEM + 3, `Página ${i + 1} de ${paginas.length}`, { tam: 7, cor: COR.claro, alinhar: 'dir' });
    });

    return montarPdf(paginas, agora);
  }

  // ---------- ESTRUTURA DO ARQUIVO PDF ----------
  // Objetos: 1 catálogo, 2 páginas, 3 Helvetica, 4 Helvetica-Bold, 5 informações, e depois,
  // pra cada página, o objeto da página e o do seu conteúdo. Tudo em ASCII.
  function montarPdf(paginas, agora) {
    const dois = (x) => String(x).padStart(2, '0');
    const dataPdf = `D:${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}`;
    const objetos = [];
    objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const filhos = paginas.map((_, i) => `${6 + 2 * i} 0 R`).join(' ');
    objetos[2] = `<< /Type /Pages /Kids [${filhos}] /Count ${paginas.length} >>`;
    objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objetos[5] = `<< /Title (Relatorio da Poligonal - Zonea) /Producer (Zonea - zonea.com.br) /Creator (Zonea) /CreationDate (${dataPdf}) >>`;
    paginas.forEach((p, i) => {
      const conteudo = p.ops.join('\n');
      objetos[6 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGINA.w} ${PAGINA.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`;
      objetos[7 + 2 * i] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
    });

    let pdf = '%PDF-1.4\n%âãÏÓ\n';
    const deslocamentos = [];
    for (let i = 1; i < objetos.length; i++) {
      deslocamentos[i] = pdf.length;
      pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
    }
    const inicioXref = pdf.length;
    pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objetos.length; i++) pdf += `${String(deslocamentos[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return bytes;
  }

  global.ZoneaRelatorio = { gerarPDF, azimuteDms, larguraTexto, quebrarLinhas, bytesCp1252 };
})(typeof window !== 'undefined' ? window : globalThis);
