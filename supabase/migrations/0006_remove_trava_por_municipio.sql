-- Zonea — limpeza da antiga trava por município
-- Rode este arquivo no SQL Editor do painel do Supabase, depois de já ter aplicado 0001 a 0005.
--
-- O modelo mudou: os municípios são todos gratuitos (dados estáticos em data/municipios.json) e
-- só a Poligonal é paga. Estas três tabelas não são mais lidas nem escritas por nada no site:
--   - municipios_protegido : dados protegidos por assinatura (hoje estão em data/municipios.json)
--   - anon_preview_usado   : controle da antiga "1 consulta grátis por visitante"
--   - leads_interesse      : antiga captura de contato (e-mail/WhatsApp de quem pedia aviso)
--
-- ATENÇÃO — leads_interesse pode ter contatos reais de pessoas interessadas. Antes de rodar,
-- veja quantos existem e, se houver, exporte (Table Editor > leads_interesse > Export as CSV):
--     select count(*) from public.leads_interesse;
-- DROP TABLE não tem volta.
--
-- As policies (inclusive "demo publico le belo horizonte") e a coluna is_demo somem junto com
-- a tabela. As Edge Functions get-preview-municipio e submit-lead precisam ser apagadas à mão
-- no painel (Edge Functions > a função > Delete) — SQL não remove função publicada.

drop table if exists public.anon_preview_usado;
drop table if exists public.leads_interesse;
drop table if exists public.municipios_protegido;
