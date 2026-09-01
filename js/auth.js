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
  const authStatus = document.getElementById('authStatus');
  const authCard = document.getElementById('authCard');
  const accountStatusCard = document.getElementById('accountStatusCard');

  if (!loginForm) return; // página sem os elementos de conta — não faz nada

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
    await renderAccountState();
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    showAuthStatus('ok', 'Criando sua conta...');
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      showAuthStatus('error', `Não foi possível criar a conta: ${error.message}`);
      return;
    }
    showAuthStatus('ok', '✓ Conta criada! Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada.');
    await renderAccountState();
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    showAuthStatus('ok', 'Enviando...');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
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
        const { data, error } = await supabaseClient.functions.invoke('create-mp-preference');
        if (error || !data?.init_point) throw error || new Error('Resposta sem init_point');
        window.location.href = data.init_point;
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
      details.textContent = 'Sua conta ainda não tem uma assinatura ativa. Assine para liberar a consulta e a Ferramenta de Poligonal.';
      btnWhatsapp.href = buildWhatsappLink(`Olá! Criei minha conta no Zonea (${session.user.email}) e gostaria de saber sobre outras formas de pagamento.`);
      btnWhatsapp.style.display = '';
      if (btnAssinarEl) btnAssinarEl.style.display = '';
    }

    return false;
  }

  const noSession = await renderAccountState();
  const urlParams = new URLSearchParams(window.location.search);
  if (noSession && urlParams.has('access_required')) {
    showAuthStatus('warn', 'A consulta aos municípios e a Ferramenta de Poligonal exigem login com assinatura ativa. Entre ou crie sua conta abaixo.');
  }
});
