import { esquemaReserva, POLITICA, type Reserva } from '@reservas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enviarJson } from '../../comum/api';

const MINUTO = 60_000;

type ReservaDoBotao = Pick<Reserva, 'status' | 'inicio'>;

/**
 * RN14: de `abre` (inclusive) a `fecha` (exclusive), em ms desde a época, pela Política. A tela usa
 * a mesma conta no botão e na mensagem depois de criar a Reserva.
 */
export function janelaDoCheckIn(inicio: string) {
  const comeca = Date.parse(inicio);
  return {
    abre: comeca - POLITICA.checkInAntesDoInicioMin * MINUTO,
    fecha: comeca + POLITICA.toleranciaMin * MINUTO,
  };
}

/**
 * RN14: o botão de Check-in só aparece na Reserva Confirmada, dentro da janela, pelo `agora` da API
 * (nunca pelo relógio do navegador). Quem decide é a API: aqui é só para não oferecer o que ela
 * vai recusar.
 */
export function checkInAberto({ status, inicio }: ReservaDoBotao, agora: string) {
  if (status !== 'Confirmada') return false;
  const { abre, fecha } = janelaDoCheckIn(inicio);
  const instante = Date.parse(agora);
  return abre <= instante && instante < fecha;
}

/**
 * Quanto falta, pelo `agora` da API, para o botão aparecer (a janela abre) ou sumir (ela fecha).
 * Passado esse tempo, a tela consulta o `agora` de novo: o navegador só marca a hora de perguntar.
 * `null` quando não há mais nada a esperar.
 */
export function msAteMudarOBotao({ status, inicio }: ReservaDoBotao, agora: string) {
  if (status !== 'Confirmada') return null;
  const { abre, fecha } = janelaDoCheckIn(inicio);
  const instante = Date.parse(agora);
  if (instante < abre) return abre - instante;
  if (instante < fecha) return fecha - instante;
  return null;
}

export function useFazerCheckIn() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (reservaId: number) =>
      enviarJson('POST', `/api/reservas/${reservaId}/check-in`, undefined, esquemaReserva),
    // Aceito, a Reserva fica Em uso em Minhas reservas, no detalhe e na agenda. Recusado, o `agora`
    // da sessão estava velho (a janela fechou com a tela aberta). Nos dois casos, tudo de novo.
    onSettled: () => cliente.invalidateQueries(),
  });
}
