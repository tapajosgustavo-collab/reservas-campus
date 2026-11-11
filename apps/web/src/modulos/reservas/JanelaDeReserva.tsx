import {
  Alert,
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { datasDaSerie, POLITICA, type Reserva, type TipoRecurso } from '@reservas/shared';
import { useState, type FormEvent } from 'react';
import { ErroDaApi } from '../../comum/api';
import { opcoesDeMeiaHora } from '../../comum/minutos';
import { linhaDaViolacao } from '../../comum/violacoes';
import { useSessao } from '../conduta';
import {
  avisoDoPedido,
  corpoDaReserva,
  corpoDaSerie,
  diaEMes,
  linhaDaViolacaoNaSerie,
  resumoDaCriada,
  resumoDaSerie,
  tituloDasViolacoes,
} from './pedido';
import { useCriarReserva, useCriarSerie } from './reservas';

const OPCOES_DE_INICIO = opcoesDeMeiaHora(0, 24 * 60 - 30);
const OPCOES_DE_FIM = opcoesDeMeiaHora(30, 24 * 60);

/** O Recurso da janela. */
interface RecursoDaJanela {
  id: number;
  nome: string;
  tipo: TipoRecurso;
  capacidade: number | null;
  restrito: boolean;
  gestor: { nome: string };
}

/** O Intervalo que veio da agenda, em minutos desde 0h do dia em São Paulo. */
interface IntervaloInicial {
  data: string;
  inicio: number;
  fim: number;
}

/** O que a agenda destaca e conta depois de criar: a Reserva, ou a primeira Ocorrência da Série. */
export interface Criada {
  reserva: Reserva;
  resumo: string;
}

interface PropsDoFormulario {
  recurso: RecursoDaJanela;
  intervalo: IntervaloInicial;
  aoFechar: () => void;
  /** `data` é o dia da Reserva, `YYYY-MM-DD`: a agenda vai para a semana dele. */
  aoCriar: (criada: Criada, data: string) => void;
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
          <List.Item key={`${violacao.data ?? ''} ${violacao.rn} ${violacao.mensagem}`}>
            {linhaDaViolacaoNaSerie(violacao, linhaDaViolacao(violacao))}
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}

/** A tela não checa RN: quem recusa é a API, e o quadro mostra todas as regras de uma vez. */
function Formulario({ recurso, intervalo, aoFechar, aoCriar }: PropsDoFormulario) {
  const criarReserva = useCriarReserva();
  const criarSerie = useCriarSerie();
  const docente = useSessao().data?.usuario.perfil === 'Docente';
  const [repetir, setRepetir] = useState(false);
  const [ate, setAte] = useState('');
  const [desmarcadas, setDesmarcadas] = useState<string[]>([]);
  const [data, setData] = useState(intervalo.data);
  const [inicio, setInicio] = useState(intervalo.inicio);
  const [fim, setFim] = useState(intervalo.fim);
  const [participantes, setParticipantes] = useState<number | string>('');
  const [finalidade, setFinalidade] = useState('');
  const espaco = recurso.tipo === 'Espaco';
  const serie = docente && repetir;
  const criar = serie ? criarSerie : criarReserva;
  // RN21: a tela mostra as datas antes; quem recusa uma Série longa demais é a API.
  const datas = serie && data && ate ? datasDaSerie(data, ate, POLITICA.semanasMaximasDaSerie) : [];

  const violacoes = criar.error instanceof ErroDaApi ? criar.error.violacoes : [];
  const intervaloEmErro = violacoes.some(({ campo }) => campo === 'intervalo');
  const participantesEmErro = violacoes.some(({ campo }) => campo === 'participantes');

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const pessoas = typeof participantes === 'number' ? participantes : undefined;
    const formulario = { data, inicio, fim, participantes: pessoas, finalidade };
    if (serie) {
      // Só as desmarcadas que ainda são datas da Série: mudar a Data ou o Até não as arrasta.
      const excluidas = desmarcadas.filter((desmarcada) => datas.includes(desmarcada));
      criarSerie.mutate(corpoDaSerie(recurso.id, formulario, ate, excluidas), {
        onSuccess: ({ reservas }) =>
          aoCriar({ reserva: reservas[0]!, resumo: resumoDaSerie(reservas) }, data),
      });
      return;
    }
    criarReserva.mutate(corpoDaReserva(recurso.id, formulario), {
      onSuccess: (reserva) => aoCriar({ reserva, resumo: resumoDaCriada(reserva) }, data),
    });
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
        {docente && (
          <Switch
            label="Repetir toda semana (Série)"
            checked={repetir}
            onChange={(evento) => setRepetir(evento.currentTarget.checked)}
          />
        )}
        {serie && (
          <>
            <TextInput
              label="Até"
              description={`A Série cobre no máximo ${POLITICA.semanasMaximasDaSerie} semanas.`}
              type="date"
              required
              min={data}
              value={ate}
              onChange={(evento) => setAte(evento.currentTarget.value)}
              error={violacoes.some(({ campo }) => campo === 'ate')}
            />
            {datas.length > 0 && (
              <Checkbox.Group
                label="Datas da Série"
                description="Desmarque feriados e recessos: essas datas não viram Ocorrência."
                value={datas.filter((d) => !desmarcadas.includes(d))}
                onChange={(marcadas) => setDesmarcadas(datas.filter((d) => !marcadas.includes(d)))}
              >
                <SimpleGrid cols={{ base: 3, xs: 4 }} mt="xs" spacing="xs">
                  {datas.map((d) => (
                    <Checkbox key={d} value={d} label={diaEMes(d)} />
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            )}
          </>
        )}
        {recurso.restrito && (
          <Alert color="orange" variant="light">
            {avisoDoPedido(recurso.gestor.nome, { data, inicio })}
          </Alert>
        )}
        {criar.error && <Erro erro={criar.error} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending}>
            {serie ? 'Criar Série' : recurso.restrito ? 'Enviar pedido' : 'Reservar'}
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
    <Modal
      opened={intervalo !== null}
      onClose={props.aoFechar}
      title={props.recurso.restrito ? 'Novo Pedido' : 'Nova Reserva'}
    >
      {intervalo && <Formulario intervalo={intervalo} {...props} />}
    </Modal>
  );
}
