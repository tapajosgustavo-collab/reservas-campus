import { z } from 'zod';

/** Instante em ISO 8601 com deslocamento explícito (spec §5). */
export const esquemaInstante = z.iso.datetime({ offset: true });
