import { z } from 'zod';

/** A única porta da casca (ADR 0001): de onde vem o `agora` de cada requisição. */
export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = { agora: () => new Date() };

/** Relógio parado dos testes e da demo (`DEMO=1`): só anda quando alguém manda. */
export class RelogioFixo implements Relogio {
  #instante: Date;

  constructor(instante: Date) {
    this.#instante = new Date(instante);
  }

  agora() {
    return new Date(this.#instante);
  }

  ir(instante: Date) {
    this.#instante = new Date(instante);
  }

  avancar(minutos: number) {
    this.#instante = new Date(this.#instante.getTime() + minutos * 60_000);
  }
}

/** ISO com deslocamento, para não depender do fuso da máquina. Vazio no .env conta como ausente. */
export const esquemaRelogioFixo = z.preprocess(
  (valor) => valor || undefined,
  z.iso.datetime({ offset: true }).optional(),
);

/**
 * O relógio que o ambiente pede. Na demo (`DEMO=1`) ele começa parado no `RELOGIO_FIXO` (ou agora,
 * se faltar) e só anda pela rota; fora dela, é o do sistema. O servidor e o seed usam este mesmo,
 * para o T0 do seed ser o agora com que a API sobe (#18).
 */
export function relogioDoAmbiente(ambiente: { DEMO?: string; RELOGIO_FIXO?: string }): Relogio {
  if (ambiente.DEMO !== '1') return relogioDoSistema;
  const fixo = esquemaRelogioFixo.parse(ambiente.RELOGIO_FIXO);
  return new RelogioFixo(fixo ? new Date(fixo) : new Date());
}
