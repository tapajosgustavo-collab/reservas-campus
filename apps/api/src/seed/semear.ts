import { TZDate } from '@date-fns/tz';
import type { CadastrarRecurso } from '@reservas/shared';
import { addDays, addHours } from 'date-fns';
import type { Banco } from '../comum/banco';
import { FUSO } from '../comum/instante';
import * as recursos from '../modulos/recursos';
import * as reservas from '../modulos/reservas';

// Os Usuários do "Entrar como…" (#18). `<nome>.demo@unifesp.br` porque o repositório é público e
// `nome.sobrenome@unifesp.br` pode ser de uma pessoa real.
const USUARIOS = [
  { nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Bruno Lima', email: 'bruno.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Bia Santos', email: 'bia.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Eduardo Prado', email: 'eduardo.demo@unifesp.br', perfil: 'Docente' },
  { nome: 'Carlos Mendes', email: 'carlos.demo@unifesp.br', perfil: 'Gestor' },
  { nome: 'Dora Alves', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
] as const;

type Email = (typeof USUARIOS)[number]['email'];

/** De segunda a sexta, das `abre` às `fecha` horas. */
function segASex(abre: number, fecha: number) {
  return [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: abre * 60, fecha: fecha * 60 }));
}

// Os nove Recursos do #18 (§3): a Dora é a Gestora responsável pelos Espaços e o Carlos, pelos
// Equipamentos (RN13). O Laboratório 2 e o Auditório são restritos (RN10).
const RECURSOS: { gestor: Email; recurso: CadastrarRecurso }[] = [
  ...(
    [
      ['Sala 101', 'Bloco A', 40, segASex(7, 23), false],
      ['Sala 102', 'Bloco A', 40, segASex(7, 23), false],
      ['Sala de estudos 3', 'Biblioteca', 6, segASex(8, 22), false],
      ['Laboratório de Informática 2', 'Bloco B', 30, segASex(7, 23), true],
      ['Auditório', 'Bloco Central', 150, segASex(8, 22), true],
    ] as const
  ).map(([nome, local, capacidade, horarios, restrito]) => ({
    gestor: 'dora.demo@unifesp.br' as const,
    recurso: { tipo: 'Espaco' as const, nome, local, capacidade, horarios, restrito },
  })),
  ...(
    [
      ['Projetor Epson P-123', 'P-123'],
      ['Projetor Epson P-124', 'P-124'],
      ['Notebook Dell N-01', 'N-01'],
      ['Notebook Dell N-02', 'N-02'],
    ] as const
  ).map(([nome, patrimonio]) => ({
    gestor: 'carlos.demo@unifesp.br' as const,
    recurso: {
      tipo: 'Equipamento' as const,
      nome,
      local: 'Almoxarifado de TI',
      patrimonio,
      horarios: segASex(7, 22),
    },
  })),
];

/**
 * As Reservas das cenas (#18, §4), em T0 + `dias` e horas: na demo T0 é D (terça) às 08:00, então
 * `{ dias: 0, das: 2, ate: 4 }` é D das 10h às 12h. Cada uma foi criada pelo dono no dia
 * `criadaNoDia` à hora do T0: Confirmada no Recurso comum e Pendente no restrito (RN10), como o
 * `reservar` faria. Cresce por incremento, nos tickets "cenas da demo no seed".
 */
const RESERVAS: {
  quem: Email;
  recurso: string;
  dias: number;
  das: number;
  ate: number;
  criadaNoDia: number;
}[] = [
  // D−7, 10h–12h: a aba "Encerradas" com conteúdo. O Check-in às 9h55 chega no incremento 4, e com
  // ele o sincronizar a Conclui às 12h (RN18).
  { quem: 'ana.demo@unifesp.br', recurso: 'Sala 101', dias: -7, das: 2, ate: 4, criadaNoDia: -8 },
  // D, 10h–12h: tira a Sala 101 da busca da Ana (cena 2), dá o Conflito da cena 3 e é a falta
  // que suspende o Bruno (cena 7).
  { quem: 'bruno.demo@unifesp.br', recurso: 'Sala 101', dias: 0, das: 2, ate: 4, criadaNoDia: -2 },
  // D, 9h–11h: a próxima Reserva do notebook que o Eduardo não devolveu (RN23, cena 6).
  {
    quem: 'bia.demo@unifesp.br',
    recurso: 'Notebook Dell N-01',
    dias: 0,
    das: 1,
    ate: 3,
    criadaNoDia: -1,
  },
  // D+1, 10h–12h: a Reserva que a "Dedetização" da Dora cancela ao vivo (RN04, cena 1).
  {
    quem: 'bia.demo@unifesp.br',
    recurso: 'Sala de estudos 3',
    dias: 1,
    das: 2,
    ate: 4,
    criadaNoDia: -1,
  },
  // D, 12h–14h, pedida em D−2: o Pedido na fila da Dora (cena 5) que expira às 10h, no Prazo de
  // decisão (RN12, cena 7).
  {
    quem: 'bruno.demo@unifesp.br',
    recurso: 'Laboratório de Informática 2',
    dias: 0,
    das: 4,
    ate: 6,
    criadaNoDia: -2,
  },
];

