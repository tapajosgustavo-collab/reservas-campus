import {
  Alert,
  Anchor,
  Badge,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { POLITICA } from '@reservas/shared';
import { Link } from 'react-router';
import { rotuloDoInstante, rotuloDoIntervalo } from '../reservas';
import { ROTULO_DO_MOTIVO, rotuloDoQueConta, useConduta } from './conduta';

/** US02: as Penalidades do Usuário da sessão, quais ainda contam e até quando ele está suspenso. */
export function MinhaConduta() {
  const conduta = useConduta();

  return (
    <Stack gap="md">
      <Title order={2}>Minha conduta</Title>

      {conduta.isPending && <Loader aria-label="Carregando a conduta" />}
      {conduta.isError && (
        <Alert color="red" role="alert">
          {conduta.error.message}
        </Alert>
      )}

      {conduta.data && (
        <>
          {conduta.data.suspensoAte ? (
            <Alert color="red" title="Suspensão em vigor">
              Você está suspenso até {rotuloDoInstante(conduta.data.suspensoAte)} e não pode criar
              Reservas. As Reservas que você já tem continuam valendo.
            </Alert>
          ) : (
            <Text>Você não está suspenso.</Text>
          )}
          <Text>{rotuloDoQueConta(conduta.data.penalidadesQueContam, POLITICA)}</Text>

          {conduta.data.penalidades.length === 0 ? (
            <Text c="dimmed">Você não tem Penalidades.</Text>
          ) : (
            <Table.ScrollContainer minWidth={320} type="native">
              {/* Contém os VisuallyHidden (absolutos) no quadro que rola: sem isso, a página rola no celular. */}
              <Table striped pos="relative">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Penalidade</Table.Th>
                    <Table.Th>Reserva de origem</Table.Th>
                    <Table.Th>Suspensão</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {conduta.data.penalidades.map(
                    ({ id, motivo, em, contaParaSuspensao, reserva }) => (
                      <Table.Tr key={id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {ROTULO_DO_MOTIVO[motivo]}
                          </Text>
                          <Text size="sm">{rotuloDoInstante(em)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{reserva.recurso.nome}</Text>
                          <Text size="sm">{rotuloDoIntervalo(reserva.inicio, reserva.fim)}</Text>
                          <Anchor component={Link} to={`/reservas/${reserva.id}`} size="sm">
                            Detalhes
                            <VisuallyHidden> da Reserva de {reserva.recurso.nome}</VisuallyHidden>
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          {contaParaSuspensao ? (
                            <Badge variant="light" color="yellow">
                              Conta
                            </Badge>
                          ) : (
                            <Badge variant="light" color="gray">
                              Não conta
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </>
      )}
    </Stack>
  );
}
