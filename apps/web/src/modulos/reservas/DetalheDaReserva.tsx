import { Alert, Anchor, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { BotaoDeCheckIn } from '../ciclo';
import { useSessao } from '../conduta';
import {
  rotuloDaTransicao,
  rotuloDoInstante,
  rotuloDoIntervalo,
  ROTULO_DO_STATUS,
} from './apresentacao';
import { useReserva } from './reservas';

/** US10: a Reserva com cada mudança de Status. Quem não pode abrir vê a mensagem da RN22. */
export function DetalheDaReserva() {
  const reserva = useReserva(Number(useParams().id));
  const sessao = useSessao().data;
  const ehGestor = sessao?.usuario.perfil === 'Gestor';
  // O Gestor responsável também abre o detalhe, mas o Check-in é só do dono (RN14): só ele recebe
  // o agora da API que o botão usa.
  const agoraDoDono =
    sessao && sessao.usuario.id === reserva.data?.usuario.id ? sessao.agora : undefined;

  return (
    <Stack gap="md">
      {!ehGestor && (
        <Anchor component={Link} to="/reservas" size="sm">
          ← Minhas reservas
        </Anchor>
      )}

      {reserva.isPending && <Loader aria-label="Carregando Reserva" />}
      {reserva.isError && (
        <Alert color="red" role="alert">
          {reserva.error.message}
        </Alert>
      )}
      {reserva.data && (
        <>
          <Stack gap={4}>
            <Title order={2}>{reserva.data.recurso.nome}</Title>
            <Text>{rotuloDoIntervalo(reserva.data.inicio, reserva.data.fim)}</Text>
            <Text>Status: {ROTULO_DO_STATUS[reserva.data.status]}</Text>
            {reserva.data.participantes !== null && (
              <Text>Participantes: {reserva.data.participantes}</Text>
            )}
            {reserva.data.finalidade && <Text>Finalidade: {reserva.data.finalidade}</Text>}
          </Stack>

          {agoraDoDono && (
            <BotaoDeCheckIn
              reserva={reserva.data}
              agora={agoraDoDono}
              nomeDoRecurso={reserva.data.recurso.nome}
            />
          )}

          <Title order={3}>Histórico</Title>
          <Table.ScrollContainer minWidth={520} type="native">
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quando</Table.Th>
                  <Table.Th>Mudança</Table.Th>
                  <Table.Th>Quem</Table.Th>
                  <Table.Th>Observação</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {reserva.data.historico.map((transicao) => (
                  <Table.Tr key={`${transicao.em}-${transicao.para}`}>
                    <Table.Td>{rotuloDoInstante(transicao.em)}</Table.Td>
                    <Table.Td>{rotuloDaTransicao(transicao)}</Table.Td>
                    <Table.Td>{transicao.por?.nome ?? 'Sistema'}</Table.Td>
                    <Table.Td>{transicao.observacao ?? '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
