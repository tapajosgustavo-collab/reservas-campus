import type { Politica, TipoNotificacao } from '@reservas/shared';
import { dataHoraEmSaoPaulo } from '../../../comum/instante';

/** US16: uma Notificação pronta para gravar, com a `mensagem` montada pelo núcleo. */
export interface NotificacaoEmitida {
  evento: 'NotificacaoEmitida';
  notificacao: {
    destinatarioId: number;
    tipo: TipoNotificacao;
    mensagem: string;
    em: Date;
    reservaId?: number;
    suspensaoId?: number;
  };
}

/**
 * RN19: o aviso de que a Suspensão começou. Sai quando a Penalidade que a causou é gravada (o id
 * da Suspensão vem do banco), datado no início dela.
 */
export function notificacaoDeInicioDaSuspensao(
  suspensao: { id: number; usuarioId: number; inicio: Date; fim: Date },
  politica: Pick<Politica, 'penalidadesParaSuspensao' | 'janelaDePenalidadesDias'>,
): NotificacaoEmitida {
  return {
    evento: 'NotificacaoEmitida',
    notificacao: {
      destinatarioId: suspensao.usuarioId,
      tipo: 'InicioSuspensao',
      mensagem: `Você está suspenso até ${dataHoraEmSaoPaulo(suspensao.fim)} por acumular ${politica.penalidadesParaSuspensao} Penalidades em ${politica.janelaDePenalidadesDias} dias e não pode criar Reservas. As Reservas que você já tem continuam valendo.`,
      em: suspensao.inicio,
      suspensaoId: suspensao.id,
    },
  };
}
