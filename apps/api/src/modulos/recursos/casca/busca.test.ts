import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaReserva,
  umEquipamento,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

/** De segunda a sexta, das 7h às 23h. */
const DIAS_UTEIS = {
  create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
};

/** Terça, 10/11/2026, em São Paulo. */
function terca(de: string, ate: string) {
  return { inicio: `2026-11-10T${de}:00-03:00`, fim: `2026-11-10T${ate}:00-03:00` };
}

/** A query da busca de um Intervalo, já codificada (o `+` do deslocamento não pode virar espaço). */
function noIntervalo({ inicio, fim }: { inicio: string; fim: string }) {
  return new URLSearchParams({ inicio, fim }).toString();
}

async function buscar(query: string, usuarioId?: number) {
  const app = await umaApp({ banco });
  const ana = usuarioId ?? (await umUsuario(banco, 'Aluno', { nome: 'Ana' })).id;
  const resposta = await app.inject({
    method: 'GET',
    url: `/api/recursos?${query}`,
    cookies: sessaoDe(app, ana),
  });
  return resposta;
}

async function nomesDa(query: string) {
  const resposta = await buscar(query);
  expect(resposta.statusCode).toBe(200);
  return resposta.json().map(({ nome }: { nome: string }) => nome);
}

comBanco('US06 · Buscar Recurso livre', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('sem filtro → todos os Recursos, por nome, com o resumo de cada um', async () => {
    const lab = await umEspaco(banco, { nome: 'Laboratório 3', local: 'Bloco A', capacidade: 30 });
    const projetor = await umEquipamento(banco, { nome: 'Datashow', patrimonio: 'PAT-00042' });

    const resposta = await buscar('');

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: projetor.id,
        tipo: 'Equipamento',
        nome: 'Datashow',
        local: null,
        capacidade: null,
        patrimonio: 'PAT-00042',
      },
      {
        id: lab.id,
        tipo: 'Espaco',
        nome: 'Laboratório 3',
        local: 'Bloco A',
        capacidade: 30,
        patrimonio: null,
      },
    ]);
  });

  it('tipo=Equipamento → só os Equipamentos', async () => {
    await umEspaco(banco, { nome: 'Auditório' });
    await umEquipamento(banco, { nome: 'Projetor' });

    expect(await nomesDa('tipo=Equipamento')).toEqual(['Projetor']);
  });

  it('capacidadeMin=40 → só os Espaços com Capacidade 40 ou mais', async () => {
    await umEspaco(banco, { nome: 'Sala 30', capacidade: 30 });
    await umEspaco(banco, { nome: 'Sala 40', capacidade: 40 });
    await umEspaco(banco, { nome: 'Sala 80', capacidade: 80 });
    await umEquipamento(banco, { nome: 'Projetor' });

    expect(await nomesDa('capacidadeMin=40')).toEqual(['Sala 40', 'Sala 80']);
  });

  it('q procura no nome e no local, sem diferenciar maiúsculas', async () => {
    await umEspaco(banco, { nome: 'Laboratório 3', local: 'Bloco A' });
    await umEspaco(banco, { nome: 'Auditório', local: 'Bloco B' });
    await umEquipamento(banco, { nome: 'Projetor', local: 'Laboratório de Física' });

    expect(await nomesDa('q=laborat')).toEqual(['Laboratório 3', 'Projetor']);
    expect(await nomesDa('q=BLOCO%20B')).toEqual(['Auditório']);
  });

  it('RN01 · Reserva ativa 10h–12h, buscar 11h–13h → o Recurso some', async () => {
    const ocupado = await umEspaco(banco, { nome: 'Ocupado', horarios: DIAS_UTEIS });
    await umEspaco(banco, { nome: 'Livre', horarios: DIAS_UTEIS });
    await umaReserva(banco, { recursoId: ocupado.id, ...terca('10:00', '12:00') });

    expect(await nomesDa(noIntervalo(terca('11:00', '13:00')))).toEqual(['Livre']);
  });

  it('RN01 · Reserva Pendente 10h–12h também ocupa: buscar 10h–12h → some', async () => {
    const lab = await umEspaco(banco, { nome: 'Laboratório', horarios: DIAS_UTEIS });
    await umaReserva(banco, { recursoId: lab.id, status: 'Pendente', ...terca('10:00', '12:00') });

    const resposta = await buscar(noIntervalo(terca('10:00', '12:00')));

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });

  it('RN01 · Reserva Cancelada 10h–12h não conta: buscar 10h–12h → aparece', async () => {
    const lab = await umEspaco(banco, { nome: 'Laboratório', horarios: DIAS_UTEIS });
    await umaReserva(banco, {
      recursoId: lab.id,
      status: 'Cancelada',
      ...terca('10:00', '12:00'),
    });

    expect(await nomesDa(noIntervalo(terca('10:00', '12:00')))).toEqual(['Laboratório']);
  });

  it('RN01 · Reserva 10h–12h, buscar 12h–14h (só encosta) → aparece', async () => {
    const lab = await umEspaco(banco, { nome: 'Laboratório', horarios: DIAS_UTEIS });
    await umaReserva(banco, { recursoId: lab.id, ...terca('10:00', '12:00') });

    expect(await nomesDa(noIntervalo(terca('12:00', '14:00')))).toEqual(['Laboratório']);
  });

  it('RN03 · abre 7h–23h, buscar 22h–23h30 → some', async () => {
    await umEspaco(banco, { nome: 'Laboratório', horarios: DIAS_UTEIS });
    await umEspaco(banco, {
      nome: 'Biblioteca',
      horarios: { create: [{ diaSemana: 2, abre: 0, fecha: 24 * 60 }] },
    });

    expect(await nomesDa(noIntervalo(terca('22:00', '23:30')))).toEqual(['Biblioteca']);
  });

  it('RN03 · fechado no sábado, buscar sábado 10h–12h → some', async () => {
    await umEspaco(banco, { nome: 'Laboratório', horarios: DIAS_UTEIS });
    await umEspaco(banco, {
      nome: 'Quadra',
      horarios: { create: [{ diaSemana: 6, abre: 8 * 60, fecha: 18 * 60 }] },
    });

    const sabado = { inicio: '2026-11-14T10:00:00-03:00', fim: '2026-11-14T12:00:00-03:00' };
    expect(await nomesDa(noIntervalo(sabado))).toEqual(['Quadra']);
  });

  it('Equipamento por unidade: dos dois projetores, aparece só o livre, com o patrimônio', async () => {
    const reservado = await umEquipamento(banco, {
      nome: 'Projetor Epson',
      patrimonio: 'PAT-00001',
      horarios: DIAS_UTEIS,
    });
    const livre = await umEquipamento(banco, {
      nome: 'Projetor Epson',
      patrimonio: 'PAT-00002',
      horarios: DIAS_UTEIS,
    });
    await umaReserva(banco, { recursoId: reservado.id, ...terca('10:00', '12:00') });

    const resposta = await buscar(`q=projetor&${noIntervalo(terca('10:00', '12:00'))}`);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: livre.id,
        tipo: 'Equipamento',
        nome: 'Projetor Epson',
        local: null,
        capacidade: null,
        patrimonio: 'PAT-00002',
      },
    ]);
  });

  it('os filtros se somam: tipo, Capacidade, texto e Intervalo', async () => {
    const grande = await umEspaco(banco, {
      nome: 'Sala grande ocupada',
      capacidade: 60,
      horarios: DIAS_UTEIS,
    });
    await umEspaco(banco, { nome: 'Sala grande livre', capacidade: 60, horarios: DIAS_UTEIS });
    await umEspaco(banco, { nome: 'Sala pequena', capacidade: 10, horarios: DIAS_UTEIS });
    await umEquipamento(banco, { nome: 'Sala móvel de som', horarios: DIAS_UTEIS });
    await umaReserva(banco, { recursoId: grande.id, ...terca('10:00', '12:00') });

    const query = `tipo=Espaco&capacidadeMin=50&q=sala&${noIntervalo(terca('10:00', '12:00'))}`;
    expect(await nomesDa(query)).toEqual(['Sala grande livre']);
  });

  it('gestor=eu com Intervalo → só os livres do Gestor da sessão', async () => {
    const carlos = await umUsuario(banco, 'Gestor');
    const meu = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Meu ocupado',
      horarios: DIAS_UTEIS,
    });
    await umEspaco(banco, { gestorId: carlos.id, nome: 'Meu livre', horarios: DIAS_UTEIS });
    await umEspaco(banco, { nome: 'De outro Gestor', horarios: DIAS_UTEIS });
    await umaReserva(banco, { recursoId: meu.id, ...terca('10:00', '12:00') });

    const resposta = await buscar(`gestor=eu&${noIntervalo(terca('10:00', '12:00'))}`, carlos.id);

    expect(resposta.json().map(({ nome }: { nome: string }) => nome)).toEqual(['Meu livre']);
  });

  it('inicio sem fim → 400', async () => {
    const resposta = await buscar(
      new URLSearchParams({ inicio: terca('10:00', '12:00').inicio }).toString(),
    );

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
  });

  it('inicio sem deslocamento → 400', async () => {
    const resposta = await buscar('inicio=2026-11-10T10:00:00&fim=2026-11-10T12:00:00');

    expect(resposta.statusCode).toBe(400);
  });

  it('sem sessão → 401', async () => {
    const app = await umaApp({ banco });

    const resposta = await app.inject({ method: 'GET', url: '/api/recursos?tipo=Espaco' });

    expect(resposta.statusCode).toBe(401);
  });
});
