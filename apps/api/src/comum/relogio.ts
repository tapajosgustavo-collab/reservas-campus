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
