import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { notificacaoDeInicioDaSuspensao } from './notificacao';

describe('RN19 · Notificação de início da Suspensão', () => {
  it('RN19_avisa até quando o Usuário está suspenso, por quê, e que as Reservas dele continuam', () => {
    const suspensao = {
      id: 5,
      usuarioId: 7,
      inicio: new Date('2026-11-04T10:15:00-03:00'),
      fim: new Date('2026-11-11T10:15:00-03:00'),
    };

    expect(notificacaoDeInicioDaSuspensao(suspensao, POLITICA)).toEqual({
      evento: 'NotificacaoEmitida',
      notificacao: {
        destinatarioId: 7,
        tipo: 'InicioSuspensao',
        mensagem:
          'Você está suspenso até 11/11/2026 às 10:15 por acumular 3 Penalidades em 30 dias e não pode criar Reservas. As Reservas que você já tem continuam valendo.',
        em: new Date('2026-11-04T10:15:00-03:00'),
        suspensaoId: 5,
      },
    });
  });
});
