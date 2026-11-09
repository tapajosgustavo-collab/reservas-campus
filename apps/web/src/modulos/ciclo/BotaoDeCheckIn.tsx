import { Button, Stack, VisuallyHidden } from '@mantine/core';
import type { Reserva } from '@reservas/shared';
import { Erro, useAgoraEmDiaNaBorda } from './botao';
import { checkInAberto, msAteMudarOBotao, useFazerCheckIn } from './check-in';

interface Props {
  reserva: Pick<Reserva, 'id' | 'status' | 'inicio'>;
  /** O `agora` da API (da sessão), não o do navegador. */
  agora: string;
  /** Para o leitor de tela saber de qual Reserva é o botão, numa lista. */
  nomeDoRecurso: string;
}

/** US12: o dono faz o Check-in da Reserva Confirmada, só na janela da RN14. Fora dela, nada. */
export function BotaoDeCheckIn({ reserva, agora, nomeDoRecurso }: Props) {
  const fazer = useFazerCheckIn();
  const aberto = checkInAberto(reserva, agora);
  useAgoraEmDiaNaBorda(msAteMudarOBotao(reserva, agora));
  // Se a API recusou (a janela fechou enquanto a tela estava aberta), o motivo continua à vista.
  if (!aberto && !fazer.isError) return null;

  return (
    <Stack gap={4} align="flex-start">
      {aberto && (
        <Button size="xs" loading={fazer.isPending} onClick={() => fazer.mutate(reserva.id)}>
          Fazer Check-in<VisuallyHidden> da Reserva de {nomeDoRecurso}</VisuallyHidden>
        </Button>
      )}
      {fazer.isError && <Erro erro={fazer.error} />}
    </Stack>
  );
}
