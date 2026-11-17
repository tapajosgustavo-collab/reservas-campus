export type MotivoPenalidade = 'NaoComparecimento' | 'CancelamentoTardio' | 'DevolucaoAtrasada';

/**
 * Uma Penalidade para gravar no histórico do Usuário. Quem decide é outro módulo (o Não
 * comparecimento, no `sincronizar` do M4); só o M1 grava em `penalidade`. O `em` é a data do
 * vencimento, não a do processamento (ADR 0004).
 */
export interface PenalidadeGerada {
  evento: 'PenalidadeGerada';
  penalidade: {
    usuarioId: number;
    reservaId: number;
    motivo: MotivoPenalidade;
    em: Date;
  };
}
