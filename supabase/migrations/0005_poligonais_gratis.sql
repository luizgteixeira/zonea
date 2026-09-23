-- Zonea — poligonais grátis por conta (novo modelo: só a Poligonal é paga)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001 a 0004.

-- Quantas poligonais grátis essa conta já gastou. O limite (hoje, 2) NÃO fica no
-- banco: é a constante LIMITE_POLIGONAIS_GRATIS da Edge Function usar-poligonal.
-- O usuário só consegue LER o próprio perfil (policy da 0001) e nenhum client
-- consegue escrever em profiles — só a service_role, via Edge Function.
alter table public.profiles
  add column poligonais_gratis_usadas integer not null default 0
  check (poligonais_gratis_usadas >= 0);

-- Consome 1 crédito de forma atômica: o UPDATE condicional (usadas < limite) faz a
-- checagem e o incremento num passo só, então dois cliques/abas simultâneos nunca
-- passam do limite. Devolve o total de créditos usados DEPOIS de consumir, ou NULL
-- se a conta já estava no limite (nada é alterado).
create function public.consumir_poligonal_gratis(p_user_id uuid, p_limite integer)
returns integer
language sql
security definer set search_path = public
as $$
  update public.profiles
     set poligonais_gratis_usadas = poligonais_gratis_usadas + 1,
         updated_at = now()
   where id = p_user_id
     and poligonais_gratis_usadas < p_limite
  returning poligonais_gratis_usadas;
$$;

-- Só a service_role (Edge Function) pode chamar — senão qualquer usuário logado
-- poderia gastar/consultar créditos de outra conta direto pela API.
revoke all on function public.consumir_poligonal_gratis(uuid, integer) from public, anon, authenticated;
grant execute on function public.consumir_poligonal_gratis(uuid, integer) to service_role;
