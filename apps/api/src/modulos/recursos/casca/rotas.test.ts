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

const SEG_A_SEX_7H_23H = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  abre: 7 * 60,
  fecha: 23 * 60,
}));

const LAB = {
  tipo: 'Espaco',
  nome: 'Laboratório 3',
  local: 'Bloco A, 2º andar',
  capacidade: 30,
  horarios: SEG_A_SEX_7H_23H,
};

const PROJETOR = {
  tipo: 'Equipamento',
  nome: 'Projetor Epson',
  patrimonio: 'P-123',
  horarios: SEG_A_SEX_7H_23H,
};

comBanco('US04 · Cadastrar Recurso', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('POST /api/recursos com um Espaço → 201, e quem cadastrou é o Gestor responsável (RN13)', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload: LAB,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({
      id: expect.any(Number),
      tipo: 'Espaco',
      nome: 'Laboratório 3',
      local: 'Bloco A, 2º andar',
      capacidade: 30,
      patrimonio: null,
      gestor: { id: carlos.id, nome: 'Carlos' },
      horarios: SEG_A_SEX_7H_23H,
    });
  });

  it('POST /api/recursos com um Equipamento → 201 com o patrimônio', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload: { ...PROJETOR, horarios: [{ diaSemana: 6, abre: 8 * 60, fecha: 12 * 60 }] },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      tipo: 'Equipamento',
      nome: 'Projetor Epson',
      local: null,
      capacidade: null,
      patrimonio: 'P-123',
      gestor: { id: carlos.id },
      horarios: [{ diaSemana: 6, abre: 480, fecha: 720 }],
    });
  });

  it.each(['Aluno', 'Docente'] as const)(
    '%s tentando cadastrar → 403, nada gravado',
    async (perfil) => {
      const app = await umaApp({ banco });
      const usuario = await umUsuario(banco, perfil);

      const resposta = await app.inject({
        method: 'POST',
        url: '/api/recursos',
        cookies: sessaoDe(app, usuario.id),
        payload: LAB,
      });

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toMatchObject({
        codigo: 'proibido',
        mensagem: 'Só Gestor pode fazer isto.',
      });
      expect(await banco.recurso.count()).toBe(0);
    },
  );

  it('sem sessão → 401', async () => {
    const app = await umaApp({ banco });

    const resposta = await app.inject({ method: 'POST', url: '/api/recursos', payload: LAB });

    expect(resposta.statusCode).toBe(401);
  });

  it.each([
    {
      caso: 'abre fora da meia hora',
      horarios: [{ diaSemana: 1, abre: 7 * 60 + 15, fecha: 12 * 60 }],
      mensagem: 'múltiplos de 30',
    },
    {
      caso: 'fecha antes de abrir',
      horarios: [{ diaSemana: 1, abre: 12 * 60, fecha: 8 * 60 }],
      mensagem: 'fecha precisa ser depois de abre',
    },
    {
      caso: 'duas faixas na segunda',
      horarios: [
        { diaSemana: 1, abre: 8 * 60, fecha: 12 * 60 },
        { diaSemana: 1, abre: 14 * 60, fecha: 18 * 60 },
      ],
      mensagem: 'no máximo uma faixa por dia da semana',
    },
    {
      caso: 'dia 7',
      horarios: [{ diaSemana: 7, abre: 8 * 60, fecha: 12 * 60 }],
      mensagem: 'horarios.0.diaSemana',
    },
    {
      caso: 'fecha depois da meia-noite',
      horarios: [{ diaSemana: 1, abre: 22 * 60, fecha: 25 * 60 }],
      mensagem: 'horarios.0.fecha',
    },
  ])('Horário de funcionamento com $caso → 400, nada gravado', async ({ horarios, mensagem }) => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload: { ...LAB, horarios },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
    expect(resposta.json().erro.mensagem).toContain(mensagem);
    expect(await banco.recurso.count()).toBe(0);
  });

  it.each([
    { caso: 'Espaço sem Capacidade', payload: { ...LAB, capacidade: undefined } },
    { caso: 'Espaço com patrimônio', payload: { ...LAB, patrimonio: 'P-1' } },
    { caso: 'Equipamento sem patrimônio', payload: { ...PROJETOR, patrimonio: undefined } },
    { caso: 'Equipamento com Capacidade', payload: { ...PROJETOR, capacidade: 2 } },
    { caso: 'o campo restrito (só no incremento 3)', payload: { ...LAB, restrito: true } },
  ])('$caso → 400', async ({ payload }) => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload,
    });

    expect(resposta.statusCode).toBe(400);
    expect(await banco.recurso.count()).toBe(0);
  });

  it('dia sem faixa fica fechado: o Recurso pode nascer só com a segunda', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload: { ...LAB, horarios: [{ diaSemana: 1, abre: 0, fecha: 1440 }] },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().horarios).toEqual([{ diaSemana: 1, abre: 0, fecha: 1440 }]);
  });

  it('patrimônio que já existe → 400, e o outro Equipamento não muda', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    await umEquipamento(banco, { patrimonio: 'P-123', nome: 'Projetor antigo' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos',
      cookies: sessaoDe(app, carlos.id),
      payload: PROJETOR,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'entrada_invalida',
      mensagem: 'Já existe um Equipamento com o patrimônio P-123.',
    });
    expect(await banco.recurso.count()).toBe(1);
  });
});

