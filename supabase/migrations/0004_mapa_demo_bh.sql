-- Zonea — Belo Horizonte gratuito para qualquer visitante (mapa e busca)
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001, 0002 e 0003.
-- (Esta migration existia só como mudança manual aplicada direto no SQL Editor — nunca tinha
-- sido salva como arquivo no repositório. Formalizada aqui pra ficar documentada de verdade.)

alter table public.municipios_protegido add column if not exists is_demo boolean not null default false;

update public.municipios_protegido set is_demo = true where slug = 'belo-horizonte';

create policy "demo publico le belo horizonte"
  on public.municipios_protegido for select
  using (is_demo = true);
