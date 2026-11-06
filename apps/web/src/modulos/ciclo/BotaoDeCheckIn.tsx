import { Alert, Button, List, Stack, VisuallyHidden } from '@mantine/core';
import type { Reserva } from '@reservas/shared';
import { useEffect } from 'react';
import { ErroDaApi } from '../../comum/api';
import { linhaDaViolacao } from '../../comum/violacoes';
import { useSessao } from '../conduta';
import { checkInAberto, msAteMudarOBotao, useFazerCheckIn } from './check-in';

interface Props {
  reserva: Pick<Reserva, 'id' | 'status' | 'inicio'>;
  /** O `agora` da API (da sessão), não o do navegador. */
  agora: string;
  /** Para o leitor de tela saber de qual Reserva é o botão, numa lista. */
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
 * Com a tela parada, o `agora` da sessão envelhece. Quando a janela abre ou fecha, consulta a
 * sessão de novo para o botão aparecer ou sumir sem recarregar. Com o relógio da demo parado, a
 * resposta traz o mesmo `agora` e nada mais é agendado.
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