comBanco('US04 · Editar Recurso', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('PATCH /api/recursos/:id pelo Gestor responsável → 200, e os horários são trocados inteiros', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const lab = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Lab 3',
      local: 'Bloco A',
      capacidade: 30,
      horarios: { create: SEG_A_SEX_7H_23H },
    });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${lab.id}`,
      cookies: sessaoDe(app, carlos.id),
      payload: { capacidade: 25, horarios: [{ diaSemana: 6, abre: 8 * 60, fecha: 12 * 60 }] },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: lab.id,
      nome: 'Lab 3',
      local: 'Bloco A',
      capacidade: 25,
      horarios: [{ diaSemana: 6, abre: 480, fecha: 720 }],
    });
  });

  it('RN13 · outro Gestor editando → 403 citando a RN13, e nada muda', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });
    const p123 = await umEquipamento(banco, {
      gestorId: carlos.id,
      patrimonio: 'P-123',
      nome: 'Projetor',
    });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${p123.id}`,
      cookies: sessaoDe(app, dora.id),
      payload: { nome: 'Projetor da Dora' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem:
          'RN13 · Gestor do Recurso: Só o Gestor responsável por este Recurso pode editá-lo.',
        violacoes: [
          {
            rn: 'RN13',
            nome: 'Gestor do Recurso',
            mensagem: 'Só o Gestor responsável por este Recurso pode editá-lo.',
          },
        ],
      },
    });
    expect((await banco.recurso.findUniqueOrThrow({ where: { id: p123.id } })).nome).toBe(
      'Projetor',
    );
  });

  it.each([
    { campo: 'tipo', payload: { tipo: 'Equipamento' } },
    { campo: 'patrimonio', payload: { patrimonio: 'P-999' } },
  ])('PATCH mudando $campo → 400, porque não muda', async ({ campo, payload }) => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const p123 = await umEquipamento(banco, { gestorId: carlos.id, patrimonio: 'P-123' });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${p123.id}`,
      cookies: sessaoDe(app, carlos.id),
      payload,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.mensagem).toContain(campo);
    expect(await banco.recurso.findUniqueOrThrow({ where: { id: p123.id } })).toMatchObject({
      tipo: 'Equipamento',
      patrimonio: 'P-123',
    });
  });

  it('PATCH com Capacidade num Equipamento → 400', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const p123 = await umEquipamento(banco, { gestorId: carlos.id });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${p123.id}`,
      cookies: sessaoDe(app, carlos.id),
      payload: { capacidade: 3 },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.mensagem).toBe('Equipamento não tem Capacidade.');
  });

  it('PATCH com local null apaga o local do Equipamento; no Espaço → 400', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const p123 = await umEquipamento(banco, { gestorId: carlos.id, local: 'Almoxarifado' });
    const lab = await umEspaco(banco, { gestorId: carlos.id, local: 'Bloco A' });

    const doEquipamento = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${p123.id}`,
      cookies: sessaoDe(app, carlos.id),
      payload: { local: null },
    });
    const doEspaco = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${lab.id}`,
      cookies: sessaoDe(app, carlos.id),
      payload: { local: null },
    });

    expect(doEquipamento.statusCode).toBe(200);
    expect(doEquipamento.json().local).toBeNull();
    expect(doEspaco.statusCode).toBe(400);
    expect(doEspaco.json().erro.mensagem).toBe('Espaço precisa de local.');
  });

  it('a edição não cancela nem muda as Reservas que já existem', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const lab = await umEspaco(banco, {
      gestorId: carlos.id,
      capacidade: 30,
      horarios: { create: SEG_A_SEX_7H_23H },
    });
    // Terça, 10h–12h, com 30 pessoas.
    const reserva = await umaReserva(banco, { recursoId: lab.id, participantes: 30 });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${lab.id}`,
      cookies: sessaoDe(app, carlos.id),
      // Fecha a terça e baixa a Capacidade para menos que os participantes.
      payload: { capacidade: 10, horarios: [{ diaSemana: 1, abre: 7 * 60, fecha: 12 * 60 }] },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await banco.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).toEqual(reserva);
  });

  it('Aluno editando → 403', async () => {
    const app = await umaApp({ banco });
    const aluno = await umUsuario(banco, 'Aluno');
    const lab = await umEspaco(banco);

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/recursos/${lab.id}`,
      cookies: sessaoDe(app, aluno.id),
      payload: { nome: 'Meu lab' },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('Recurso que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');

    const resposta = await app.inject({
      method: 'PATCH',
      url: '/api/recursos/999',
      cookies: sessaoDe(app, carlos.id),
      payload: { nome: 'Lab' },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro.codigo).toBe('nao_encontrado');
  });
});

