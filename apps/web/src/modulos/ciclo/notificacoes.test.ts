import { describe, expect, it } from 'vitest';
import {
  avisoDeNovasNotificacoes,
  iniciarPollingVisivel,
  INTERVALO_DE_POLLING_MS,
  rotuloDoSino,
} from './notificacoes';

function criarAmbienteFalso(visibilidadeInicial: 'visible' | 'hidden' = 'visible') {
  const ouvintesDoc = new Map<string, Set<() => void>>();
  const ouvintesJanela = new Map<string, Set<() => void>>();
  let proximoId = 1;
  const intervalos = new Map<number, { fn: () => void; ms: number }>();

  const documento = {
    visibilityState: visibilidadeInicial,
    addEventListener(tipo: string, fn: () => void) {
      if (!ouvintesDoc.has(tipo)) ouvintesDoc.set(tipo, new Set());
      ouvintesDoc.get(tipo)!.add(fn);
    },
    removeEventListener(tipo: string, fn: () => void) {
      ouvintesDoc.get(tipo)?.delete(fn);
    },
  };

  const janela = {
    addEventListener(tipo: string, fn: () => void) {
      if (!ouvintesJanela.has(tipo)) ouvintesJanela.set(tipo, new Set());
      ouvintesJanela.get(tipo)!.add(fn);
    },
    removeEventListener(tipo: string, fn: () => void) {
      ouvintesJanela.get(tipo)?.delete(fn);
    },
  };

  return {
    ambiente: {
      documento,
      janela,
      agendarIntervalo(fn: () => void, ms: number) {
        const id = proximoId++;
        intervalos.set(id, { fn, ms });
        return id as unknown as ReturnType<typeof setInterval>;
      },
      cancelarIntervalo(id: ReturnType<typeof setInterval>) {
        intervalos.delete(id as unknown as number);
      },
    },
    get intervalosAtivos() {
      return [...intervalos.values()];
    },
    dispararTick() {
      for (const { fn } of [...intervalos.values()]) fn();
    },
    mudarVisibilidade(novo: 'visible' | 'hidden') {
      documento.visibilityState = novo;
      for (const fn of [...(ouvintesDoc.get('visibilitychange') ?? [])]) fn();
    },
    focarJanela() {
      for (const fn of [...(ouvintesJanela.get('focus') ?? [])]) fn();
    },
  };
}

describe('US16 · Polling de 30 s por visibilidade e foco', () => {
  it('agenda intervalo de 30 s quando a aba está visível e busca a cada ciclo', () => {
    const cenario = criarAmbienteFalso('visible');
    let buscas = 0;
    const parar = iniciarPollingVisivel(() => {
      buscas += 1;
    }, cenario.ambiente);

    expect(cenario.intervalosAtivos).toHaveLength(1);
    expect(cenario.intervalosAtivos[0]?.ms).toBe(INTERVALO_DE_POLLING_MS);
    expect(buscas).toBe(0);

    cenario.dispararTick();
    cenario.dispararTick();
    expect(buscas).toBe(2);

    parar();
    expect(cenario.intervalosAtivos).toHaveLength(0);
  });

  it('pausa o setInterval quando document.visibilityState fica hidden e retoma buscando na hora ao voltar a ficar visible', () => {
    const cenario = criarAmbienteFalso('visible');
    let buscas = 0;
    const parar = iniciarPollingVisivel(() => {
      buscas += 1;
    }, cenario.ambiente);

    cenario.mudarVisibilidade('hidden');
    expect(cenario.intervalosAtivos).toHaveLength(0);

    cenario.dispararTick();
    expect(buscas).toBe(0);

    cenario.mudarVisibilidade('visible');
    expect(buscas).toBe(1);
    expect(cenario.intervalosAtivos).toHaveLength(1);

    cenario.dispararTick();
    expect(buscas).toBe(2);

    parar();
  });

  it('ao receber window.focus com a aba visível, dispara busca imediata e reinicia o ciclo do timer de 30 s', () => {
    const cenario = criarAmbienteFalso('visible');
    let buscas = 0;
    const parar = iniciarPollingVisivel(() => {
      buscas += 1;
    }, cenario.ambiente);

    cenario.focarJanela();
    expect(buscas).toBe(1);
    expect(cenario.intervalosAtivos).toHaveLength(1);

    cenario.dispararTick();
    expect(buscas).toBe(2);

    parar();
  });

  it('remove os ouvintes e cancela o timer ao limpar o efeito', () => {
    const cenario = criarAmbienteFalso('visible');
    let buscas = 0;
    const parar = iniciarPollingVisivel(() => {
      buscas += 1;
    }, cenario.ambiente);

    parar();
    cenario.focarJanela();
    cenario.mudarVisibilidade('visible');
    cenario.dispararTick();
    expect(buscas).toBe(0);
  });
});

describe('US16 · Aviso de chegada de nova Notificação e rótulo do sino', () => {
  it('não dispara aviso na carga inicial, mas avisa quando chega uma não lida nova no polling', () => {
    const inicial = avisoDeNovasNotificacoes(null, [
      { id: 1, mensagem: 'Antiga não lida', lidaEm: null },
    ]);
    expect(inicial.aviso).toBeNull();

    const mesmoEstado = avisoDeNovasNotificacoes(inicial.vistas, [
      { id: 1, mensagem: 'Antiga não lida', lidaEm: null },
    ]);
    expect(mesmoEstado.aviso).toBeNull();

    const comNova = avisoDeNovasNotificacoes(mesmoEstado.vistas, [
      { id: 2, mensagem: 'Seu Pedido de Sala 101 foi aprovado.', lidaEm: null },
      { id: 1, mensagem: 'Antiga não lida', lidaEm: null },
    ]);
    expect(comNova.aviso).toBe('Seu Pedido de Sala 101 foi aprovado.');

    const aposLer = avisoDeNovasNotificacoes(comNova.vistas, [
      {
        id: 2,
        mensagem: 'Seu Pedido de Sala 101 foi aprovado.',
        lidaEm: '2026-11-10T09:05:00-03:00',
      },
      { id: 1, mensagem: 'Antiga não lida', lidaEm: null },
    ]);
    expect(aposLer.aviso).toBeNull();
  });

  it('formata o rótulo acessível do sino com o número de não lidas', () => {
    expect(rotuloDoSino(0)).toBe('Notificações');
    expect(rotuloDoSino(1)).toBe('Notificações (1 não lida)');
    expect(rotuloDoSino(4)).toBe('Notificações (4 não lidas)');
  });
});
