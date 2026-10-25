# Protótipo: regras de tempo (descartável)

Ticket: [Como as regras de tempo rodam e são testadas](https://github.com/tapajosgustavo-collab/reservas-campus/issues/12). Esta branch nunca é mesclada.

**Pergunta:** as regras que dependem do tempo (RN12, RN15, RN17, RN18, RN19, RN23 e o lembrete da US16) rodam por job agendado, são calculadas na leitura, ou uma mistura? E como o relógio é injetado (RNF02)?

## Como abrir

Baixe `demo.html` e abra com dois cliques. Escolha o modo (Misto, Só job, Só na leitura), rode os roteiros guiados nas abas e compare.

## Arquivos

| Arquivo | O que é |
|---|---|
| `nucleo.ts` | Núcleo funcional: `vencimentos(mundo)`, `sincronizar(mundo, agora)` e os comandos (`criarReserva`, `aprovar`, `fazerCheckIn`, `registrarDevolucao`, `cancelar`). Só funções puras; o "agora" sempre chega por parâmetro. É a parte que vale levar para o código real. |
| `casca-esboco.ts` | Esboço da casca: interface `Relogio`, `RelogioFixo` para testes e demo, onde a sincronização roda (começo de cada requisição + tique de 1 min) e como fica idempotente. |
| `demo.template.html` + `montar.mjs` | A página clicável. `tsc nucleo.ts --target es2022 --module es2022 --strict && node montar.mjs` gera o `demo.html` com o núcleo embutido. |
| `demo.html` | A página já montada. |
