import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { opcoesDeMeiaHora } from '../../comum/minutos';
import { corpoDaIndisponibilidade, resumoDaIndisponibilidade } from './indisponibilidade';
import { useCriarIndisponibilidade, useRecurso } from './recursos';

const OPCOES = opcoesDeMeiaHora(0, 24 * 60 - 30);

/**
 * US05: o Gestor responsável marca o Recurso como indisponível. Sem prévia: a confirmação avisa
 * que as Reservas no período serão canceladas, e a resposta diz quantas foram (RN04).
 */
export function CadastroDeIndisponibilidade() {
  const id = Number(useParams().id);
  const recurso = useRecurso(id);
  const criar = useCriarIndisponibilidade(id);
  const [dataInicio, setDataInicio] = useState('');
  const [inicio, setInicio] = useState(8 * 60);
  const [dataFim, setDataFim] = useState('');
  const [fim, setFim] = useState(18 * 60);
  const [semFim, setSemFim] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  function pedirConfirmacao(evento: FormEvent) {
    evento.preventDefault();
    criar.reset();
    setConfirmando(true);
  }

  function confirmar() {
    setConfirmando(false);
    criar.mutate(corpoDaIndisponibilidade({ dataInicio, inicio, dataFim, fim, semFim, motivo }));
  }

  return (
    <Stack gap="md" maw={560}>
      <Anchor component={Link} to="/gestao/recursos" size="sm">
        ← Meus recursos
      </Anchor>
      <Title order={2}>Cadastrar Indisponibilidade{recurso.data && `: ${recurso.data.nome}`}</Title>
      {recurso.isPending && <Loader aria-label="Carregando Recurso" />}

      {criar.data ? (
        <Alert color="green" role="status">
          <Stack gap="xs">
            <Text size="sm">{resumoDaIndisponibilidade(criar.data.reservasCanceladas)}</Text>
            <Anchor component={Link} to={`/recursos/${id}/agenda`} size="sm">
              Ver a agenda
            </Anchor>
          </Stack>
        </Alert>
      ) : (
        <form onSubmit={pedirConfirmacao}>
          <Stack gap="sm">
            <Group grow align="flex-start">
              <TextInput
                label="Data de início"
                type="date"
                required
                value={dataInicio}
                onChange={(evento) => setDataInicio(evento.currentTarget.value)}
              />
              <Select
                label="Hora de início"
                data={OPCOES}
                value={String(inicio)}
                onChange={(valor) => valor && setInicio(Number(valor))}
                allowDeselect={false}
              />
            </Group>
            <Checkbox
              label="Sem previsão de volta (tirar o Recurso de uso)"
              checked={semFim}
              onChange={(evento) => setSemFim(evento.currentTarget.checked)}
            />
            {!semFim && (
              <Group grow align="flex-start">
                <TextInput
                  label="Data de fim"
                  type="date"
                  required
                  value={dataFim}
                  onChange={(evento) => setDataFim(evento.currentTarget.value)}
                />
                <Select
                  label="Hora de fim"
                  data={OPCOES}
                  value={String(fim)}
                  onChange={(valor) => valor && setFim(Number(valor))}
                  allowDeselect={false}
                />
              </Group>
            )}
            <Textarea
              label="Motivo"
              description="Público: aparece na agenda e vai para quem tiver a Reserva cancelada."
              required
              maxLength={200}
              autosize
              minRows={2}
              value={motivo}
              onChange={(evento) => setMotivo(evento.currentTarget.value)}
            />
            {criar.error && (
              <Alert color="red" role="alert">
                {criar.error.message}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button type="submit" loading={criar.isPending}>
                Cadastrar
              </Button>
            </Group>
          </Stack>
        </form>
      )}

      <Modal
        opened={confirmando}
        onClose={() => setConfirmando(false)}
        title="Confirmar Indisponibilidade"
      >
        <Stack gap="sm">
          <Text>
            As Reservas Pendentes e Confirmadas no período serão canceladas, sem Penalidade. As
            Reservas Em uso continuam. Não é possível editar nem excluir a Indisponibilidade depois.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
            <Button color="red" onClick={confirmar}>
              Confirmar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
