import { z } from 'zod';

/** Instante com deslocamento explícito, como todo instante que entra na API. */
const instante = z.iso.datetime({ offset: true });

export const esquemaMudarRelogio = z.union([
  z.strictObject({ avancarMinutos: z.number().int().positive() }),
  z.strictObject({ ir: instante }),
]);

export type MudarRelogio = z.infer<typeof esquemaMudarRelogio>;

export const esquemaRelogio = z.object({
  agora: instante.describe('Instante do relógio da demo, com o deslocamento de São Paulo'),
});

export type RelogioDemo = z.infer<typeof esquemaRelogio>;
