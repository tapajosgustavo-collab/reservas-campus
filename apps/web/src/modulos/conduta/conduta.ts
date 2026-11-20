import { esquemaConduta, type MotivoPenalidade, type Politica } from '@reservas/shared';
import { useQuery } from '@tanstack/react-query';
import { buscarJson } from '../../comum/api';
import { rotuloDoDia } from '../reservas';

/** Os motivos de Penalidade com os termos do `CONTEXT.md`. */
export const ROTULO_DO_MOTIVO: Record<MotivoPenalidade, string> = {
  NaoComparecimento: 'Não comparecimento',
  CancelamentoTardio: 'Cancelamento tardio',
  DevolucaoAtrasada: 'Devolução atrasada',
};

/**
 * RN19: quantas Penalidades contam agora e o que acontece quando chegam ao limite, com os
 * números da Política. A regra é da API: a tela só explica.
 */
export function rotuloDoQueConta(
  contam: number,
  politica: Pick<
    Politica,
    'penalidadesParaSuspensao' | 'janelaDePenalidadesDias' | 'suspensaoDias'
  >,
): string {
  if (contam === 0) return 'Nenhuma Penalidade conta agora para a Suspensão.';
  const quantas = contam === 1 ? '1 Penalidade conta' : `${contam} Penalidades contam`;
  return (
    `${quantas} agora para a Suspensão. Com ${politica.penalidadesParaSuspensao} nos últimos ` +
    `${politica.janelaDePenalidadesDias} dias, você fica suspenso por ${politica.suspensaoDias} dias.`
  );
}

/** US11: "Suspenso até 11/11", no dia de São Paulo. */
export function rotuloDoSuspensoAte(suspensoAte: string): string {
  return `Suspenso até ${rotuloDoDia(suspensoAte)}`;
}

/** US11: o selo de Penalidades do solicitante; sem Penalidade, nada (`null`). */
export function rotuloDasPenalidades30d(quantas: number): string | null {
  if (quantas === 0) return null;
  return quantas === 1 ? '1 Penalidade em 30 dias' : `${quantas} Penalidades em 30 dias`;
}

/** US02: a conduta do Usuário da sessão. */
export function useConduta() {
  return useQuery({
    queryKey: ['conduta'],
    queryFn: () => buscarJson('/api/conduta', esquemaConduta),
  });
}
