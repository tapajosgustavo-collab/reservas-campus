import type { CadastrarRecurso } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { decidirCadastro, decidirEdicao } from './recurso';

const carlos = { id: 3, perfil: 'Gestor' } as const;
const dora = { id: 4, perfil: 'Gestor' } as const;

/** O projetor P-123 da RN13, cadastrado pelo Carlos. */
const projetor = { id: 10, tipo: 'Equipamento', gestorId: carlos.id } as const;

describe('RN13 · Gestor do Recurso', () => {
  it('RN13 · Carlos cadastra o projetor P-123 → aceita, com o Carlos como Gestor responsável', () => {
    const p123: CadastrarRecurso = {
      tipo: 'Equipamento',
      nome: 'Projetor',
      patrimonio: 'P-123',
      horarios: [{ diaSemana: 1, abre: 7 * 60, fecha: 23 * 60 }],
    };

    expect(decidirCadastro(p123, carlos)).toEqual({
      tipo: 'aceita',
      efeitos: [{ evento: 'RecursoCadastrado', recurso: { ...p123, gestorId: carlos.id } }],
    });
  });

  it('RN13 · Carlos cadastrou o P-123, Dora tenta editar → recusado', () => {
    expect(decidirEdicao(projetor, { nome: 'Projetor Epson' }, dora)).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN13',
          nome: 'Gestor do Recurso',
          mensagem: 'Só o Gestor responsável por este Recurso pode editá-lo.',
        },
      ],
    });
  });

  it('RN13 · Carlos edita o P-123 que ele cadastrou → aceita', () => {
    expect(decidirEdicao(projetor, { nome: 'Projetor Epson' }, carlos)).toEqual({
      tipo: 'aceita',
      efeitos: [{ evento: 'RecursoEditado', recursoId: 10, edicao: { nome: 'Projetor Epson' } }],
    });
  });
});
