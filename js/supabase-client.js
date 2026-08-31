/* ============================================================
   ZONEA — Inicialização do client Supabase
   Requer que o SDK (via CDN) já tenha sido carregado antes deste
   script em todas as páginas: <script src=".../supabase-js@2">
   ============================================================ */

const SUPABASE_URL = 'https://fkjmojbbxpilajehvpjy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UrTtjSJQDDBym-Y9VlkL0Q_2eVtMvT-';

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
