import { Button, Group, Modal, Stack, Text, VisuallyHidden } from '@mantine/core';
import type { Reserva } from '@reservas/shared';
import { useState } from 'react';
import { rotuloDoIntervalo } from '../reservas';
import { Erro, useAgoraEmDiaNaBorda } from './botao';
import { msAteInicio, podeCancelar, useCancelarReserva } from './cancelamento';

interface Props {
  reserva: Pick<Reserva, 'id' | 'status' | 'inicio' | 'fim'>;
  /** O `agora` da API (da sessão), não o do navegador. */
  agora: string;
  /** Para o leitor de tela saber de qual Reserva é o botão, numa lista, e para a confirmação. */
  nomeDoRecurso: string;
}

/** US13: o dono cancela a Reserva Pendente ou Confirmada antes do início, com confirmação. */
export function BotaoDeCancelar({ reserva, agora, nomeDoRecurso }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useCancelarReserva();
  const aberta = podeCancelar(reserva, agora);
  useAgoraEmDiaNaBorda(msAteInicio(reserva, agora));
  // Se a API recusou (o início chegou enquanto a tela estava aberta), o motivo continua à vista.
  if (!aberta && !cancelar.isError) return null;

  function confirmar() {
    cancelar.mutate(reserva.id, {
      onSettled: () => setConfirmando(false),
    });
  }

  return (
    <Stack gap={4} align="flex-start">
      {aberta && (
        <Button size="xs" variant="default" onClick={() => setConfirmando(true)}>
          Cancelar<VisuallyHidden> Reserva de {nomeDoRecurso}</VisuallyHidden>
        </Button>
      )}
      {cancelar.isError && <Erro erro={cancelar.error} />}
      <Modal
        opened={confirmando}
        onClose={() => !cancelar.isPending && setConfirmando(false)}
        closeOnClickOutside={!cancelar.isPending}
        closeOnEscape={!cancelar.isPending}
        withCloseButton={!cancelar.isPending}
        title="Cancelar reserva"
      >
        <Stack gap="md">
          <Text size="sm">
            Tem certeza de que deseja cancelar a Reserva de <strong>{nomeDoRecurso}</strong> (
            {rotuloDoIntervalo(reserva.inicio, reserva.fim)})?
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={cancelar.isPending}
              onClick={() => setConfirmando(false)}
            >
              Voltar
            </Button>
            <Button color="red" loading={cancelar.isPending} onClick={confirmar}>
              Confirmar cancelamento
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
