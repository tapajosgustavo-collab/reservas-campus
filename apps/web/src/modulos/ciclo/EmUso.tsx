import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import type { ItemEmUso } from '@reservas/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { rotuloDoIntervalo } from '../reservas';
import { Erro } from './botao';
import {
  corpoDaDevolucao,
  podeConfirmarDevolucao,
  useEmUso,
  useRegistrarDevolucao,
} from './devolucao';

/** US14: o Gestor vê os seus Equipamentos Em uso e registra a Devolução (RN13, RN17). */
export function EmUso() {
  const emUso = useEmUso();
  const registrar = useRegistrarDevolucao();
  const [selecionada, setSelecionada] = useState<ItemEmUso | null>(null);
  const [observacao, setObservacao] = useState('');
  const [extraviado, setExtraviado] = useState(false);
  const [perdidoRecente, setPerdidoRecente] = useState<ItemEmUso['recurso'] | null>(null);

  function abrirModal(item: ItemEmUso) {
    registrar.reset();
    setObservacao('');
    setExtraviado(false);
    setSelecionada(item);
  }

  function fecharModal() {
    if (registrar.isPending) return;
    setSelecionada(null);
  }

  function confirmar() {
    if (!selecionada || !podeConfirmarDevolucao({ observacao, extraviado })) return;
    const recurso = selecionada.recurso;
    const foiExtraviado = extraviado;
    registrar.mutate(
      { id: selecionada.id, devolucao: corpoDaDevolucao({ observacao, extraviado }) },
      {
        onSuccess: () => {
          setSelecionada(null);
          setPerdidoRecente(foiExtraviado ? recurso : null);
        },
      },
    );
  }

  return (
    <Stack gap="md">
      <Title order={2}>Em uso</Title>

      {perdidoRecente && (
        <Alert
          color="yellow"
          role="status"
          title="Devolução registrada com perda ou roubo"
          withCloseButton
          onClose={() => setPerdidoRecente(null)}
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              A Reserva de <strong>{perdidoRecente.nome}</strong> (Patrimônio{' '}
              {perdidoRecente.patrimonio}) foi encerrada. Tire o Equipamento de uso criando uma
              Indisponibilidade sem fim.
            </Text>
            <Button
              component={Link}
              to={`/gestao/recursos/${perdidoRecente.id}/indisponibilidade`}
              size="xs"
              variant="default"
            >
              Criar Indisponibilidade sem fim
            </Button>
          </Stack>
        </Alert>
      )}

      {emUso.isPending && <Loader aria-label="Carregando Equipamentos em uso" />}
      {emUso.isError && (
        <Alert color="red" role="alert">
          {emUso.error.message}
        </Alert>
      )}
      {emUso.data?.length === 0 && (
        <Text c="dimmed">Nenhum Equipamento está em uso no momento.</Text>
      )}
      {emUso.data && emUso.data.length > 0 && (
        <Table.ScrollContainer minWidth={520} type="native">
          {/* Contém os VisuallyHidden (absolutos) no quadro que rola: sem isso, a página rola no celular. */}
          <Table striped pos="relative">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Equipamento</Table.Th>
                <Table.Th>Usuário</Table.Th>
                <Table.Th>Intervalo</Table.Th>
                <Table.Th>Situação</Table.Th>
                <Table.Th>
                  <VisuallyHidden>Ações</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {emUso.data.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {item.recurso.nome}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Patrimônio {item.recurso.patrimonio}
                    </Text>
                  </Table.Td>
                  <Table.Td>{item.usuario.nome}</Table.Td>
                  <Table.Td>{rotuloDoIntervalo(item.inicio, item.fim)}</Table.Td>
                  <Table.Td>
                    {item.devolucaoAtrasada ? (
                      <Badge variant="light" color="red">
                        Devolução atrasada
                      </Badge>
                    ) : (
                      'Em uso'
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button size="xs" onClick={() => abrirModal(item)}>
                        Registrar Devolução
                        <VisuallyHidden>
                          {' '}
                          de {item.recurso.nome} ({item.recurso.patrimonio})
                        </VisuallyHidden>
                      </Button>
                      <Anchor component={Link} to={`/reservas/${item.id}`}>
                        Detalhes
                        <VisuallyHidden> da Reserva de {item.recurso.nome}</VisuallyHidden>
                      </Anchor>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal
        opened={selecionada !== null}
        onClose={fecharModal}
        closeOnClickOutside={!registrar.isPending}
        closeOnEscape={!registrar.isPending}
        withCloseButton={!registrar.isPending}
        title="Registrar Devolução"
      >
        {selecionada && (
          <Stack gap="md">
            <Text size="sm">
              Equipamento: <strong>{selecionada.recurso.nome}</strong> (Patrimônio{' '}
              {selecionada.recurso.patrimonio}), retirado por{' '}
              <strong>{selecionada.usuario.nome}</strong> (
              {rotuloDoIntervalo(selecionada.inicio, selecionada.fim)}).
            </Text>

            <Checkbox
              label="Equipamento perdido ou roubado"
              checked={extraviado}
              onChange={(evento) => setExtraviado(evento.currentTarget.checked)}
            />

            <Textarea
              label={extraviado ? 'Observação (obrigatória)' : 'Observação (opcional)'}
              description={
                extraviado
                  ? 'Explique a perda ou o roubo. Depois de registrar a Devolução, crie uma Indisponibilidade sem fim no Equipamento.'
                  : undefined
              }
              required={extraviado}
              maxLength={200}
              value={observacao}
              onChange={(evento) => setObservacao(evento.currentTarget.value)}
            />

            {registrar.isError && <Erro erro={registrar.error} />}

            <Group justify="flex-end">
              <Button variant="default" disabled={registrar.isPending} onClick={fecharModal}>
                Voltar
              </Button>
              <Button
                loading={registrar.isPending}
                disabled={!podeConfirmarDevolucao({ observacao, extraviado })}
                onClick={confirmar}
              >
                Confirmar Devolução
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
