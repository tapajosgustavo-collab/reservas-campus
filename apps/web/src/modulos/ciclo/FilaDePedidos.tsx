import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import type { ItemDaFila } from '@reservas/shared';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { useSessao } from '../conduta';
import { rotuloDoInstante, rotuloDoIntervalo } from '../reservas';
import { Erro, useAgoraEmDiaNaBorda } from './botao';
import {
  corDoPrazo,
  msAteMudarACor,
  podeConfirmarRecusa,
  resumoDoLote,
  rotuloDasPessoas,
  useAprovarPedidos,
  useFila,
  useRecusarPedido,
} from './pedidos';

/** Uma linha curta para os avisos: "Laboratório de Química, de Ana". */
const doPedido = ({ recurso, solicitante }: ItemDaFila) =>
  `${recurso.nome}, de ${solicitante.nome}`;

/** US11: o Gestor vê os Pedidos dos seus Recursos, aprova um ou vários e recusa com justificativa. */
export function FilaDePedidos() {
  const fila = useFila();
  const agora = useSessao().data?.agora;
  const aprovar = useAprovarPedidos();
  const recusar = useRecusarPedido();
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [recusando, setRecusando] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<Error | null>(null);
  const [enviandoLote, setEnviandoLote] = useState(false);

  const pedidos = fila.data ?? [];
  // Um Pedido que saiu da fila (decidido ou expirado) não fica selecionado.
  const escolhidos = pedidos.filter(({ id }) => selecionados.has(id));
  const ocupado = aprovar.isPending || recusar.isPending;
  useAgoraEmDiaNaBorda(
    agora
      ? msAteMudarACor(
          pedidos.map(({ expiraEm }) => expiraEm),
          agora,
        )
      : null,
  );

  function alternar(id: number, marcado: boolean) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  function aprovarNaLinha(item: ItemDaFila) {
    setAviso(null);
    setFalha(null);
    aprovar.mutate([item], {
      onSuccess: ([erro]) => {
        if (erro) setFalha(erro);
        else setAviso(`Pedido aprovado: ${doPedido(item)}.`);
      },
    });
  }

  function aprovarSelecionados() {
    setAviso(null);
    setFalha(null);
    setEnviandoLote(true);
    aprovar.mutate(escolhidos, {
      onSuccess: (resultados) => {
        setSelecionados(new Set());
        setAviso(`Aprovação em lote: ${resumoDoLote(resultados)}.`);
      },
      onSettled: () => setEnviandoLote(false),
    });
  }

  function abrirRecusa(id: number) {
    recusar.reset();
    setJustificativa('');
    setRecusando(id);
  }

  function confirmarRecusa(item: ItemDaFila) {
    if (!podeConfirmarRecusa(justificativa)) return;
    setAviso(null);
    setFalha(null);
    recusar.mutate(
      { id: item.id, justificativa },
      {
        onSuccess: () => {
          setRecusando(null);
          setAviso(`Pedido recusado: ${doPedido(item)}. Justificativa: ${justificativa.trim()}`);
        },
      },
    );
  }

  return (
    <Stack gap="md">
      <Title order={2}>Pedidos</Title>

      {aviso && (
        <Alert color="green" role="status" withCloseButton onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}
      {falha && <Erro erro={falha} />}

      {fila.isPending && <Loader aria-label="Carregando Pedidos" />}
      {fila.isError && (
        <Alert color="red" role="alert">
          {fila.error.message}
        </Alert>
      )}
      {fila.data?.length === 0 && (
        <Text c="dimmed">Nenhum Pedido aguarda decisão nos seus Recursos.</Text>
      )}

      {pedidos.length > 0 && (
        <>
          <Group>
            <Button
              disabled={escolhidos.length === 0 || ocupado}
              loading={enviandoLote}
              onClick={aprovarSelecionados}
            >
              Aprovar selecionados ({escolhidos.length})
            </Button>
          </Group>

          <Table.ScrollContainer minWidth={860} type="native">
            {/* Contém os VisuallyHidden (absolutos) no quadro que rola: sem isso, a página rola no celular. */}
            <Table striped pos="relative">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Checkbox
                      aria-label="Selecionar todos os Pedidos"
                      checked={escolhidos.length === pedidos.length}
                      indeterminate={escolhidos.length > 0 && escolhidos.length < pedidos.length}
                      disabled={ocupado}
                      onChange={(evento) =>
                        setSelecionados(
                          evento.currentTarget.checked
                            ? new Set(pedidos.map(({ id }) => id))
                            : new Set(),
                        )
                      }
                    />
                  </Table.Th>
                  <Table.Th>Início</Table.Th>
                  <Table.Th>Expira em</Table.Th>
                  <Table.Th>Recurso</Table.Th>
                  <Table.Th>Solicitante</Table.Th>
                  <Table.Th>Pessoas/Capacidade</Table.Th>
                  <Table.Th>Finalidade</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>Ações</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pedidos.map((item) => {
                  const cor = agora ? corDoPrazo(item.expiraEm, agora) : null;
                  return (
                    <Fragment key={item.id}>
                      <Table.Tr>
                        <Table.Td>
                          <Checkbox
                            aria-label={`Selecionar o Pedido de ${doPedido(item)}`}
                            checked={selecionados.has(item.id)}
                            disabled={ocupado}
                            onChange={(evento) => alternar(item.id, evento.currentTarget.checked)}
                          />
                        </Table.Td>
                        <Table.Td>{rotuloDoIntervalo(item.inicio, item.fim)}</Table.Td>
                        <Table.Td>
                          {cor ? (
                            <Badge variant="light" color={cor}>
                              {rotuloDoInstante(item.expiraEm)}
                            </Badge>
                          ) : (
                            rotuloDoInstante(item.expiraEm)
                          )}
                        </Table.Td>
                        <Table.Td>{item.recurso.nome}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{item.solicitante.nome}</Text>
                          <Text size="sm" c="dimmed">
                            {item.solicitante.perfil}
                          </Text>
                        </Table.Td>
                        <Table.Td>{rotuloDasPessoas(item)}</Table.Td>
                        <Table.Td>{item.finalidade ?? '—'}</Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Button
                              size="xs"
                              disabled={ocupado}
                              onClick={() => aprovarNaLinha(item)}
                            >
                              Aprovar
                              <VisuallyHidden> o Pedido de {doPedido(item)}</VisuallyHidden>
                            </Button>
                            <Button
                              size="xs"
                              variant="default"
                              disabled={ocupado}
                              onClick={() => abrirRecusa(item.id)}
                            >
                              Recusar
                              <VisuallyHidden> o Pedido de {doPedido(item)}</VisuallyHidden>
                            </Button>
                            <Anchor component={Link} to={`/reservas/${item.id}`} size="sm">
                              Detalhes
                              <VisuallyHidden> do Pedido de {doPedido(item)}</VisuallyHidden>
                            </Anchor>
                          </Group>
                        </Table.Td>
                      </Table.Tr>

                      {recusando === item.id && (
                        <Table.Tr>
                          <Table.Td colSpan={8}>
                            <Stack gap="xs">
                              <Textarea
                                label={`Justificativa da Recusa (${doPedido(item)})`}
                                description="Obrigatória: vai na Notificação ao Usuário (RN11)."
                                required
                                autosize
                                minRows={2}
                                maxLength={500}
                                value={justificativa}
                                onChange={(evento) => setJustificativa(evento.currentTarget.value)}
                              />
                              {recusar.isError && <Erro erro={recusar.error} />}
                              <Group justify="flex-end">
                                <Button
                                  variant="default"
                                  size="xs"
                                  disabled={recusar.isPending}
                                  onClick={() => setRecusando(null)}
                                >
                                  Voltar
                                </Button>
                                <Button
                                  color="red"
                                  size="xs"
                                  loading={recusar.isPending}
                                  disabled={!podeConfirmarRecusa(justificativa)}
                                  onClick={() => confirmarRecusa(item)}
                                >
                                  Confirmar Recusa
                                </Button>
                              </Group>
                            </Stack>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
