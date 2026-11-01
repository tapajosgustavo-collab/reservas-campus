# Checklist de release

Antes de criar a tag `v0.N` de um incremento (Incremento 0 → `v0.0`), quem faz a release confere cada item abaixo na `main` e cola a lista marcada na descrição da release, junto com as notas da retrospectiva. Item que não passa segura a tag: abra um ticket e resolva antes. Os itens vêm da spec §8, decididos nos tickets [Fluxo de Git e revisão do grupo](https://github.com/tapajosgustavo-collab/reservas-campus/issues/14), [RNFs verificáveis](https://github.com/tapajosgustavo-collab/reservas-campus/issues/20) e [Segurança automatizada no CI](https://github.com/tapajosgustavo-collab/reservas-campus/issues/19).

```markdown
- [ ] Todos os tickets do milestone do incremento fechados
- [ ] RNs do incremento com testes passando (matriz)
- [ ] p95 ≤ 500 ms nas rotas do incremento (RNF12)
- [ ] `/api/docs` com todas as rotas (RNF06)
- [ ] Subir do zero seguindo o README (RNF05)
- [ ] Nenhum alerta `high`/`critical` aberto e nenhuma exceção vencida no `audit-ci` (RNF14)
```

## Como conferir cada item

**Tickets do incremento.** Nenhuma issue aberta no milestone (`gh issue list --milestone "Incremento N"`).

**RNs com testes (matriz).** Abra a última execução do CI na `main` (aba *Actions*, workflow `CI`) e veja o resumo dos jobs `nucleo` e `api`: a matriz RN → testes lista cada RN com os testes que têm o id dela no nome. Toda RN do incremento (tabela da §9 do [`requisitos.md`](requisitos.md#9-entregas-incrementais)) precisa aparecer com teste passando. O Incremento 0 não tem RN.

**p95 do RNF12.** A partir do Incremento 1, na mesma execução, o resumo do job `e2e` mostra o p95 do `npm run carga` (10 conexões por 30 s contra a imagem Docker) em criar Reserva, agenda, fila do Gestor e Notificações. Cada rota do incremento precisa ficar em até 500 ms. A carga não bloqueia o CI: é aqui que ela é cobrada. Não vale para o Incremento 0: essas rotas e o `npm run carga` chegam no Incremento 1 (#39).

**`/api/docs` (RNF06).** Com a aplicação no ar, abra <http://localhost:3000/api/docs> e confira que toda rota registrada na API aparece, com os schemas de entrada e de resposta.

**Subir do zero (RNF05).** Num clone novo (ou depois de `docker compose down -v`), siga só o [README](../README.md#rodar-na-sua-máquina): `docker compose up --build` precisa abrir a tela em <http://localhost:3000> com os dados do seed. Anote na release qualquer passo que faltou e corrija o README.

**Segurança (RNF14).** Na aba *Security* do repositório, nenhum alerta `high` ou `critical` aberto no Dependabot, no CodeQL (*Code scanning*) e no *Secret scanning*. Os dois primeiros também dão para conferir pelo terminal (cada comando precisa responder `0`):

```bash
gh api "repos/tapajosgustavo-collab/reservas-campus/dependabot/alerts?state=open&severity=high,critical" -q length
gh api "repos/tapajosgustavo-collab/reservas-campus/code-scanning/alerts?state=open&severity=critical,high" -q length
```

Os alertas de secret scanning só aparecem para quem administra o repositório: peça ao dono para conferir. No [`audit-ci.jsonc`](../audit-ci.jsonc), toda exceção da `allowlist` precisa estar com a validade no futuro; a vencida é reavaliada antes da tag.

## Depois do checklist

```bash
gh release create v0.N --target main --title "Incremento N: <nome>" --notes-file notas.md
```

O `gh release create` cria a tag no último commit da `main`. O `notas.md` leva o checklist marcado e as notas da retrospectiva.
