# Núcleo funcional e casca imperativa num monólito modular

O backend é **um único processo** (`apps/api`) dividido nos módulos M1 a M4 (`src/modulos/{conduta,recursos,reservas,ciclo}/`), cada um com um `nucleo/` de funções puras e uma `casca/` com as rotas Fastify, as consultas Prisma e a execução dos efeitos. Todo comando segue três passos: a casca carrega os fatos, o núcleo decide (`decidir(fatos, comando, quem, agora)` devolve `aceita { efeitos }` ou `recusada { violacoes }`, com **todas** as RNs violadas e sem lançar exceção) e a casca executa os efeitos numa transação. Escolhemos isso para as regras de negócio serem testadas sem banco e sem mock (Aulas 6 e 7) e para a lista `RNxx · Nome: mensagem` sair de uma resposta só. Decidido no ticket [Definir a arquitetura do backend (em grupo)](https://github.com/tapajosgustavo-collab/reservas-campus/issues/11).

## Consequências

- **Sem interface de repositório.** O núcleo não precisa de porta: recebe fatos e devolve valores. A casca usa o Prisma direto e é testada contra o Postgres real. A única porta é o `Relogio` (ticket [Como as regras de tempo rodam e são testadas](https://github.com/tapajosgustavo-collab/reservas-campus/issues/12)). Não crie `ReservaRepositorio` "para poder trocar o banco".
- **O núcleo nunca gera ids nem lê o relógio.** Os ids vêm do banco; um efeito que depende de outro vai aninhado nele (a `SuspensaoIniciada` dentro da `PenalidadeGerada`). O ESLint proíbe no `nucleo/` os imports de Prisma, Fastify e `casca/`, e também `Date.now()`, `new Date()` sem argumento, `Math.random`, `crypto.randomUUID` e `console`. Um módulo só importa outro pelo `index.ts` dele.
- **Um schema Prisma só.** Qualquer casca lê qualquer tabela para montar uma tela, mas só o módulo dono grava nas tabelas dele, pelos efeitos.
- **A API atende uma requisição por vez.** O `pg_advisory_xact_lock` que o `sincronizar` toma no começo de toda requisição fica preso até o fim da transação, que inclui o comando. Isso é proposital: resolve as corridas que o banco sozinho não pega (Cota da RN07, duas Séries que se cruzam). O custo é que uma requisição lenta segura as outras, o que não importa no volume da demo. Não troque por um lock solto antes do comando sem pôr outra proteção para a Cota.
- **A RN01 é checada em dois lugares de propósito.** No núcleo, para a mensagem da regra violada. Na exclusion constraint do Postgres, como segunda proteção (devolve 409 `conflito_concorrente`, que não deveria acontecer com o lock acima). Não apague nenhuma das duas achando que é duplicação.
- **Zod só valida a forma** (400 `entrada_invalida`). Toda RN, mesmo as simples como a RN02, fica no núcleo (422 `regra_violada`), para ter teste com o id dela (RNF01).
- **Autorização em dois níveis.** A casca checa sessão (401) e Perfil da rota (403). As regras de dono que têm id (RN13, RN14, RN16, RN21, RN22) ficam no núcleo, recebem `quem` e voltam 403 citando a RN.

## Opções consideradas

- **Camadas primeiro** (`src/nucleo/<modulo>`, `src/casca/<modulo>`) e **núcleo num pacote separado** (`packages/nucleo`): descartadas. A primeira esconde a fronteira dos módulos, que cada um tem um responsável. A segunda não impede o import do Prisma no npm workspaces, então precisaria do lint do mesmo jeito.
- **Hexagonal clássico com repositórios**: abstração sem uso, já que os testes de casca rodam no Postgres real.
- **Sincronizar numa transação curta e o comando em `SERIALIZABLE` com nova tentativa**: mais paralelismo, bem mais complexo do que a demo precisa.
