/* ============================================================
   ZONEA — Autenticação (página conta.html)
   Cadastro, login, redefinição de senha e status da assinatura,
   via Supabase Auth (supabaseClient definido em js/supabase-client.js).
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const resetForm = document.getElementById('resetForm');
  const newPasswordForm = document.getElementById('newPasswordForm');
  const authTabs = document.getElementById('authTabs');
  const authStatus = document.getElementById('authStatus');
  const authCard = document.getElementById('authCard');
  const accountStatusCard = document.getElementById('accountStatusCard');

  if (!loginForm) return; // página sem os elementos de conta — não faz nada

  // Quem chega aqui vindo da Poligonal (guard de js/script.js) volta pra ela depois de entrar.
  const urlParams = new URLSearchParams(window.location.search);
  const veioDaPoligonal = urlParams.has('access_required');

  // Botão de mostrar/ocultar senha (login e cadastro)
  document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
    const input = document.getElementById(btn.getAttribute('data-target'));
    const iconEye = btn.querySelector('.icon-eye');
    const iconEyeOff = btn.querySelector('.icon-eye-off');
    if (!input) return;
    btn.addEventListener('click', () => {
      const visivel = input.type === 'text';
      input.type = visivel ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!visivel));
      btn.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
      // toggleAttribute em vez de .hidden = ...: em elementos <svg>, a
      // propriedade .hidden não reflete no atributo real (diferente de
      // HTMLElement), então o clique nunca mudava nada na tela.
      if (iconEye) iconEye.toggleAttribute('hidden', !visivel);
      if (iconEyeOff) iconEyeOff.toggleAttribute('hidden', visivel);
    });
  });

  // Regras da senha (cadastro e "nova senha"): o checklist marca cada regra na hora que é cumprida
  // e o botão só libera com tudo certo e as duas senhas iguais. (O Supabase também precisa exigir
  // essas regras no painel — a checagem daqui é só a experiência do usuário.)
  const REGRAS_SENHA = {
    tamanho: (s) => s.length >= 6,
    maiuscula: (s) => /\p{Lu}/u.test(s),
    minuscula: (s) => /\p{Ll}/u.test(s),
    numero: (s) => /\p{N}/u.test(s),
    especial: (s) => /[^\p{L}\p{N}\s]/u.test(s),
  };

  function senhaAtendeRegras(senha) {
    return Object.values(REGRAS_SENHA).every((regra) => regra(senha));
  }

  function configurarChecklistSenha({ senhaId, confirmaId, listaId, igualId, botaoId }) {
    const senhaEl = document.getElementById(senhaId);
    const confirmaEl = document.getElementById(confirmaId);
    const igualLi = document.getElementById(igualId);
    const botao = document.getElementById(botaoId);
    if (!senhaEl || !confirmaEl) return;

    function atualizar() {
      const senha = senhaEl.value;
      const confirmacao = confirmaEl.value;
      document.querySelectorAll(`#${listaId} li`).forEach((li) => {
        li.classList.toggle('ok', REGRAS_SENHA[li.dataset.regra](senha));
      });
      const igual = senha !== '' && confirmacao !== '' && senha === confirmacao;
      if (igualLi) {
        igualLi.classList.toggle('ok', igual);
        igualLi.classList.toggle('erro', confirmacao !== '' && !igual);
        igualLi.querySelector('.senha-igual-texto').textContent =
          confirmacao !== '' && !igual ? 'As senhas ainda não são iguais' : 'As duas senhas são iguais';
      }
      if (botao) botao.disabled = !(senhaAtendeRegras(senha) && igual);
    }

    senhaEl.addEventListener('input', atualizar);
    confirmaEl.addEventListener('input', atualizar);
  }

  configurarChecklistSenha({ senhaId: 'signupPassword', confirmaId: 'signupPasswordConfirm', listaId: 'signupChecklist', igualId: 'signupMatch', botaoId: 'btnCriarConta' });
  configurarChecklistSenha({ senhaId: 'newPassword', confirmaId: 'newPasswordConfirm', listaId: 'newChecklist', igualId: 'newMatch', botaoId: 'btnSalvarNovaSenha' });

  function showAuthStatus(state, text) {
    authStatus.className = `status-message ${state} visible`;
    authStatus.textContent = text;
  }

  function clearAuthStatus() {
    authStatus.className = 'status-message';
    authStatus.textContent = '';
  }

  function showForm(name) {
    loginForm.hidden = name !== 'login';
    signupForm.hidden = name !== 'signup';
    resetForm.hidden = name !== 'reset';
    if (newPasswordForm) newPasswordForm.hidden = name !== 'novaSenha';
    if (authTabs) authTabs.hidden = name === 'novaSenha';
    if (tabLogin) tabLogin.classList.toggle('active', name === 'login');
    if (tabSignup) tabSignup.classList.toggle('active', name === 'signup');
    clearAuthStatus();
  }

  if (tabLogin) tabLogin.addEventListener('click', () => showForm('login'));
  if (tabSignup) tabSignup.addEventListener('click', () => showForm('signup'));

  const btnForgotPassword = document.getElementById('btnForgotPassword');
  const btnBackToLogin = document.getElementById('btnBackToLogin');
  if (btnForgotPassword) btnForgotPassword.addEventListener('click', () => showForm('reset'));
  if (btnBackToLogin) btnBackToLogin.addEventListener('click', () => showForm('login'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    showAuthStatus('ok', 'Entrando...');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showAuthStatus('error', 'Não foi possível entrar: verifique seu e-mail e senha.');
      return;
    }
    clearAuthStatus();
    if (veioDaPoligonal) {
      window.location.href = '/poligonal.html';
      return;
    }
    await renderAccountState();
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmacao = document.getElementById('signupPasswordConfirm').value;
    if (!senhaAtendeRegras(password)) {
      showAuthStatus('error', 'A senha ainda não cumpre todos os requisitos da lista acima.');
      return;
    }
    if (password !== confirmacao) {
      showAuthStatus('error', 'As duas senhas não são iguais. Digite a mesma senha nos dois campos.');
      return;
    }
    showAuthStatus('ok', 'Criando sua conta...');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      showAuthStatus('error', `Não foi possível criar a conta: ${error.message}`);
      return;
    }
    // Sem confirmação de e-mail obrigatória, o cadastro já devolve a sessão: segue direto.
    if (data.session && veioDaPoligonal) {
      window.location.href = '/poligonal.html';
      return;
    }
    await renderAccountState();
    // Depois do renderAccountState: ele chama showForm(), que limpa qualquer aviso — e sem
    // sessão (confirmação de e-mail pendente) a pessoa ficaria sem saber o que fazer.
    if (!data.session) {
      showAuthStatus('ok', '✓ Conta criada! Enviamos um link de confirmação para o seu e-mail — confirme e depois entre para usar a Ferramenta de Poligonal.');
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    showAuthStatus('ok', 'Enviando...');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/conta.html`,
    });
    if (error) {
      showAuthStatus('error', 'Não foi possível enviar o link de redefinição.');
      return;
    }
    showAuthStatus('ok', '✓ Se esse e-mail estiver cadastrado, enviamos um link de redefinição de senha.');
  });

  const btnSignOut = document.getElementById('btnSignOut');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      await renderAccountState();
    });
  }

  const accountActionStatus = document.getElementById('accountActionStatus');
  function showAccountActionStatus(state, text) {
    if (!accountActionStatus) return;
    accountActionStatus.className = `status-message ${state} visible`;
    accountActionStatus.textContent = text;
  }

  const btnAssinar = document.getElementById('btnAssinar');
  if (btnAssinar) {
    btnAssinar.addEventListener('click', async () => {
      const label = btnAssinar.querySelector('span');
      const textoOriginal = label.textContent;
      btnAssinar.disabled = true;
      label.textContent = 'Gerando link de pagamento...';
      try {
        await iniciarPagamento();
      } catch (err) {
        console.error('Erro ao iniciar pagamento:', err);
        showAccountActionStatus('error', 'Não foi possível iniciar o pagamento agora. Tente novamente em um instante ou fale com a equipe pelo WhatsApp.');
        btnAssinar.disabled = false;
        label.textContent = textoOriginal;
      }
    });
  }

  // Retorna true se não há sessão ativa (usado para decidir se mostra o aviso de access_required)
  async function renderAccountState() {
    const { session, ativa, profile } = await getAssinaturaAtiva();

    if (!session) {
      authCard.hidden = false;
      accountStatusCard.hidden = true;
      showForm('login');
      return true;
    }

    authCard.hidden = true;
    accountStatusCard.hidden = false;

    document.getElementById('accountEmail').textContent = session.user.email;

    const badge = document.getElementById('subscriptionBadge');
    const details = document.getElementById('subscriptionDetails');
    const btnWhatsapp = document.getElementById('btnWhatsappActivate');
    const btnAssinarEl = document.getElementById('btnAssinar');
    if (accountActionStatus) accountActionStatus.className = 'status-message';

    if (ativa) {
      badge.textContent = 'ASSINATURA ATIVA';
      badge.className = 'tag confirmado';
      const expira = profile?.subscription_expires_at
        ? new Date(profile.subscription_expires_at).toLocaleDateString('pt-BR')
        : null;
      details.textContent = expira
        ? `Sua assinatura é válida até ${expira}.`
        : 'Sua assinatura está ativa.';
      btnWhatsapp.style.display = 'none';
      if (btnAssinarEl) btnAssinarEl.style.display = 'none';
    } else {
      badge.textContent = 'SEM ASSINATURA ATIVA';
      badge.className = 'tag busca-direta';
      details.textContent = 'Sua conta ainda não tem uma assinatura ativa. As 2 primeiras poligonais são grátis; depois, assine para continuar usando a Ferramenta de Poligonal.';
      // Troca pelo retrato real da conta assim que o servidor responder (sem bloquear a tela).
      obterCreditosPoligonal().then((creditos) => {
        if (!creditos || creditos.assinante) return;
        details.textContent = creditos.restantes > 0
          ? `Sua conta ainda não tem assinatura ativa. Você ainda tem ${creditos.restantes} de ${creditos.limite} poligonais grátis; depois, assine para continuar usando a Ferramenta de Poligonal.`
          : `Você já usou suas ${creditos.limite} poligonais grátis. Assine para continuar usando a Ferramenta de Poligonal.`;
      });
      btnWhatsapp.href = buildWhatsappLink(`Olá! Criei minha conta no Zonea (${session.user.email}) e gostaria de saber sobre outras formas de pagamento.`);
      btnWhatsapp.style.display = '';
      if (btnAssinarEl) btnAssinarEl.style.display = '';
    }

    return false;
  }

  // Chegou pelo link do e-mail "Esqueci minha senha": pede a nova senha antes de qualquer outra coisa.
  if (ZONEA_RECUPERANDO_SENHA && newPasswordForm) {
    authCard.hidden = false;
    accountStatusCard.hidden = true;
    showForm('novaSenha');
    showAuthStatus('ok', 'Link confirmado! Escolha uma nova senha para a sua conta.');
  }

  if (newPasswordForm) {
    newPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const senha = document.getElementById('newPassword').value;
      const confirmacao = document.getElementById('newPasswordConfirm').value;
      if (!senhaAtendeRegras(senha)) {
        showAuthStatus('error', 'A senha ainda não cumpre todos os requisitos da lista acima.');
        return;
      }
      if (senha !== confirmacao) {
        showAuthStatus('error', 'As duas senhas não são iguais. Digite a mesma senha nos dois campos.');
        return;
      }
      showAuthStatus('ok', 'Salvando a nova senha...');
      const { error } = await supabaseClient.auth.updateUser({ password: senha });
      if (error) {
        console.error('Erro ao trocar a senha:', error);
        showAuthStatus('error', `Não foi possível salvar a nova senha: ${error.message}`);
        return;
      }
      // Tira o "#...type=recovery" do endereço pra um F5 não reabrir este formulário.
      history.replaceState(null, '', window.location.pathname);
      await renderAccountState();
      showAccountActionStatus('ok', '✓ Senha alterada com sucesso! Você já está logado(a).');
    });
  }

  const noSession = ZONEA_RECUPERANDO_SENHA ? false : await renderAccountState();
  if (noSession && veioDaPoligonal) {
    showAuthStatus('warn', 'Crie sua conta gratuita (ou entre) para usar a Ferramenta de Poligonal — as 2 primeiras poligonais são grátis.');
  }
});
