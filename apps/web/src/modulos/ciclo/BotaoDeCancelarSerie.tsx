import { Alert, Button, Group, Modal, Select, Stack, Text, VisuallyHidden } from '@mantine/core';
import { POLITICA, type Reserva } from '@reservas/shared';
import { useState } from 'react';
import { rotuloDoIntervalo } from '../reservas';
import { Erro, useAgoraEmDiaNaBorda } from './botao';
import {
  cancelarSerieGeraPenalidade,
  dataDaOcorrencia,
  msAteInicio,
  ocorrenciasCancelaveisDaSerie,
  useCancelarSerie,
} from './cancelamento';

interface Props {
  serieId: number;
  ocorrencias: Pick<Reserva, 'id' | 'status' | 'inicio' | 'fim'>[];
  /** O `agora` da API (da sessão), não o do navegador. */
  agora: string;
  nomeDoRecurso: string;
  /** Quando vem de uma Ocorrência específica, já abre com a data dela selecionada. */
  dataInicial?: string;
  rotulo?: string;
}

/**
 * US09, US13, RN16 e RN21: o Docente cancela as Ocorrências da Série a partir de uma data, com
 * confirmação e aviso de Cancelamento tardio quando a primeira Ocorrência selecionada está a menos
 * de 2h do início.
 */
export function BotaoDeCancelarSerie({
  serieId,
  ocorrencias,
  agora,
  nomeDoRecurso,
  dataInicial,
  rotulo = 'Cancelar a partir de…',
}: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useCancelarSerie();
  const cancelaveis = ocorrenciasCancelaveisDaSerie(ocorrencias, agora);
  const primeira = cancelaveis[0];
  useAgoraEmDiaNaBorda(primeira ? msAteInicio(primeira, agora) : null);

  const padrao =
    dataInicial && cancelaveis.some((o) => dataDaOcorrencia(o) === dataInicial)
      ? dataInicial
      : primeira
        ? dataDaOcorrencia(primeira)
        : '';
  const [aPartirDe, setAPartirDe] = useState(padrao);

  if (cancelaveis.length === 0 && !cancelar.isError) return null;

  const dataEscolhida =
    aPartirDe && cancelaveis.some((o) => dataDaOcorrencia(o) === aPartirDe) ? aPartirDe : padrao;
  const selecionadas = cancelaveis.filter((o) => dataDaOcorrencia(o) >= dataEscolhida);
  const opcoes = cancelaveis.map((ocorrencia) => ({
    value: dataDaOcorrencia(ocorrencia),
    label: rotuloDoIntervalo(ocorrencia.inicio, ocorrencia.fim),
  }));

  function abrir() {
    setAPartirDe(padrao);
    setConfirmando(true);
  }

  function confirmar() {
    if (!dataEscolhida) return;
    cancelar.mutate(
      { serieId, aPartirDe: dataEscolhida },
      {
        onSettled: () => setConfirmando(false),
      },
    );
  }

  return (
    <Stack gap={4} align="flex-start">
      {cancelaveis.length > 0 && (
        <Button size="xs" variant="default" onClick={abrir}>
          {rotulo}
          <VisuallyHidden> na Série de {nomeDoRecurso}</VisuallyHidden>
        </Button>
      )}
      {cancelar.isError && <Erro erro={cancelar.error} />}
      <Modal
        opened={confirmando}
        onClose={() => !cancelar.isPending && setConfirmando(false)}
        closeOnClickOutside={!cancelar.isPending}
        closeOnEscape={!cancelar.isPending}
        withCloseButton={!cancelar.isPending}
        title="Cancelar Série a partir de uma data"
      >
        <Stack gap="md">
          <Select
            label="Cancelar a partir de"
            data={opcoes}
            value={dataEscolhida}
            onChange={(valor) => valor && setAPartirDe(valor)}
            allowDeselect={false}
          />
          <Text size="sm">
            {selecionadas.length === 1
              ? '1 Ocorrência desta página será cancelada'
              : `${selecionadas.length} Ocorrências desta página serão canceladas`}{' '}
            em <strong>{nomeDoRecurso}</strong> (e quaisquer Ocorrências futuras da Série nas
            páginas seguintes).
          </Text>
          {dataEscolhida && cancelarSerieGeraPenalidade(cancelaveis, dataEscolhida, agora) && (
            <Alert color="yellow" variant="light">
              Faltam menos de {POLITICA.cancelamentoSemPenalidadeMin / 60}h para o início de uma
              Ocorrência Confirmada: cancelar agora é Cancelamento tardio e gera Penalidade (RN16).
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={cancelar.isPending}
              onClick={() => setConfirmando(false)}
            >
              Voltar
            </Button>
            <Button color="red" loading={cancelar.isPending} onClick={confirmar}>
              Confirmar cancelamento da Série
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
