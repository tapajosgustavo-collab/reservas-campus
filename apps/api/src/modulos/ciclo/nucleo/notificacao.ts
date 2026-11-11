import type { TipoNotificacao } from '@reservas/shared';

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
