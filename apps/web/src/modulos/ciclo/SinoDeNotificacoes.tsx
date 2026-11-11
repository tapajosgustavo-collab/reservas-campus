import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { NOTIFICACOES_POR_PAGINA } from '@reservas/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { rotuloDoInstante } from '../reservas';
import {
  avisoDeNovasNotificacoes,
  rotuloDoSino,
  useMarcarNotificacaoLida,
  useMarcarTodasNotificacoesLidas,
  useNotificacoes,
} from './notificacoes';

/**
 * US16: sino no cabeçalho com o número de não lidas, polling de 30 s com a aba visível, leitura
 * individual ou de todas e aviso quando chega uma nova Notificação.
 */
export function SinoDeNotificacoes({ aoChegarNova }: { aoChegarNova: (mensagem: string) => void }) {
  const [aberta, setAberta] = useState(false);
  const [pagina, setPagina] = useState(1);
  const primeiraPagina = useNotificacoes(1);
  const paginaAtual = useNotificacoes(pagina, { polling: false, enabled: aberta && pagina > 1 });
  const marcarUma = useMarcarNotificacaoLida();
  const marcarTodas = useMarcarTodasNotificacoesLidas();
  const vistasRef = useRef<Set<number> | null>(null);

  const itensDaPrimeira = primeiraPagina.data?.itens;
  useEffect(() => {
    if (!itensDaPrimeira) return;
    const resultado = avisoDeNovasNotificacoes(vistasRef.current, itensDaPrimeira);
    vistasRef.current = resultado.vistas;
    if (resultado.aviso) {
      aoChegarNova(resultado.aviso);
    }
  }, [itensDaPrimeira, aoChegarNova]);

  const naoLidas = primeiraPagina.data?.naoLidas ?? 0;
  const dados = pagina === 1 ? primeiraPagina.data : paginaAtual.data;
  const carregando = pagina === 1 ? primeiraPagina.isPending : paginaAtual.isPending;
  const erro = pagina === 1 ? primeiraPagina.error : paginaAtual.error;

  return (
    <>
      <Button
        variant="default"
        size="xs"
        px="xs"
        aria-label={rotuloDoSino(naoLidas)}
        onClick={() => setAberta(true)}
      >
        <span aria-hidden="true">🔔</span>
        {naoLidas > 0 && (
          <Badge size="xs" color="red" variant="filled" ml={4}>
            {naoLidas}
          </Badge>
        )}
      </Button>

      <Modal opened={aberta} onClose={() => setAberta(false)} title="Notificações">
        <Stack gap="sm">
          {naoLidas > 0 && (
            <Group justify="flex-end">
              <Button
                variant="light"
                size="xs"
                loading={marcarTodas.isPending}
                onClick={() => marcarTodas.mutate()}
              >
                Marcar todas como lidas
              </Button>
            </Group>
          )}

          {(marcarUma.error || marcarTodas.error) && (
            <Alert color="red" role="alert">
              {(marcarUma.error ?? marcarTodas.error)?.message}
            </Alert>
          )}

          {carregando && <Loader aria-label="Carregando Notificações" />}
          {erro && (
            <Alert color="red" role="alert">
              {erro.message}
            </Alert>
          )}
          {dados && dados.itens.length === 0 && (
            <Text c="dimmed" size="sm">
              Você não tem Notificações.
            </Text>
          )}

          {dados &&
            dados.itens.map((item) => {
              const naoLida = item.lidaEm === null;
              return (
                <Paper key={item.id} withBorder p="xs">
                  <Stack gap={4}>
                    <Group justify="space-between" gap="xs">
                      <Text size="xs" c="dimmed">
                        {rotuloDoInstante(item.em)}
                      </Text>
                      {naoLida && (
                        <Badge size="xs" color="blue" variant="light">
                          Não lida
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" fw={naoLida ? 600 : 400}>
                      {item.mensagem}
                    </Text>
                    <Group justify="space-between" gap="xs">
                      {item.reservaId !== null ? (
                        <Anchor
                          component={Link}
                          to={`/reservas/${item.reservaId}`}
                          size="xs"
                          onClick={() => setAberta(false)}
                        >
                          Ver Reserva
                        </Anchor>
                      ) : (
                        <span />
                      )}
                      {naoLida && (
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          loading={marcarUma.isPending && marcarUma.variables === item.id}
                          onClick={() => marcarUma.mutate(item.id)}
                        >
                          Marcar como lida
                        </Button>
                      )}
                    </Group>
                  </Stack>
                </Paper>
              );
            })}

          {dados && dados.total > NOTIFICACOES_POR_PAGINA && (
            <Pagination
              aria-label="Páginas de Notificações"
              value={pagina}
              total={Math.ceil(dados.total / NOTIFICACOES_POR_PAGINA)}
              onChange={setPagina}
              size="sm"
            />
          )}
        </Stack>
      </Modal>
    </>
  );
}
