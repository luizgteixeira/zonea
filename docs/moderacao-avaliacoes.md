# Como moderar as avaliações do Zonea

As avaliações ficam na tabela `avaliacoes` do Supabase. **Toda avaliação nova entra como `pendente` e só aparece no
site depois que você troca o `status` para `aprovada`.** Não existe tela de administração: você faz isso direto no
painel do Supabase.

## Antes de tudo (uma vez só)

Rode `supabase/migrations/0007_avaliacoes.sql` no SQL Editor do Supabase (depois das migrações 0001 a 0006).
Ela cria a tabela, as regras e as vistas públicas.

## Aviso por e-mail quando chega uma avaliação (configurar uma vez)

Cada avaliação nova — e cada avaliação **editada**, que volta para a revisão — gera **um e-mail** para você, com a nota,
o texto e o comando pronto para aprovar. Para ligar:

1. **Banco:** rode `supabase/migrations/0008_avaliacoes_aviso.sql` no SQL Editor (depois da 0007). Ela cria o gatilho.
   Se aparecer o aviso "supabase_functions.http_request não existe", crie o webhook pelo painel: **Database → Webhooks →
   Create**, tabela `avaliacoes`, eventos **Insert** e **Update**, tipo **Supabase Edge Function**, função
   `avisar-avaliacao`, método POST.
2. **Função:** Edge Functions → **Deploy a new function → Via Editor**, nome exato `avisar-avaliacao`, cole o conteúdo de
   `supabase/functions/avisar-avaliacao/index.ts` e **desligue "Verify JWT"** (quem chama é o próprio banco, sem login —
   é a mesma situação do `mp-webhook`; com a opção ligada o Supabase devolve 401 e nenhum aviso sai).
3. **Secrets** (Edge Functions → Secrets):
   * `RESEND_API_KEY` — uma chave do Resend com permissão de envio (pode ser a mesma do SMTP do Supabase);
   * `AVALIACOES_AVISO_PARA` — o e-mail que recebe o aviso (vários, separados por vírgula).
4. **Teste:** com uma conta que já usou a Poligonal, envie uma avaliação em `avaliacoes.html`. O e-mail deve chegar em
   alguns segundos. Se não chegar, olhe **Edge Functions → avisar-avaliacao → Logs** (mensagens em português dizem se
   faltou secret ou se o Resend recusou).

Como é seguro: a função ignora o corpo do pedido e lê a avaliação no banco; marca `notificado_em` **antes** de enviar.
Então cada avaliação real gera no máximo **um** e-mail, e um pedido inventado não gera nenhum. Aprovar, rejeitar ou
responder pelo painel **não** dispara e-mail. Se o Resend falhar, a função **não tenta de novo sozinha** (evita laço): a
avaliação continua esperando no painel.

## Aprovar, rejeitar e responder (pelo Table Editor)

1. Supabase → **Table Editor** → tabela **avaliacoes**.
2. Filtre por `status = pendente` (ou ordene por `created_at`).
3. Leia o `comentario` e, na coluna **status**, troque para:
   * `aprovada` — passa a aparecer no site (página Avaliações e, se houver, na página inicial);
   * `rejeitada` — não aparece (a pessoa vê "Não publicada" na conta dela e pode editar e reenviar).
4. Para **responder publicamente**, escreva na coluna **resposta** (até 600 caracteres). Ela aparece como
   "Resposta do Zonea" abaixo da avaliação.

## Pelo SQL Editor (alternativa)

```sql
-- o que está esperando revisão
select id, nota, nome, profissao, comentario, created_at
from public.avaliacoes where status = 'pendente' order by created_at;

-- aprovar uma
update public.avaliacoes set status = 'aprovada' where id = 'COLE-O-ID-AQUI';

-- aprovar e responder
update public.avaliacoes
set status = 'aprovada', resposta = 'Obrigado! Fico feliz que tenha ajudado.'
where id = 'COLE-O-ID-AQUI';

-- rejeitar
update public.avaliacoes set status = 'rejeitada' where id = 'COLE-O-ID-AQUI';
```

## Que critério usar para aprovar

* **Aprove** opiniões honestas, inclusive as críticas: uma média perfeita sem nenhuma crítica passa menos confiança.
  Responder com educação a uma crítica costuma valer mais do que escondê-la.
* **Rejeite** ofensas, spam, dados pessoais de terceiros, propaganda e texto sem relação com o Zonea.
* **Não edite** o texto nem a nota de ninguém. Se algo estiver errado, rejeite e deixe a pessoa corrigir. Alterar
  o conteúdo de uma avaliação e publicá-la como se fosse dela é o tipo de coisa que destrói a credibilidade.

## Regras que o banco já garante (ninguém consegue burlar pelo site)

* Só quem **usou a Ferramenta de Poligonal** (ou é assinante) consegue avaliar; isso vira o selo "Usou a Poligonal".
* **Uma avaliação por conta.** A pessoa pode editar ou apagar a sua.
* **Editar volta para `pendente`**, então ninguém aprova um texto e depois troca por outro.
* O visitante lê só a vista `avaliacoes_publicas`, **sem e-mail nem id de usuário**.
* Apagar a conta da pessoa apaga a avaliação junto.

## Dados pessoais (LGPD)

O site mostra apenas o **nome que a pessoa escolheu**, a área (opcional) e o texto, e avisa isso no formulário antes
de enviar. Se alguém pedir para remover a avaliação, ela mesma pode apagar em "Sua avaliação"; se não conseguir, apague
a linha no Table Editor.

## Aviso ao mostrar as avaliações em outros lugares

Evite marcar as avaliações do próprio site com dados estruturados de "AggregateRating" ou "Review": o Google não
mostra estrelas para avaliações que a empresa coleta sobre si mesma, e usar esse marcador de forma indevida pode
gerar penalidade. O Zonea mostra as estrelas só na própria página, sem marcação.
