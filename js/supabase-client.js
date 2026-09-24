/* ============================================================
   ZONEA — Inicialização do client Supabase
   Requer que o SDK (via CDN) já tenha sido carregado antes deste
   script em todas as páginas: <script src=".../supabase-js@2">
   ============================================================ */

const SUPABASE_URL = 'https://fkjmojbbxpilajehvpjy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UrTtjSJQDDBym-Y9VlkL0Q_2eVtMvT-';

// O link do e-mail "Esqueci minha senha" volta ao site com #...&type=recovery e já deixa a pessoa
// logada. Guardamos isso ANTES do SDK limpar o endereço, pra conta.html pedir a nova senha
// (sem isso ela só entrava no site, sem definir senha nenhuma). Se o link cair em outra
// página, manda pra conta.html mantendo o que veio no endereço.
const ZONEA_RECUPERANDO_SENHA = /type=recovery/.test(window.location.hash);
if (ZONEA_RECUPERANDO_SENHA && !window.location.pathname.endsWith('/conta.html')) {
  window.location.replace('/conta.html' + window.location.hash);
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Checa sessão + status de assinatura do usuário logado.
// Usado tanto pelo guard de páginas gateadas quanto pelo header (btnLockToggle).
async function getAssinaturaAtiva() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return { session: null, ativa: false, profile: null };

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('subscription_status, subscription_expires_at')
    .eq('id', session.user.id)
    .single();

  const ativa = !!profile &&
    profile.subscription_status === 'active' &&
    (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date());

  return { session, ativa, profile };
}

// Gera o link de pagamento (Edge Function create-mp-preference) e leva o usuário
// ao checkout do Mercado Pago. Lança erro se não conseguir — quem chama trata.
// Usado por conta.html (btnAssinar) e pela Poligonal (quando os créditos acabam).
async function iniciarPagamento() {
  const { data, error } = await supabaseClient.functions.invoke('create-mp-preference');
  if (error || !data?.init_point) throw error || new Error('Resposta sem init_point');
  window.location.href = data.init_point;
}
