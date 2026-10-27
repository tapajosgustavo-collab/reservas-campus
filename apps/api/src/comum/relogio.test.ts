import { describe, expect, it } from 'vitest';
import { RelogioFixo } from './relogio';

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
