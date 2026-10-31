# Login sem senha, risco aceito só para a demo

O Usuário entra digitando um e-mail `@unifesp.br` que já está no banco de demonstração, **sem senha**, e a tela de login ainda lista "Entrar como…" os Usuários de cada Perfil. Quem souber um e-mail cadastrado entra como aquela pessoa. Aceitamos esse risco de propósito: não há integração com o login da UNIFESP (fora do escopo), o sistema só guarda dados fictícios e criar e guardar senhas traria trabalho e um segredo a mais sem nada a mostrar na apresentação. Decidido no ticket [Definir a arquitetura do backend (em grupo)](https://github.com/tapajosgustavo-collab/reservas-campus/issues/11).

## Consequências

- **A sessão é um cookie emitido pelo backend.** `@fastify/secure-session`, cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, criptografado com o segredo de sessão que fica no Render. Guarda só o `usuarioId` e o `entrouEm` (o `agora` do login), e vale 8 horas contadas pelo `Relogio` da API, para o `RelogioFixo` testar a expiração; a biblioteca também vence o cookie em 8 horas no relógio do sistema ([#33](https://github.com/tapajosgustavo-collab/reservas-campus/issues/33)). Na demo, um salto de 8 horas ou mais no relógio faz todo mundo entrar de novo. Rotas `POST /api/sessao` (entrar), `GET /api/sessao` (quem sou eu) e `DELETE /api/sessao` (sair, mesmo com a sessão vencida, para apagar o cookie).
- **O `usuarioId` vem sempre da sessão, nunca do corpo da requisição**, e toda rota checa a autorização no backend (Aula 12). O login fraco não pode virar desculpa para uma autorização fraca: a RN13 e as regras de dono continuam valendo.
- **Antes de usar com dados reais**, é preciso trocar o login (SSO da UNIFESP ou link mágico por e-mail). A sessão por cookie continua servindo.

## Opções consideradas

- **JWT no `localStorage`**: exposto a XSS e sem vantagem, porque a API e o frontend ficam na mesma origem (ticket #15).
- **Sessão numa tabela do banco**: permitiria revogar, o que a demo não precisa.
