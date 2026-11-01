# Regras de tempo aplicadas pelo `sincronizar` no começo de toda requisição

O que o tempo faz acontecer (Expiração, Não comparecimento, Devolução atrasada, Penalidade, fim da Suspensão, lembrete) é calculado por funções puras: `vencimentos(mundo)` lista cada vencimento com o instante exato em que vence, e `sincronizar(mundo, agora)` aplica, em ordem cronológica, todo vencimento com `em <= agora`. A casca roda o `sincronizar` **no começo de toda requisição**, leitura ou escrita, na mesma transação do comando, e também num **tique de 1 minuto** no processo da API, só para as Notificações saírem na hora. Assim o comando e a tela sempre veem o mundo em dia, mesmo com o servidor hibernando (Render Free), e as regras de tempo são testadas sem esperar o relógio. Decidido no ticket [Como as regras de tempo rodam e são testadas](https://github.com/tapajosgustavo-collab/reservas-campus/issues/12), depois de um protótipo que comparou os três modos em 5 roteiros.

## Consequências

- **O efeito leva a data do vencimento, não a do processamento.** A Penalidade do Não comparecimento das 10h fica com 10h15 mesmo que seja aplicada às 13h, então a janela de 30 dias da RN19 dá o mesmo resultado rode o `sincronizar` quando rodar. Rodar de novo com o mesmo `agora` não faz nada (idempotente).
- **Status gravado, nunca calculado na leitura.** A exclusion constraint, a Cota e a RN09 olham o Status do banco. A Suspensão é gravada com início e fim quando nasce a Penalidade que a dispara; "em vigor" é `inicio <= agora < fim`, e o fim só gera a Notificação.
- **Empate no mesmo instante tem ordem fixa:** RN17 → RN12 → RN15 → RN23 → RN18 → RN19 → lembrete. Mudar essa ordem muda o resultado de cenas da demo.
- **Lembrete de 1h processado depois do início é descartado**, e a Reserva fica marcada para não gerar o lembrete de novo.
- **Uma sincronização por vez.** O `pg_advisory_xact_lock` do começo da requisição serializa tudo (ver ADR 0001).
- **O `Relogio` é a única porta da casca.** O núcleo recebe o `agora` por parâmetro; a casca recebe `Relogio { agora() }` em `construirApp({ relogio })`; os testes usam o `RelogioFixo` (`ir`, `avancar`) e não esperam o tique. Com `DEMO=1`, a API sobe parada em `RELOGIO_FIXO` e `POST /api/demo/relogio` move o tempo ao vivo; sem `DEMO=1` a rota não existe (ADR 0005). A tela nunca usa o relógio do navegador para regras: usa o `agora` da sessão e da agenda.
- **O núcleo do `sincronizar` fica no módulo `ciclo`** e usa as regras de Penalidade e Suspensão do `conduta` pelo `index.ts` dele.

## Opções consideradas

- **Só na leitura** (calcular o Status quando alguém olha): descartado. Nada fica gravado, então a exclusion constraint e a Cota veem dados velhos; no protótipo, o Gestor aprovava um Pedido já Expirado e as faltas nunca viravam Suspensão.
- **Só job** (um agendador aplica os vencimentos de tempos em tempos): descartado. Com o servidor hibernando, o banco fica atrasado até o próximo tique e as requisições agem em cima de dados velhos.
