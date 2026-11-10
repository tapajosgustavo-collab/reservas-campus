import { esquemaEmUso, esquemaReserva, type RegistrarDevolucao } from '@reservas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarJson, enviarJson } from '../../comum/api';

export interface FormularioDaDevolucao {
  observacao: string;
  /** Equipamento perdido ou roubado: exige observação e oferece criar Indisponibilidade sem fim (RN17). */
  extraviado: boolean;
}

/** RN17: a observação é opcional, mas passa a ser obrigatória quando o Equipamento foi perdido ou roubado. */
export function podeConfirmarDevolucao({ observacao, extraviado }: FormularioDaDevolucao): boolean {
  if (!extraviado) return true;
  return Boolean(observacao.trim());
}

export function corpoDaDevolucao({
  observacao,
  extraviado,
}: FormularioDaDevolucao): RegistrarDevolucao {
  const texto = observacao.trim();
  return {
    ...(texto && { observacao: texto }),
    ...(extraviado && { extraviado: true }),
  };
}

/** US14: Reservas Em uso dos Equipamentos do Gestor da sessão, ordenadas pelo fim. */
export function useEmUso() {
  return useQuery({
    queryKey: ['em-uso'],
    queryFn: () => buscarJson('/api/gestao/em-uso', esquemaEmUso),
  });
}

export function useRegistrarDevolucao() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, devolucao }: { id: number; devolucao: RegistrarDevolucao }) =>
      enviarJson('POST', `/api/reservas/${id}/devolucao`, devolucao, esquemaReserva),
    onSettled: () => cliente.invalidateQueries(),
  });
}
