import { Alert, Button, Group, List, Modal, Stack, Text, VisuallyHidden } from '@mantine/core';
import type { Reserva } from '@reservas/shared';
import { useEffect, useState } from 'react';
import { ErroDaApi } from '../../comum/api';
import { linhaDaViolacao } from '../../comum/violacoes';
import { useSessao } from '../conduta';
import { rotuloDoIntervalo } from '../reservas';
import { msAteInicio, podeCancelar, useCancelarReserva } from './cancelamento';

interface Props {
  reserva: Pick<Reserva, 'id' | 'status' | 'inicio' | 'fim'>;
  /** O `agora` da API (da sessão), não o do navegador. */
  agora: string;
  /** Para o leitor de tela saber de qual Reserva é o botão, numa lista, e para a confirmação. */
  nomeDoRecurso: string;
}

function Erro({ erro }: { erro: Error }) {
  const violacoes = erro instanceof ErroDaApi ? erro.violacoes : [];
  return (
    <Alert color="red" role="alert" p="xs">
      {violacoes.length === 0 ? (
        erro.message
      ) : (
        <List size="sm">
          {violacoes.map((violacao, i) => (
            <List.Item key={i}>{linhaDaViolacao(violacao)}</List.Item>
          ))}
        </List>
      )}
    </Alert>
  );
}

/** Folga para o relógio do navegador adiantado: na borda, a API já tem que ter chegado lá. */
const FOLGA_MS = 1000;
/** O `setTimeout` estoura acima de ~24,8 dias e dispararia na hora; um dia basta para reagendar. */
const ESPERA_MAXIMA_MS = 24 * 60 * 60 * 1000;

/**
 * Com a tela parada, o `agora` da sessão envelhece. Quando chega o início, consulta a sessão de
 * novo para o botão sumir sem recarregar.
 */
function useAgoraEmDiaNaBorda(espera: number | null) {
  const { refetch: consultarAgora } = useSessao();
  useEffect(() => {
    if (espera === null) return;
    const id = setTimeout(
      () => void consultarAgora(),
      Math.min(espera + FOLGA_MS, ESPERA_MAXIMA_MS),
    );
    return () => clearTimeout(id);
  }, [espera, consultarAgora]);
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
      <Modal opened={confirmando} onClose={() => setConfirmando(false)} title="Cancelar reserva">
        <Stack gap="md">
          <Text size="sm">
            Tem certeza de que deseja cancelar a Reserva de <strong>{nomeDoRecurso}</strong> (
            {rotuloDoIntervalo(reserva.inicio, reserva.fim)})?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmando(false)}>
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
