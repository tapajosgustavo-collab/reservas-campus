import type { Transacao } from '../../../comum/banco';
import type { Indisponibilidade } from '../../../generated/prisma/client';
import type { IndisponibilidadeCriada } from '../nucleo/indisponibilidade';
import type { Efeito } from '../nucleo/recurso';

/**
 * Grava um efeito do M2 (só ele grava em `recurso`, `horario_funcionamento` e
 * `indisponibilidade`). Devolve o id do Recurso, ou a Indisponibilidade criada.
 */
export function executar(
  tx: Transacao,
  efeito: IndisponibilidadeCriada,
): Promise<Indisponibilidade>;
export function executar(tx: Transacao, efeito: Efeito): Promise<number>;
export async function executar(
  tx: Transacao,
  efeito: Efeito | IndisponibilidadeCriada,
): Promise<number | Indisponibilidade> {
  switch (efeito.evento) {
    case 'IndisponibilidadeCriada':
      return tx.indisponibilidade.create({ data: efeito.indisponibilidade });
    case 'RecursoCadastrado': {
      const { horarios, ...recurso } = efeito.recurso;
      const { id } = await tx.recurso.create({
        data: { ...recurso, horarios: { create: horarios } },
        select: { id: true },
      });
      return id;
    }
    case 'RecursoEditado': {
      const { horarios, ...campos } = efeito.edicao;
      await tx.recurso.update({ where: { id: efeito.recursoId }, data: campos });
      // O Horário de funcionamento vem inteiro e substitui o anterior. As Reservas não mudam (US04).
      if (horarios) {
        await tx.horarioFuncionamento.deleteMany({ where: { recursoId: efeito.recursoId } });
        await tx.horarioFuncionamento.createMany({
          data: horarios.map((horario) => ({ ...horario, recursoId: efeito.recursoId })),
        });
      }
      return efeito.recursoId;
    }
  }
}
