import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { ErroDaApi } from '../../comum/api';
import { voltarAoEntrarNo401 } from './sessao';

function umClienteComSessao() {
  const cliente = new QueryClient();
  cliente.setQueryData(['sessao'], { usuario: { id: 1 } });
  return cliente;
}

it('US01 · um 401 no meio do uso consulta a sessão de novo, para a tela voltar ao "Entrar"', () => {
  const cliente = umClienteComSessao();

  voltarAoEntrarNo401(
    cliente,
    new ErroDaApi(401, 'nao_autenticado', 'Entre no sistema para continuar.'),
  );

  expect(cliente.getQueryState(['sessao'])?.isInvalidated).toBe(true);
});

it.each([
  { quando: 'erro 422', erro: new ErroDaApi(422, 'regra_violada', 'RN01 · …') },
  { quando: 'falha de rede', erro: new TypeError('Failed to fetch') },
])('outro erro ($quando) não mexe na sessão', ({ erro }) => {
  const cliente = umClienteComSessao();

  voltarAoEntrarNo401(cliente, erro);

  expect(cliente.getQueryState(['sessao'])?.isInvalidated).toBe(false);
});
