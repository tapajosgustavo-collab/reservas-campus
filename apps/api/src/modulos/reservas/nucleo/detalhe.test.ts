import { describe, expect, it } from 'vitest';
import { violacoesDoDetalhe } from './detalhe';

const ANA = { id: 7, perfil: 'Aluno' } as const;
const BRUNO = { id: 8, perfil: 'Aluno' } as const;
const CARLOS = { id: 2, perfil: 'Gestor' } as const;
const DORA = { id: 3, perfil: 'Gestor' } as const;

/** Reserva da Ana num Recurso do Carlos. */
const DA_ANA = { usuarioId: ANA.id, gestorId: CARLOS.id };

describe('RN22 · Agenda sem nomes', () => {
  it('a dona abre a própria Reserva', () => {
    expect(violacoesDoDetalhe(DA_ANA, ANA)).toEqual([]);
  });

  it('o Gestor responsável pelo Recurso abre a Reserva', () => {
    expect(violacoesDoDetalhe(DA_ANA, CARLOS)).toEqual([]);
  });

  it('Bruno tenta abrir a Reserva da Ana → recusado citando a regra', () => {
    expect(violacoesDoDetalhe(DA_ANA, BRUNO)).toEqual([
      {
        rn: 'RN22',
        nome: 'Agenda sem nomes',
        mensagem: 'Só quem fez a Reserva e o Gestor do Recurso podem abri-la.',
      },
    ]);
  });

  it('Gestor de outro Recurso → recusado', () => {
    expect(violacoesDoDetalhe(DA_ANA, DORA)).toMatchObject([{ rn: 'RN22' }]);
  });
});
