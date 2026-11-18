import { POLITICA } from '@reservas/shared';
import type { Transacao } from '../../../comum/banco';
import type { Penalidade, Suspensao } from '../../../generated/prisma/client';
import type { PenalidadeGerada } from '../nucleo/penalidade';
import { inicioDaJanela, suspensaoPelaPenalidade } from '../nucleo/suspensao';

/**
 * Registra uma Penalidade (só o M1 grava em `penalidade` e `suspensao`). Os outros módulos que
 * geram uma (o Não comparecimento e o Cancelamento tardio, no M4) gravam por aqui. Carrega o
 * histórico do Usuário e pergunta ao núcleo se nasce uma Suspensão (RN19); se nascer, grava e
 * marca as Penalidades que contaram (RN20), e ela volta junto para quem chamou avisar o Usuário.
 */
export async function registrarPenalidade(
  tx: Transacao,
  efeito: PenalidadeGerada,
): Promise<{ penalidade: Penalidade; suspensao: Suspensao | null }> {
  const { usuarioId, em } = efeito.penalidade;
  const historico = await tx.penalidade.findMany({
    where: {
      usuarioId,
      em: { gt: inicioDaJanela(em, POLITICA), lte: em },
    },
    select: { id: true, em: true, suspensaoId: true },
  });
  const penalidade = await tx.penalidade.create({ data: efeito.penalidade });

  const iniciada = suspensaoPelaPenalidade(efeito.penalidade, historico, POLITICA);
  if (!iniciada) return { penalidade, suspensao: null };

  const suspensao = await tx.suspensao.create({
    data: { usuarioId, inicio: iniciada.inicio, fim: iniciada.fim },
  });
  await tx.penalidade.updateMany({
    where: { id: { in: [...iniciada.penalidadeIds, penalidade.id] } },
    data: { suspensaoId: suspensao.id },
  });
  return { penalidade: { ...penalidade, suspensaoId: suspensao.id }, suspensao };
}