comBanco('US04 · Ver Recurso e Meus recursos', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('GET /api/recursos/:id → o Recurso com os horários e o Gestor, para qualquer Usuário', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const aluno = await umUsuario(banco, 'Aluno');
    const lab = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Lab 3',
      local: 'Bloco A',
      capacidade: 30,
      horarios: {
        create: [
          { diaSemana: 5, abre: 8 * 60, fecha: 12 * 60 },
          { diaSemana: 1, abre: 7 * 60, fecha: 23 * 60 },
        ],
      },
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}`,
      cookies: sessaoDe(app, aluno.id),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: lab.id,
      tipo: 'Espaco',
      nome: 'Lab 3',
      local: 'Bloco A',
      capacidade: 30,
      patrimonio: null,
      gestor: { id: carlos.id, nome: 'Carlos' },
      horarios: [
        { diaSemana: 1, abre: 420, fecha: 1380 },
        { diaSemana: 5, abre: 480, fecha: 720 },
      ],
    });
  });

  it('GET /api/recursos/:id de um Recurso que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const aluno = await umUsuario(banco, 'Aluno');

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/recursos/999',
      cookies: sessaoDe(app, aluno.id),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('GET /api/recursos/:id com id maior que o INT4 → 400, não 500', async () => {
    const app = await umaApp({ banco });
    const aluno = await umUsuario(banco, 'Aluno');

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/recursos/3000000000',
      cookies: sessaoDe(app, aluno.id),
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('GET /api/recursos?gestor=eu → só os Recursos do Gestor da sessão, por nome', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const dora = await umUsuario(banco, 'Gestor');
    const projetor = await umEquipamento(banco, { gestorId: carlos.id, nome: 'Projetor' });
    const auditorio = await umEspaco(banco, { gestorId: carlos.id, nome: 'Auditório' });
    await umEspaco(banco, { gestorId: dora.id, nome: 'Lab da Dora' });

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/recursos?gestor=eu',
      cookies: sessaoDe(app, carlos.id),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().map(({ id }: { id: number }) => id)).toEqual([
      auditorio.id,
      projetor.id,
    ]);
  });
});
