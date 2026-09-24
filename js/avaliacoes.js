/* ============================================================
   ZONEA — Avaliações dos usuários
   Lê as avaliações aprovadas (vista pública avaliacoes_publicas, sem e-mail nem id de usuário) e
   deixa quem usou a Ferramenta de Poligonal avaliar. As regras que valem de verdade ficam no banco
   (supabase/migrations/0007_avaliacoes.sql): quem pode avaliar, uma por conta, e a aprovação — aqui
   é só a tela. Tudo que vem do banco (nome, comentário...) entra na página como TEXTO, nunca HTML.
   Usado em avaliacoes.html (lista + formulário) e na seção da página inicial (só leitura).
   ============================================================ */

(function (global) {
  'use strict';

  const PROFISSOES = [
    'Arquiteto(a)', 'Engenheiro(a) civil', 'Agrimensor(a) / Topógrafo(a)', 'Urbanista',
    'Corretor(a) de imóveis', 'Advogado(a)', 'Estudante', 'Servidor(a) público(a)', 'Outra',
  ];

  // ---------- ELEMENTOS ----------
  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function estrelas(nota, extra) {
    const wrap = el('span', 'aval-estrelas' + (extra ? ' ' + extra : ''));
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Nota ${String(nota).replace('.', ',')} de 5`);
    for (let i = 1; i <= 5; i++) {
      const s = el('span', 'aval-estrela' + (i <= Math.round(nota) ? ' cheia' : ''), '★');
      s.setAttribute('aria-hidden', 'true');
      wrap.appendChild(s);
    }
    return wrap;
  }

  const formataMedia = (m) => Number(m).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function mesAno(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const texto = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1); // "setembro de 2026" -> "Setembro de 2026"
  }

  function cartao(av) {
    const c = el('article', 'aval-card');
    const topo = el('div', 'aval-card-topo');
    topo.appendChild(estrelas(av.nota));
    if (av.verificado) topo.appendChild(el('span', 'aval-selo', '✓ Usou a Poligonal'));
    c.appendChild(topo);
    c.appendChild(el('p', 'aval-texto', av.comentario));

    const rodape = el('div', 'aval-autor');
    rodape.appendChild(el('strong', 'aval-nome', av.nome));
    const detalhe = [av.profissao, mesAno(av.created_at)].filter(Boolean).join(' · ');
    if (detalhe) rodape.appendChild(el('span', 'aval-detalhe', detalhe));
    c.appendChild(rodape);

    if (av.resposta) {
      const r = el('div', 'aval-resposta');
      r.appendChild(el('strong', null, 'Resposta do Zonea'));
      r.appendChild(el('p', null, av.resposta));
      c.appendChild(r);
    }
    return c;
  }

  function resumo(r) {
    const c = el('div', 'aval-resumo');
    c.appendChild(el('span', 'aval-resumo-nota', formataMedia(r.media)));
    const col = el('div', 'aval-resumo-col');
    col.appendChild(estrelas(r.media, 'grande'));
    col.appendChild(el('span', 'aval-resumo-total', `${r.total} ${r.total === 1 ? 'avaliação' : 'avaliações'} de quem usou`));
    c.appendChild(col);
    return c;
  }

  // ---------- DADOS ----------
  async function buscarResumo() {
    const { data, error } = await supabaseClient.from('avaliacoes_resumo').select('total, media').single();
    if (error) throw error;
    return data;
  }

  async function buscarLista(limite) {
    const { data, error } = await supabaseClient
      .from('avaliacoes_publicas')
      .select('id, nome, profissao, nota, comentario, resposta, verificado, created_at')
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  }

  // ---------- PÁGINA INICIAL: seção de leitura (só aparece se já houver avaliação aprovada) ----------
  async function iniciarHome(secao) {
    try {
      const [r, lista] = await Promise.all([buscarResumo(), buscarLista(3)]);
      if (!r || r.total < 1 || !lista.length) return; // sem avaliação aprovada: a seção nem aparece
      const topo = secao.querySelector('[data-aval="resumo"]');
      const grade = secao.querySelector('[data-aval="lista"]');
      topo.replaceChildren(resumo(r));
      grade.replaceChildren(...lista.map(cartao));
      secao.hidden = false;
    } catch (err) {
      console.error('Erro ao carregar as avaliações:', err);
    }
  }

  // ---------- PÁGINA DE AVALIAÇÕES ----------
  async function iniciarPagina() {
    const boxResumo = document.getElementById('avaliacoesResumo');
    const boxLista = document.getElementById('avaliacoesLista');
    const boxAcao = document.getElementById('avaliacaoAcao');
    if (!boxResumo || !boxLista || !boxAcao) return;

    async function carregarPublico() {
      try {
        const [r, lista] = await Promise.all([buscarResumo(), buscarLista(60)]);
        if (r && r.total > 0) {
          boxResumo.replaceChildren(resumo(r));
          boxResumo.hidden = false;
        }
        if (lista.length) {
          boxLista.replaceChildren(...lista.map(cartao));
        } else {
          boxLista.replaceChildren(el('p', 'aval-vazio', 'Ainda não há avaliações publicadas. Seja a primeira pessoa a contar como foi usar o Zonea.'));
        }
      } catch (err) {
        console.error('Erro ao carregar as avaliações:', err);
        boxLista.replaceChildren(el('p', 'aval-vazio', 'Não foi possível carregar as avaliações agora. Recarregue a página em instantes.'));
      }
    }

    // ----- área "avalie você também" -----
    function aviso(estado, blocos) {
      const c = el('div', `status-message ${estado} visible`);
      c.append(...blocos);
      return c;
    }

    function linkBotao(texto, href) {
      const a = el('a', 'btn-submit aval-btn-link', texto);
      a.href = href;
      return a;
    }

    function mostrarConvite(titulo, texto, botao) {
      const c = el('div', 'aval-acao-card card');
      c.appendChild(el('h2', 'aval-acao-titulo', titulo));
      c.appendChild(el('p', 'aval-acao-texto', texto));
      if (botao) c.appendChild(botao);
      boxAcao.replaceChildren(c);
    }

    function rotuloStatus(status) {
      if (status === 'aprovada') return ['Publicada', 'ok'];
      if (status === 'rejeitada') return ['Não publicada', 'warn'];
      return ['Em análise', 'pendente'];
    }

    function mostrarMinhaAvaliacao(av, perfil) {
      const c = el('div', 'aval-acao-card card');
      const [rotulo, classe] = rotuloStatus(av.status);
      const topo = el('div', 'aval-minha-topo');
      topo.appendChild(el('h2', 'aval-acao-titulo', 'Sua avaliação'));
      topo.appendChild(el('span', `aval-status ${classe}`, rotulo));
      c.appendChild(topo);
      c.appendChild(cartao({ ...av, verificado: true, resposta: av.resposta }));
      const dica = av.status === 'aprovada'
        ? 'Ela já aparece para todo mundo. Se você editar, volta para análise antes de reaparecer.'
        : av.status === 'rejeitada'
          ? 'Ela não foi publicada. Você pode editar e enviar de novo.'
          : 'Obrigado! Ela aparece aqui assim que for revisada.';
      c.appendChild(el('p', 'aval-acao-texto', dica));
      const botoes = el('div', 'aval-botoes');
      const editar = el('button', 'btn-secondary', 'Editar');
      editar.type = 'button';
      editar.addEventListener('click', () => mostrarFormulario(av, perfil));
      const apagar = el('button', 'btn-secondary', 'Apagar');
      apagar.type = 'button';
      apagar.addEventListener('click', async () => {
        const ok = await confirmarZonea({
          titulo: 'Apagar sua avaliação?',
          mensagem: 'Ela deixa de aparecer no site. Você poderá escrever outra depois.',
          confirmar: 'Apagar', perigo: true,
        });
        if (!ok) return;
        const { error } = await supabaseClient.from('avaliacoes').delete().eq('id', av.id);
        if (error) {
          console.error('Erro ao apagar a avaliação:', error);
          c.appendChild(aviso('error', [el('span', null, 'Não foi possível apagar agora. Tente de novo.')]));
          return;
        }
        await carregarPublico();
        await iniciarAcao();
      });
      botoes.append(editar, apagar);
      c.appendChild(botoes);
      boxAcao.replaceChildren(c);
    }

    function mostrarFormulario(existente, perfil) {
      const c = el('form', 'aval-acao-card card aval-form');
      c.noValidate = true;
      c.appendChild(el('h2', 'aval-acao-titulo', existente ? 'Editar sua avaliação' : 'Avalie o Zonea'));
      c.appendChild(el('p', 'aval-acao-texto', 'Você usou a Ferramenta de Poligonal, então sua opinião conta. Conte como foi, em poucas palavras.'));

      // nota
      const fsNota = el('fieldset', 'aval-campo');
      fsNota.appendChild(el('legend', 'aval-rotulo', 'Sua nota'));
      const linhaNota = el('div', 'aval-nota-input');
      for (let n = 5; n >= 1; n--) {
        const id = `avalNota${n}`;
        const r = el('input');
        r.type = 'radio'; r.name = 'nota'; r.id = id; r.value = String(n); r.className = 'aval-radio';
        if (existente && existente.nota === n) r.checked = true;
        const l = el('label', 'aval-estrela-label', '★');
        l.htmlFor = id;
        l.title = `${n} de 5`;
        l.setAttribute('aria-label', `${n} de 5`);
        linhaNota.append(r, l);
      }
      fsNota.appendChild(linhaNota);
      c.appendChild(fsNota);

      // nome
      const gNome = el('div', 'aval-campo');
      const lNome = el('label', 'aval-rotulo', 'Como quer aparecer (nome)'); lNome.htmlFor = 'avalNome';
      const iNome = el('input'); iNome.type = 'text'; iNome.id = 'avalNome'; iNome.maxLength = 40; iNome.autocomplete = 'off';
      iNome.placeholder = 'Ex.: Ana L. ou Ana Lima'; iNome.value = existente ? existente.nome : '';
      gNome.append(lNome, iNome);
      c.appendChild(gNome);

      // profissão
      const gProf = el('div', 'aval-campo');
      const lProf = el('label', 'aval-rotulo', 'Sua área (opcional)'); lProf.htmlFor = 'avalProfissao';
      const sProf = el('select'); sProf.id = 'avalProfissao';
      sProf.appendChild(new Option('Prefiro não informar', ''));
      PROFISSOES.forEach((p) => sProf.appendChild(new Option(p, p)));
      if (existente && existente.profissao) sProf.value = PROFISSOES.includes(existente.profissao) ? existente.profissao : 'Outra';
      gProf.append(lProf, sProf);
      c.appendChild(gProf);

      // comentário
      const gCom = el('div', 'aval-campo');
      const lCom = el('label', 'aval-rotulo', 'Sua avaliação'); lCom.htmlFor = 'avalComentario';
      const tCom = el('textarea'); tCom.id = 'avalComentario'; tCom.rows = 5; tCom.maxLength = 600;
      tCom.placeholder = 'O que você fez com o Zonea? Ajudou? O que poderia melhorar?';
      tCom.value = existente ? existente.comentario : '';
      const contador = el('span', 'aval-contador', '');
      const atualizaContador = () => { contador.textContent = `${tCom.value.trim().length}/600 (mínimo 10)`; };
      tCom.addEventListener('input', atualizaContador);
      atualizaContador();
      gCom.append(lCom, tCom, contador);
      c.appendChild(gCom);

      c.appendChild(el('p', 'aval-consentimento', 'Seu nome, sua área e o texto serão exibidos publicamente aqui no site depois de revisados. O seu e-mail nunca aparece.'));

      const msg = el('div', 'status-message');
      msg.setAttribute('aria-live', 'polite');
      c.appendChild(msg);

      const botoes = el('div', 'aval-botoes');
      const enviar = el('button', 'btn-submit', existente ? 'Salvar alterações' : 'Enviar avaliação');
      enviar.type = 'submit';
      botoes.appendChild(enviar);
      if (existente) {
        const cancelar = el('button', 'btn-secondary', 'Cancelar');
        cancelar.type = 'button';
        cancelar.addEventListener('click', () => mostrarMinhaAvaliacao(existente, perfil));
        botoes.appendChild(cancelar);
      }
      c.appendChild(botoes);

      const erro = (texto) => { msg.className = 'status-message warn visible'; msg.textContent = texto; };

      c.addEventListener('submit', async (e) => {
        e.preventDefault();
        const marcada = c.querySelector('input[name="nota"]:checked');
        const nome = iNome.value.trim();
        const comentario = tCom.value.trim();
        if (!marcada) return erro('Escolha uma nota de 1 a 5 estrelas.');
        if (nome.length < 2) return erro('Digite o nome que quer mostrar (pelo menos 2 letras).');
        if (comentario.length < 10) return erro('Conte um pouco mais: a avaliação precisa de pelo menos 10 caracteres.');

        const dados = { nota: Number(marcada.value), nome, profissao: sProf.value || null, comentario };
        enviar.disabled = true;
        msg.className = 'status-message ok visible';
        msg.textContent = 'Enviando...';
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { erro('Sua sessão expirou. Entre de novo para avaliar.'); enviar.disabled = false; return; }

        const resp = existente
          ? await supabaseClient.from('avaliacoes').update(dados).eq('id', existente.id).select().single()
          : await supabaseClient.from('avaliacoes').insert({ ...dados, user_id: session.user.id }).select().single();

        if (resp.error) {
          console.error('Erro ao salvar a avaliação:', resp.error);
          enviar.disabled = false;
          if (String(resp.error.message || '').includes('nao_elegivel')) return erro('Para avaliar, use a Ferramenta de Poligonal pelo menos uma vez.');
          if (resp.error.code === '23505') { await iniciarAcao(); return; }
          return erro('Não foi possível enviar agora. Tente de novo em instantes.');
        }
        await carregarPublico();
        mostrarMinhaAvaliacao(resp.data, perfil);
      });

      boxAcao.replaceChildren(c);
      if (existente) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function iniciarAcao() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        mostrarConvite('Usou o Zonea? Conte como foi',
          'Entre na sua conta para deixar uma avaliação. Só quem usou a Ferramenta de Poligonal pode avaliar — assim as opiniões daqui são de quem realmente usa.',
          linkBotao('Entrar ou criar conta', 'conta.html?voltar=avaliacoes'));
        return;
      }
      const [{ data: propria }, { data: perfil }] = await Promise.all([
        supabaseClient.from('avaliacoes').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabaseClient.from('profiles').select('poligonais_gratis_usadas, subscription_status').eq('id', session.user.id).maybeSingle(),
      ]);
      if (propria) { mostrarMinhaAvaliacao(propria, perfil); return; }
      const elegivel = !!perfil && ((perfil.poligonais_gratis_usadas || 0) > 0 || perfil.subscription_status === 'active');
      if (!elegivel) {
        mostrarConvite('Falta só usar a ferramenta',
          'Para manter as avaliações confiáveis, só quem usou a Ferramenta de Poligonal pelo menos uma vez pode avaliar. Suas 2 primeiras poligonais são grátis.',
          linkBotao('Usar a Ferramenta de Poligonal', 'poligonal.html'));
        return;
      }
      mostrarFormulario(null, perfil);
    }

    await carregarPublico();
    try {
      await iniciarAcao();
    } catch (err) {
      console.error('Erro ao preparar o formulário de avaliação:', err);
      boxAcao.replaceChildren(aviso('warn', [el('span', null, 'Não foi possível carregar o formulário agora. Recarregue a página.')]));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const home = document.getElementById('homeAvaliacoes');
    if (home) iniciarHome(home);
    iniciarPagina();
  });

  global.ZoneaAvaliacoes = { estrelas, cartao, resumo, formataMedia };
})(typeof window !== 'undefined' ? window : globalThis);
