import { TZDate } from '@date-fns/tz';
import { esquemaRelogio, type MudarRelogio, type Sessao } from '@reservas/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatISO } from 'date-fns';
import { enviarJson } from '../../comum/api';
import { voltarAoEntrarNo401 } from '../conduta';

const FUSO = 'America/Sao_Paulo';

export const ATALHOS_DE_MINUTOS = [
  { minutos: 15, rotulo: '+15m' },
  { minutos: 30, rotulo: '+30m' },
  { minutos: 60, rotulo: '+1h' },
] as const;

const emSaoPaulo = (instante: string) => new TZDate(instante, FUSO);

/** Mostra o `agora` do servidor no fuso de São Paulo (RNF08). */
export function rotuloDoAgora(agora: string) {
  return format(emSaoPaulo(agora), "dd/MM/yyyy 'às' HH:mm");
}

/** Valor do `input[type="datetime-local"]` (`YYYY-MM-DDTHH:mm`) sincronizado com o `agora` em São Paulo. */
export function paraCampoDeDataHora(agora: string) {
  return format(emSaoPaulo(agora), "yyyy-MM-dd'T'HH:mm");
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
