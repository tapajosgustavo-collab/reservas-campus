Closes #

## O que mudou

<!-- O que este PR faz e por quê, em poucas linhas. Um ticket por PR, até ~400 linhas (sem lockfile e código gerado). -->

## Como testar

<!-- Comandos ou passos para o revisor conferir. Ex.: `npm test`, `docker compose up` e abrir /reservas. -->

1.

## Checklist de revisão (Aula 4)

Para quem revisa. Comente o que não estiver ok; peça mudança quando for o caso.

- [ ] **Correção:** faz o que o ticket pede, inclusive nos casos de borda e de erro
- [ ] **Design:** respeita o núcleo puro, a decisão como valor e a fronteira dos módulos ([ADR 0001](https://github.com/tapajosgustavo-collab/reservas-campus/blob/main/docs/adr/0001-nucleo-funcional-casca-imperativa.md))
- [ ] **Complexidade:** não há abstração especulativa nem código mais complicado que o problema
- [ ] **Testes:** conferem resultado, não chamadas; cada RN tocada tem teste com o id no nome
- [ ] **Legibilidade:** nomes com os termos do [`CONTEXT.md`](https://github.com/tapajosgustavo-collab/reservas-campus/blob/main/CONTEXT.md); dá para entender sem o autor explicar
- [ ] **Manutenibilidade:** sem duplicação desnecessária; mudar isso depois não exige mexer em muitos lugares
- [ ] **Segurança:** a rota confere sessão e autorização; nada de segredo no código; entrada validada
- [ ] **Compatibilidade:** migração aditiva; contrato da API (`packages/shared` e OpenAPI) e tela continuam combinando

## Definition of Done

Para quem abriu o PR, antes de pedir o merge.

- [ ] Testes escritos: cada RN tocada tem teste com o id dela no nome (RNF01); no PR de RN, o commit `test:` vem antes do `feat:`
- [ ] CI verde
- [ ] 1 aprovação
- [ ] Docs atualizados, o que couber: README, `docs/requisitos.md`, `CONTEXT.md` ou OpenAPI
- [ ] Critério de aceite do ticket cumprido
- [ ] Depois do merge: o deploy em produção saiu
