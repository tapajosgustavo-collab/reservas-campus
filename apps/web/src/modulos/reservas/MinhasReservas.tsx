import {
  Alert,
  Anchor,
  Badge,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { esquemaSituacao, type ItemDeReserva, type Situacao } from '@reservas/shared';
import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BotaoDeCancelar, BotaoDeCancelarSerie, BotaoDeCheckIn, dataDaOcorrencia } from '../ciclo';
import { useSessao } from '../conduta';
import {
  agruparPorSerie,
  paginasDe,
  rotuloDaSerieNaPagina,
  rotuloDoIntervalo,
  ROTULO_DO_STATUS,
} from './apresentacao';
import { useMinhasReservas } from './reservas';

const PAGINA_VAZIA = 'Não há Reservas nesta página.';

const SEM_RESERVAS: Record<Situacao, string> = {
  ativas: 'Você não tem Reservas ativas.',
  encerradas: 'Você não tem Reservas encerradas.',
};

function LinhaDeReserva({
  reserva,
  ocorrenciasDaSerie,
  agora,
}: {
  reserva: ItemDeReserva;
  ocorrenciasDaSerie?: ItemDeReserva[];
  agora: string | undefined;
}) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" align="center">
          <Text size="sm" fw={500}>
            {reserva.recurso.nome}
          </Text>
          {reserva.serieId !== null && (
            <Badge size="xs" variant="outline">
              Ocorrência
            </Badge>
          )}
        </Group>
        <Text size="sm">{rotuloDoIntervalo(reserva.inicio, reserva.fim)}</Text>
      </Table.Td>
      <Table.Td>{ROTULO_DO_STATUS[reserva.status]}</Table.Td>
      <Table.Td>
        <Group gap="xs" align="center">
          {agora && (
            <>
              <BotaoDeCheckIn
                reserva={reserva}
                agora={agora}
                nomeDoRecurso={reserva.recurso.nome}
              />
              <BotaoDeCancelar
                reserva={reserva}
                agora={agora}
                nomeDoRecurso={reserva.recurso.nome}
              />
              {reserva.serieId !== null && ocorrenciasDaSerie && (
                <BotaoDeCancelarSerie
                  serieId={reserva.serieId}
                  ocorrencias={ocorrenciasDaSerie}
                  agora={agora}
                  nomeDoRecurso={reserva.recurso.nome}
                  dataInicial={dataDaOcorrencia(reserva)}
                  rotulo="Cancelar Série daqui em diante"
                />
              )}
            </>
          )}
          <Anchor component={Link} to={`/reservas/${reserva.id}`}>
            Detalhes<VisuallyHidden> da Reserva de {reserva.recurso.nome}</VisuallyHidden>
          </Anchor>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function ListaDeReservas({ situacao, pagina }: { situacao: Situacao; pagina: number }) {
  const reservas = useMinhasReservas(situacao, pagina);
  // As ações do ciclo usam o agora da API, que vem com a sessão.
  const agora = useSessao().data?.agora;

  if (reservas.isPending) return <Loader aria-label="Carregando Reservas" />;
  if (reservas.isError) {
    return (
      <Alert color="red" role="alert">
        {reservas.error.message}
      </Alert>
    );
  }
  if (reservas.data.itens.length === 0) {
    const vazia = reservas.data.total > 0 || pagina > 1;
    return <Text c="dimmed">{vazia ? PAGINA_VAZIA : SEM_RESERVAS[situacao]}</Text>;
  }

  const grupos = agruparPorSerie(reservas.data.itens);

  return (
    <Table.ScrollContainer minWidth={320} type="native">
      {/* Contém os VisuallyHidden (absolutos) no quadro que rola: sem isso, a página rola no celular. */}
      <Table striped pos="relative">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Reserva</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>
              <VisuallyHidden>Ações</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {grupos.map((grupo) =>
            grupo.tipo === 'avulsa' ? (
              <LinhaDeReserva key={grupo.reserva.id} reserva={grupo.reserva} agora={agora} />
            ) : (
              <Fragment key={`serie-${grupo.serieId}`}>
                <Table.Tr>
                  <Table.Td colSpan={2}>
                    <Group gap="xs" align="center">
                      <Text size="sm" fw={600}>
                        {grupo.recurso.nome}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {rotuloDaSerieNaPagina(grupo.ocorrencias)}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {agora && (
                      <BotaoDeCancelarSerie
                        serieId={grupo.serieId}
                        ocorrencias={grupo.ocorrencias}
                        agora={agora}
                        nomeDoRecurso={grupo.recurso.nome}
                      />
                    )}
                  </Table.Td>
                </Table.Tr>
                {grupo.ocorrencias.map((ocorrencia) => (
                  <LinhaDeReserva
                    key={ocorrencia.id}
                    reserva={ocorrencia}
                    ocorrenciasDaSerie={grupo.ocorrencias}
                    agora={agora}
                  />
                ))}
              </Fragment>
            ),
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** US10: as Reservas do Usuário da sessão, separadas pelo Status. A aba e a página ficam no endereço. */
export function MinhasReservas() {
  const [parametros, setParametros] = useSearchParams();
  const situacao = esquemaSituacao.catch('ativas').parse(parametros.get('situacao'));
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1);
  const reservas = useMinhasReservas(situacao, pagina);

  return (
    <Stack gap="md">
      <Title order={2}>Minhas reservas</Title>
      <Tabs
        value={situacao}
        onChange={(valor) => valor && setParametros({ situacao: valor })}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="ativas">Ativas</Tabs.Tab>
          <Tabs.Tab value="encerradas">Encerradas</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={situacao} pt="md">
          <ListaDeReservas situacao={situacao} pagina={pagina} />
        </Tabs.Panel>
      </Tabs>
      {reservas.data && (reservas.data.total > reservas.data.porPagina || pagina > 1) && (
        <Pagination
          aria-label="Páginas"
          value={pagina}
          total={paginasDe(reservas.data.total, reservas.data.porPagina)}
          onChange={(nova) => setParametros({ situacao, pagina: String(nova) })}
        />
      )}
    </Stack>
  );
}
