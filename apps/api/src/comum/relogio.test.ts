import { describe, expect, it } from 'vitest';
import { RelogioFixo, relogioDoAmbiente, relogioDoSistema } from './relogio';

describe('RNF02 · RelogioFixo', () => {
  it('fica parado no instante em que foi criado', () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T08:00:00-03:00'));

    expect(relogio.agora()).toEqual(new Date('2026-11-10T08:00:00-03:00'));
    expect(relogio.agora()).toEqual(new Date('2026-11-10T08:00:00-03:00'));
  });

  it('avancar(76) leva das 09:00 às 10:16', () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T09:00:00-03:00'));

    relogio.avancar(76);

    expect(relogio.agora()).toEqual(new Date('2026-11-10T10:16:00-03:00'));
  });

  it('ir(data) vai para o instante exato', () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T09:00:00-03:00'));

    relogio.ir(new Date('2026-11-12T14:30:00-03:00'));

    expect(relogio.agora()).toEqual(new Date('2026-11-12T14:30:00-03:00'));
  });

  it('quem guardou um agora não vê o relógio mudar depois', () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T09:00:00-03:00'));
    const guardado = relogio.agora();

    relogio.avancar(30);

    expect(guardado).toEqual(new Date('2026-11-10T09:00:00-03:00'));
  });
});

describe('RNF02 · Relógio do ambiente (servidor e seed)', () => {
  it('sem DEMO=1, é o relógio do sistema, mesmo com RELOGIO_FIXO', () => {
    expect(relogioDoAmbiente({ DEMO: '0', RELOGIO_FIXO: '2026-11-10T08:00:00-03:00' })).toBe(
      relogioDoSistema,
    );
  });

  it('com DEMO=1, fica parado no RELOGIO_FIXO', () => {
    const relogio = relogioDoAmbiente({ DEMO: '1', RELOGIO_FIXO: '2026-11-10T08:00:00-03:00' });

    expect(relogio).toBeInstanceOf(RelogioFixo);
    expect(relogio.agora()).toEqual(new Date('2026-11-10T08:00:00-03:00'));
  });

  it('com DEMO=1 e RELOGIO_FIXO vazio, fica parado no instante em que foi criado', () => {
    const antes = Date.now();

    const relogio = relogioDoAmbiente({ DEMO: '1', RELOGIO_FIXO: '' });

    expect(relogio).toBeInstanceOf(RelogioFixo);
    const parado = relogio.agora().getTime();
    expect(parado).toBeGreaterThanOrEqual(antes);
    expect(parado).toBeLessThanOrEqual(Date.now());
  });

  it('recusa um RELOGIO_FIXO sem deslocamento, que seria lido no fuso da máquina', () => {
    expect(() => relogioDoAmbiente({ DEMO: '1', RELOGIO_FIXO: '2026-11-10T08:00:00' })).toThrow();
  });
});