/**
 * As Indisponibilidades do #18 (§3), de T0 + `dias` até T0 + `ateDias`, ou sem fim com
 * `ateDias: null`. Cada uma foi criada pelo Gestor no próprio início.
 */
const INDISPONIBILIDADES: {
  recurso: string;
  dias: number;
  ateDias: number | null;
  motivo: string;
}[] = [
  // Do T0 a D+2: tira a Sala 102 da busca da Ana (cena 2).
  { recurso: 'Sala 102', dias: 0, ateDias: 2, motivo: 'Manutenção do ar-condicionado' },
  // Desde D−3, sem fim: o Recurso tirado de uso da cena 1.
  { recurso: 'Projetor Epson P-124', dias: -3, ateDias: null, motivo: 'Extraviado' },
];

const MEIA_HORA = 30 * 60_000;

/**
 * O `agora` arredondado para a próxima meia hora (#18). São Paulo fica a um número inteiro de
 * horas do UTC, então a meia hora do UTC é a de lá.
 */
function t0De(agora: Date) {
  return new Date(Math.ceil(agora.getTime() / MEIA_HORA) * MEIA_HORA);
}

/** T0 + dias do calendário de São Paulo + horas. */
function noT0(t0: Date, dias: number, horas = 0) {
  return new Date(addHours(addDays(new TZDate(t0, FUSO), dias), horas).getTime());
}

// Usuários, Recursos e Reservas em sequência: com o Neon longe do runner do reset, os 5 s padrão
// do Prisma não bastam, e a lista cresce a cada incremento.
const LIMITES = { timeout: 30_000 };

/**
 * Dados de demonstração (RNF10, #18). Só roda com o banco vazio, para nunca misturar com o que já
 * existe. As datas são relativas ao T0, o `agora` do relógio arredondado para a próxima meia hora.
 * Grava só o que as pessoas fizeram, pelo `executar` de cada módulo; o que o tempo faz sai do
 * `sincronizar(T0)` da primeira requisição.
 */
export async function semear(banco: Banco, agora: Date): Promise<'semeado' | 'ignorado'> {
  const t0 = t0De(agora);
  return banco.$transaction(async (tx) => {
    // Toda linha do banco leva a um Usuário (Recurso pelo Gestor, Reserva pelo dono...),
    // então sem Usuário o banco está vazio.
    if ((await tx.usuario.count()) > 0) return 'ignorado';
    // Não há comando que crie Usuário: só o seed grava em `usuario` (schema.prisma, ADR 0002).
    const usuarios = await tx.usuario.createManyAndReturn({
      data: [...USUARIOS],
      select: { id: true, email: true },
    });
    const idDe = new Map(usuarios.map(({ email, id }) => [email, id]));

    const idsDosRecursos = new Map<string, number>();
    // Um nome errado nas RESERVAS falha aqui, com o nome, em vez de num erro do Prisma.
    const idDoRecurso = (nome: string) => {
      const id = idsDosRecursos.get(nome);
      if (id === undefined) throw new Error(`O seed não tem o Recurso "${nome}".`);
      return id;
    };
    const restritos = new Set<string>();
    for (const { gestor, recurso } of RECURSOS) {
      const id = await recursos.executar(tx, {
        evento: 'RecursoCadastrado',
        recurso: { ...recurso, gestorId: idDe.get(gestor)! },
      });
      idsDosRecursos.set(recurso.nome, id);
      if (recurso.restrito) restritos.add(recurso.nome);
    }

    for (const { quem, recurso, dias, das, ate, criadaNoDia } of RESERVAS) {
      const usuarioId = idDe.get(quem)!;
      const criadaEm = noT0(t0, criadaNoDia);
      const status = restritos.has(recurso) ? 'Pendente' : 'Confirmada';
      await reservas.executar(tx, {
        evento: 'ReservaCriada',
        reserva: {
          usuarioId,
          recursoId: idDoRecurso(recurso),
          inicio: noT0(t0, dias, das),
          fim: noT0(t0, dias, ate),
          status,
          criadaEm,
        },
        transicao: { de: null, para: status, em: criadaEm, porId: usuarioId },
      });
    }

    for (const { recurso, dias, ateDias, motivo } of INDISPONIBILIDADES) {
      const inicio = noT0(t0, dias);
      await recursos.executar(tx, {
        evento: 'IndisponibilidadeCriada',
        indisponibilidade: {
          recursoId: idDoRecurso(recurso),
          inicio,
          fim: ateDias === null ? null : noT0(t0, ateDias),
          motivo,
          criadaEm: inicio,
        },
      });
    }
    return 'semeado';
  }, LIMITES);
}
