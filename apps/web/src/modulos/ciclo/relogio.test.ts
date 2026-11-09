import type { Sessao } from '@reservas/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  ATALHOS_DE_MINUTOS,
  corpoIrPara,
  depoisDeMudarRelogio,
  paraCampoDeDataHora,
} from './relogio';

const sessaoInicial: Sessao = {
  usuario: { id: 1, nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
  agora: '2026-11-10T08:00:00-03:00',
  demo: true,
};

describe('RNF02 · Barra de avançar relógio na tela', () => {
  it('sincroniza o valor do campo datetime-local com o agora em São Paulo', () => {
    expect(paraCampoDeDataHora('2026-11-10T11:00:00Z')).toBe('2026-11-10T08:00');
    expect(paraCampoDeDataHora('2026-11-10T10:16:00-03:00')).toBe('2026-11-10T10:16');
  });

  it('monta o corpo {ir} com o deslocamento de São Paulo a partir do campo datetime-local', () => {
    expect(corpoIrPara('2026-11-10T10:16')).toEqual({
      ir: '2026-11-10T10:16:00-03:00',
    });
  });

  it('oferece os atalhos rápidos de +15m, +30m e +1h', () => {
    expect(ATALHOS_DE_MINUTOS).toEqual([
      { minutos: 15, rotulo: '+15m' },
      { minutos: 30, rotulo: '+30m' },
      { minutos: 60, rotulo: '+1h' },
    ]);
  });

  it('depois de mudar o relógio, atualiza o agora da sessão e invalida todas as consultas', () => {
    const cliente = new QueryClient();
    cliente.setQueryData(['sessao'], sessaoInicial);
    cliente.setQueryData(['recursos', 1, 'agenda', null], { agora: sessaoInicial.agora });
    cliente.setQueryData(['reservas', 'ativas', 1], { itens: [], total: 0 });

    depoisDeMudarRelogio(cliente, '2026-11-10T09:00:00-03:00');

    expect(cliente.getQueryData<Sessao>(['sessao'])?.agora).toBe('2026-11-10T09:00:00-03:00');
    expect(cliente.getQueryState(['sessao'])?.isInvalidated).toBe(true);
    expect(cliente.getQueryState(['recursos', 1, 'agenda', null])?.isInvalidated).toBe(true);
    expect(cliente.getQueryState(['reservas', 'ativas', 1])?.isInvalidated).toBe(true);
  });
});
