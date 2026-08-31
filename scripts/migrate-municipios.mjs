// Zonea — migração única de data/municipios.json para o Supabase (tabela municipios_protegido).
//
// Ferramenta de desenvolvimento, roda uma vez localmente. Não faz parte do site publicado
// e não precisa de nenhuma dependência instalada — usa só o `fetch` nativo do Node 18+.
//
// Como rodar (Windows PowerShell):
//   $env:SUPABASE_URL = "https://fkjmojbbxpilajehvpjy.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "cole-a-service-role-key-aqui"
//   node scripts/migrate-municipios.mjs
//
// A service_role key fica só nesta variável de ambiente temporária do seu terminal —
// nunca é escrita em nenhum arquivo do projeto nem commitada.

import { readFile, writeFile } from 'node:fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variáveis de ambiente antes de rodar este script.');
  process.exit(1);
}

// Mesma lógica de normalização usada em js/script.js (remove acentos), com o passo
// extra de virar um slug kebab-case estável para servir de chave primária no banco.
function slugify(nome) {
  const semAcento = Array.from(nome.normalize('NFD'))
    .filter((ch) => { const code = ch.codePointAt(0); return code < 0x0300 || code > 0x036f; })
    .join('');
  return semAcento
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

async function main() {
  const raw = await readFile(new URL('../data/municipios.json', import.meta.url), 'utf8');
  const municipios = JSON.parse(raw);

  const protegidos = [];
  const publicos = [];

  for (const m of municipios) {
    const slug = slugify(m.nome);

    protegidos.push({
      slug,
      nome: m.nome,
      link: m.link ?? null,
      sistema: m.sistema ?? null,
      detalhes_tecnicos: m.detalhes_tecnicos ?? null,
      sistema_referencia: m.sistema_referencia ?? null,
      indisponivel: !!m.indisponivel,
      indisponivel_desde: m.indisponivel_desde ?? null,
    });

    publicos.push({
      slug,
      nome: m.nome,
      confirmado: !!m.confirmado,
      regiao: m.regiao ?? null,
      pop: m.pop ?? null,
      area: m.area ?? null,
    });
  }

  console.log(`Enviando ${protegidos.length} municípios para municipios_protegido...`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/municipios_protegido`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(protegidos),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao inserir no Supabase (HTTP ${res.status}): ${body}`);
  }

  console.log('Inserção concluída.');

  const outPath = new URL('../data/municipios.public.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(publicos, null, 2) + '\n', 'utf8');
  console.log(`Gerado data/municipios.public.json com ${publicos.length} registros (campos públicos apenas).`);
  console.log('Esse arquivo só deve substituir data/municipios.json na Fase 2, não antes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
