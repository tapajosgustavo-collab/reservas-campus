import {
  Alert,
  Button,
  Group,
  List,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { Reserva, TipoRecurso } from '@reservas/shared';
import { useState, type FormEvent } from 'react';
import { ErroDaApi } from '../../comum/api';
import { opcoesDeMeiaHora } from '../../comum/minutos';
import { corpoDaReserva, linhaDaViolacao, tituloDasViolacoes } from './pedido';
import { useCriarReserva } from './reservas';

const OPCOES_DE_INICIO = opcoesDeMeiaHora(0, 24 * 60 - 30);
const OPCOES_DE_FIM = opcoesDeMeiaHora(30, 24 * 60);

/** O Recurso da janela. */
interface RecursoDaJanela {
  id: number;
  nome: string;
  tipo: TipoRecurso;
  capacidade: number | null;
}

/** O Intervalo que veio da agenda, em minutos desde 0h do dia em São Paulo. */
interface IntervaloInicial {
  data: string;
  inicio: number;
  fim: number;
}

interface PropsDoFormulario {
  recurso: RecursoDaJanela;
  intervalo: IntervaloInicial;
  aoFechar: () => void;
  /** `data` é o dia da Reserva, `YYYY-MM-DD`: a agenda vai para a semana dele. */
  aoCriar: (reserva: Reserva, data: string) => void;
}

function Erro({ erro }: { erro: Error }) {
  const violacoes = erro instanceof ErroDaApi ? erro.violacoes : [];
  if (violacoes.length === 0) {
    return (
      <Alert color="red" role="alert">
        {erro.message}
      </Alert>
    );
  }
  return (
    <Alert color="red" role="alert" title={tituloDasViolacoes(violacoes.length)}>
      <List size="sm">
        {violacoes.map((violacao) => (
          <List.Item key={violacao.rn}>{linhaDaViolacao(violacao)}</List.Item>
        ))}
      </List>
    </Alert>
  );
}

/** A tela não checa RN: quem recusa é a API, e o quadro mostra todas as regras de uma vez. */
function Formulario({ recurso, intervalo, aoFechar, aoCriar }: PropsDoFormulario) {
  const criar = useCriarReserva();
  const [data, setData] = useState(intervalo.data);
  const [inicio, setInicio] = useState(intervalo.inicio);
  const [fim, setFim] = useState(intervalo.fim);
  const [participantes, setParticipantes] = useState<number | string>('');
  const [finalidade, setFinalidade] = useState('');
  const espaco = recurso.tipo === 'Espaco';

  const violacoes = criar.error instanceof ErroDaApi ? criar.error.violacoes : [];
  const intervaloEmErro = violacoes.some(({ campo }) => campo === 'intervalo');
  const participantesEmErro = violacoes.some(({ campo }) => campo === 'participantes');

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const pessoas = typeof participantes === 'number' ? participantes : undefined;
    criar.mutate(
      corpoDaReserva(recurso.id, { data, inicio, fim, participantes: pessoas, finalidade }),
      { onSuccess: (reserva) => aoCriar(reserva, data) },
    );
  }

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Text fw={500}>{recurso.nome}</Text>
        <TextInput
          label="Data"
          type="date"
          required
          value={data}
          onChange={(evento) => setData(evento.currentTarget.value)}
        />
        <Group grow>
          <Select
            label="Início"
            data={OPCOES_DE_INICIO}
            value={String(inicio)}
            onChange={(valor) => valor && setInicio(Number(valor))}
            allowDeselect={false}
            error={intervaloEmErro}
          />
          <Select
            label="Fim"
            data={OPCOES_DE_FIM}
            value={String(fim)}
            onChange={(valor) => valor && setFim(Number(valor))}
            allowDeselect={false}
            error={intervaloEmErro}
          />
        </Group>
        {espaco && (
          <NumberInput
            label="Participantes"
            required
            description={`Capacidade: ${recurso.capacidade} pessoas`}
            min={1}
            allowDecimal={false}
            value={participantes}
            onChange={setParticipantes}
            error={participantesEmErro}
          />
        )}
        <Textarea
          label="Finalidade"
          description="Opcional, até 200 caracteres. Só você e o Gestor do Recurso veem."
          maxLength={200}
          autosize
          minRows={2}
          value={finalidade}
          onChange={(evento) => setFinalidade(evento.currentTarget.value)}
        />
        {criar.error && <Erro erro={criar.error} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending}>
            Reservar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** US08: a criação de Reserva numa janela sobre a agenda, com o Intervalo escolhido na grade. */
export function JanelaDeReserva({
  intervalo,
  ...props
}: Omit<PropsDoFormulario, 'intervalo'> & { intervalo: IntervaloInicial | null }) {
  return (
    <Modal opened={intervalo !== null} onClose={props.aoFechar} title="Nova Reserva">
      {intervalo && <Formulario intervalo={intervalo} {...props} />}
    </Modal>
  );
}
