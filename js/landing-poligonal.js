/* ============================================================
   ZONEA — Página "Desenhar poligonal" (desenhar-poligonal.html)
   Liga o conversor de latitude/longitude para UTM (js/conversor-coordenadas.js) à tela: lê o que
   a pessoa colou, mostra a tabela com os resultados e monta o bloco pra colar na Ferramenta de
   Poligonal. Tudo no navegador: nada do que é digitado aqui sai do computador.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const entrada = document.getElementById('convEntrada');
  const datum = document.getElementById('convDatum');
  const botao = document.getElementById('convBotao');
  const exemplo = document.getElementById('convExemplo');
  const status = document.getElementById('convStatus');
  const resultado = document.getElementById('convResultado');
  const tabela = document.getElementById('convTabela');
  const bloco = document.getElementById('convBloco');
  const copiar = document.getElementById('convCopiar');
  if (!entrada || !botao) return;

  const fmt = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  function mostrarStatus(estado, blocos) {
    status.className = `status-message ${estado} visible`;
    status.replaceChildren(...blocos);
  }

  function limparStatus() {
    status.className = 'status-message';
    status.replaceChildren();
  }

  function linhaDeTexto(texto, forte) {
    const d = document.createElement('div');
    if (forte) {
      const s = document.createElement('strong');
      s.textContent = texto;
      d.appendChild(s);
    } else {
      d.textContent = texto;
    }
    return d;
  }

  function celula(texto, cabecalho) {
    const c = document.createElement(cabecalho ? 'th' : 'td');
    c.textContent = texto;
    return c;
  }

  function converter() {
    limparStatus();
    resultado.hidden = true;
    const texto = entrada.value;
    if (!texto.trim()) {
      mostrarStatus('warn', [linhaDeTexto('Cole pelo menos uma coordenada: latitude e longitude, uma por linha.')]);
      return;
    }
    const r = ZoneaCoordenadas.converterTexto(texto, datum.value);

    const avisos = [];
    if (r.erros.length) {
      avisos.push(linhaDeTexto(`${r.erros.length === 1 ? '1 linha não foi entendida' : r.erros.length + ' linhas não foram entendidas'} e ficou de fora:`, true));
      r.erros.slice(0, 5).forEach((e) => avisos.push(linhaDeTexto(`Linha ${e.linha}: ${e.mensagem}.`)));
      if (r.erros.length > 5) avisos.push(linhaDeTexto(`... e mais ${r.erros.length - 5}.`));
    }
    if (r.foraDoFuso) {
      avisos.push(linhaDeTexto('Atenção: alguma longitude está fora do fuso UTM 23S (48° W a 42° W). A ferramenta do Zonea trabalha em 23S, então o resultado ficará distorcido para esses pontos.', true));
    }

    if (!r.pontos.length) {
      mostrarStatus('error', avisos.length ? avisos : [linhaDeTexto('Não encontrei nenhuma coordenada válida.')]);
      return;
    }
    if (r.pontos.length < 3) {
      avisos.push(linhaDeTexto('Uma poligonal precisa de pelo menos 3 vértices. A conversão abaixo serve, mas para desenhar acrescente mais pontos.', true));
    }

    tabela.replaceChildren(...r.pontos.map((p, i) => {
      const tr = document.createElement('tr');
      tr.append(celula('P' + i), celula(fmt(p.lat, 6)), celula(fmt(p.lon, 6)), celula(fmt(p.E, 3)), celula(fmt(p.N, 3)));
      return tr;
    }));
    bloco.value = ZoneaCoordenadas.gerarBloco(r.pontos);
    resultado.hidden = false;

    if (avisos.length) mostrarStatus(r.erros.length || r.foraDoFuso ? 'warn' : 'ok', avisos);
    else mostrarStatus('ok', [linhaDeTexto(`${r.pontos.length} ${r.pontos.length === 1 ? 'coordenada convertida' : 'coordenadas convertidas'}.`, true)]);
  }

  botao.addEventListener('click', converter);

  exemplo.addEventListener('click', () => {
    entrada.value = '-19.92083 -43.93778\n-19.92083 -43.93741\n-19.92119 -43.93741\n-19.92119 -43.93778';
    datum.value = 'sirgas2000';
    converter();
  });

  copiar.addEventListener('click', async () => {
    const texto = bloco.value;
    const rotulo = copiar.textContent;
    try {
      await navigator.clipboard.writeText(texto);
    } catch (err) {
      // navegador sem permissão de área de transferência: seleciona pra a pessoa copiar com Ctrl+C
      bloco.focus();
      bloco.select();
      copiar.textContent = 'Selecionado: aperte Ctrl+C';
      setTimeout(() => { copiar.textContent = rotulo; }, 2500);
      return;
    }
    copiar.textContent = 'Copiado! ✓';
    setTimeout(() => { copiar.textContent = rotulo; }, 2000);
  });
});
