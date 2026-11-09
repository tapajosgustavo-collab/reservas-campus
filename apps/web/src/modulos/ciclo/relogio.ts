import { TZDate } from '@date-fns/tz';
import { esquemaRelogio, type MudarRelogio, type Sessao } from '@reservas/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatISO } from 'date-fns';
import { enviarJson } from '../../comum/api';
import { voltarAoEntrarNo401 } from '../conduta';

const FUSO = 'America/Sao_Paulo';
const MINUTO_MS = 60_000;

export const ATALHOS_DE_MINUTOS = [
  { minutos: 15, rotulo: '+15m' },
  { minutos: 30, rotulo: '+30m' },
  { minutos: 60, rotulo: '+1h' },
] as const;

/**
 * Valor e `min` do `input[type="datetime-local"]` (`YYYY-MM-DDTHH:mm`) em São Paulo. Se o relógio
 * tiver segundos (ex.: `08:00:30`), arredonda para o próximo minuto (`08:01`) para o `min` nunca
 * permitir um instante anterior ao `agora`.
 */
export function paraCampoDeDataHora(agora: string) {
  const proximoMinuto = Math.ceil(Date.parse(agora) / MINUTO_MS) * MINUTO_MS;
  return format(new TZDate(proximoMinuto, FUSO), "yyyy-MM-dd'T'HH:mm");
}

/** Converte `YYYY-MM-DDTHH:mm` do horário de São Paulo no corpo `{ ir }` com deslocamento explícito. */
export function corpoIrPara(dataHoraLocal: string): { ir: string } {
  const [data = '', horario = ''] = dataHoraLocal.split('T');
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number);
  const [hora = 0, minuto = 0, segundo = 0] = horario.split(':').map(Number);
  return {
    ir: formatISO(new TZDate(ano, mes - 1, dia, hora, minuto, segundo, FUSO)),
  };
}

/**
 * Depois de mudar o relógio da demo, atualiza o `agora` na sessão e invalida todas as consultas
 * para a tela inteira refletir o tempo novo e o que o `sincronizar(agora)` aplicou.
 */
export function depoisDeMudarRelogio(cliente: QueryClient, agora: string) {
  cliente.setQueryData<Sessao | null>(['sessao'], (atual) => (atual ? { ...atual, agora } : atual));
  void cliente.invalidateQueries();
}

export function useMudarRelogio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (mudanca: MudarRelogio) =>
      enviarJson('POST', '/api/demo/relogio', mudanca, esquemaRelogio),
    onSuccess: ({ agora }) => depoisDeMudarRelogio(cliente, agora),
    onError: (erro) => voltarAoEntrarNo401(cliente, erro),
  });
}
