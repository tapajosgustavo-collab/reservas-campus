import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import type { Agenda, Reserva } from '@reservas/shared';
import { addDays, format, parseISO } from 'date-fns';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSessao } from '../conduta';
import { JanelaDeReserva, reservaCobre, resumoDaCriada, semanaDe } from '../reservas';
import { periodoDaIndisponibilidade } from './indisponibilidade';
import { ROTULO_DO_TIPO } from './FormularioDoRecurso';
import {
  diasDaGrade,
  estadoDaCelula,
  intervaloDoArraste,
  intervaloDoClique,
  linhasDaGrade,
  semanaVizinha,
  type DiaDaGrade,
  type EstadoDaCelula,
  type IntervaloEscolhido,
} from './grade';
import { DIAS_DA_SEMANA, rotuloDoMinuto } from './horario';
import { useAgenda, useRecarregarAgenda } from './recursos';

const ROTULO_DO_ESTADO: Record<EstadoDaCelula, string> = {
  livre: 'Livre',
  ocupado: 'Ocupado',
  'minha-confirmada': 'Sua reserva (Confirmada)',
  'minha-pendente': 'Sua reserva (Pendente)',
  indisponivel: 'Indisponível',
  fechado: 'Fechado',
  passado: 'Passado',
};

const LISTRAS = 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,.08) 4px 8px)';

const ESTILO_DO_ESTADO: Record<EstadoDaCelula, CSSProperties> = {
  livre: { background: 'var(--mantine-color-white)' },
  ocupado: { background: 'var(--mantine-color-gray-5)' },
  'minha-confirmada': { background: 'var(--mantine-color-blue-7)' },
  'minha-pendente': {
    background: 'var(--mantine-color-blue-1)',
    boxShadow: 'inset 0 0 0 2px var(--mantine-color-blue-7)',
  },
  indisponivel: { background: `${LISTRAS}, var(--mantine-color-orange-2)` },
  fechado: { background: `${LISTRAS}, var(--mantine-color-gray-1)` },
  passado: { background: 'var(--mantine-color-gray-2)' },
};

const ESTILO_ESCOLHIDO: CSSProperties = { background: 'var(--mantine-color-green-2)' };

/** A Reserva recém-criada, em cima do estilo de "Sua reserva". */
const ESTILO_DESTACADO: CSSProperties = {
  boxShadow: 'inset 0 0 0 3px var(--mantine-color-green-5)',
};

/** `2026-11-10` → `10/11`. */
function diaEMes(data: string) {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function rotuloDoDia({ data, diaSemana }: DiaDaGrade) {
  return `${DIAS_DA_SEMANA[diaSemana]} ${diaEMes(data)}`;
}

function Legenda() {
  return (
    <Group gap="md" component="ul" aria-label="Legenda" style={{ listStyle: 'none', padding: 0 }}>
      {(Object.keys(ROTULO_DO_ESTADO) as EstadoDaCelula[]).map((estado) => (
        <Group key={estado} gap={6} component="li" wrap="nowrap">
          <Box
            w={18}
            h={18}
            style={{ ...ESTILO_DO_ESTADO[estado], border: '1px solid var(--mantine-color-gray-4)' }}
          />
          <Text size="sm">{ROTULO_DO_ESTADO[estado]}</Text>
        </Group>
      ))}
    </Group>
  );
}

function Cabecalho({ recurso }: { recurso: Agenda['recurso'] }) {
  const detalhes = [
    ROTULO_DO_TIPO[recurso.tipo],
    recurso.local,
    recurso.tipo === 'Espaco' ? `Capacidade: ${recurso.capacidade} pessoas` : null,
    recurso.patrimonio && `Patrimônio ${recurso.patrimonio}`,
  ].filter(Boolean);
  return (
    <Stack gap={4}>
      <Title order={2}>{recurso.nome}</Title>
      <Text c="dimmed">{detalhes.join(' · ')}</Text>
    </Stack>
  );
}

function JanelaDoGestor({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  return (
    <Modal opened={aberta} onClose={aoFechar} title="Gestor não cria Reservas">
      <Stack gap="sm">
        <Text>
          Gestor não faz Reservas. Para impedir o uso de um Recurso num período, cadastre uma
          Indisponibilidade.
        </Text>
        <Group justify="flex-end">
          <Button onClick={aoFechar}>Fechar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface Arraste {
  dia: DiaDaGrade;
  de: number;
  ate: number;
}

function Grade({
  agenda,
  destacada,
  aoEscolher,
}: {
  agenda: Agenda;
  destacada: Reserva | null;
  aoEscolher: (intervalo: IntervaloEscolhido) => void;
}) {
  // O ref é o que vale no soltar: um arraste rápido termina antes de a tela renderizar de novo.
  const arrasteAtual = useRef<Arraste | null>(null);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const agora = new Date(agenda.agora);
  const dias = diasDaGrade(agenda.semana, agenda.recurso.horarios);
  const linhas = linhasDaGrade(dias);

  function mudarArraste(novo: Arraste | null) {
    arrasteAtual.current = novo;
    setArraste(novo);
  }

  // Arrastar só com mouse ou caneta: no toque, o dedo rola a grade e o toque é um clique.
  function aoApertar(evento: PointerEvent, dia: DiaDaGrade, minuto: number) {
    if (evento.pointerType === 'touch' || evento.button !== 0) return;
    evento.preventDefault();
    mudarArraste({ dia, de: minuto, ate: minuto });
    // Soltar em qualquer lugar termina o arraste; numa célula só, quem trata é o clique. Se o
    // navegador cancelar o ponteiro (menu de contexto, troca de janela), o arraste é descartado.
    const fimDoArraste = new AbortController();
    window.addEventListener(
      'pointerup',
      () => {
        fimDoArraste.abort();
        const fim = arrasteAtual.current;
        mudarArraste(null);
        if (fim && fim.de !== fim.ate) {
          aoEscolher(intervaloDoArraste(fim.dia, fim.de, fim.ate, agenda.indisponibilidades));
        }
      },
      { signal: fimDoArraste.signal },
    );
    window.addEventListener(
      'pointercancel',
      () => {
        fimDoArraste.abort();
        mudarArraste(null);
      },
      { signal: fimDoArraste.signal },
    );
  }

  function aoPassar(dia: DiaDaGrade, minuto: number) {
    const atual = arrasteAtual.current;
    if (atual?.dia.data === dia.data) mudarArraste({ ...atual, ate: minuto });
  }

  function escolhida(dia: DiaDaGrade, minuto: number) {
    if (arraste?.dia.data !== dia.data) return false;
    return (
      minuto >= Math.min(arraste.de, arraste.ate) && minuto <= Math.max(arraste.de, arraste.ate)
    );
  }

  if (dias.length === 0) {
    return <Text c="dimmed">O Recurso não abre em nenhum dia da semana.</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={72 + dias.length * 104} type="native">
      <Table withTableBorder withColumnBorders style={{ userSelect: 'none' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={72}>Horário</Table.Th>
            {dias.map((dia) => (
              <Table.Th key={dia.data} ta="center">
                {rotuloDoDia(dia)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {linhas.map((minuto) => (
            <Table.Tr key={minuto}>
              <Table.Th scope="row" fw="normal" fz="sm" py={2}>
                {rotuloDoMinuto(minuto)}
              </Table.Th>
              {dias.map((dia) => {
                const estado = estadoDaCelula(
                  dia,
                  minuto,
                  agenda.ocupacoes,
                  agora,
                  agenda.indisponibilidades,
                );
                const rotulo = `${rotuloDoDia(dia)}, ${rotuloDoMinuto(minuto)}: ${ROTULO_DO_ESTADO[estado]}`;
                return (
                  <Table.Td
                    key={dia.data}
                    p={0}
                    // Contém o VisuallyHidden (absoluto) no quadro que rola: sem isso, a página rola no celular.
                    pos="relative"
                    h={28}
                    style={{
                      ...(escolhida(dia, minuto) ? ESTILO_ESCOLHIDO : ESTILO_DO_ESTADO[estado]),
                      ...(destacada &&
                        reservaCobre(destacada, dia.data, minuto) &&
                        ESTILO_DESTACADO),
                    }}
                  >
                    {estado === 'livre' ? (
                      <UnstyledButton
                        w="100%"
                        h="100%"
                        display="block"
                        aria-label={rotulo}
                        onPointerDown={(evento) => aoApertar(evento, dia, minuto)}
                        onPointerEnter={() => aoPassar(dia, minuto)}
                        onClick={() =>
                          aoEscolher(
                            intervaloDoClique(
                              dia,
                              minuto,
                              agenda.ocupacoes,
                              agora,
                              agenda.indisponibilidades,
                            ),
                          )
                        }
                      />
                    ) : (
                      <VisuallyHidden>{rotulo}</VisuallyHidden>
                    )}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** US07: a semana do Recurso em meia hora, sem dizer quem reservou (RN22). */
export function AgendaDoRecurso() {
  const id = Number(useParams().id);
  const [parametros, setParametros] = useSearchParams();
  const agenda = useAgenda(id, parametros.get('semana'));
  const usuario = useSessao().data?.usuario;
  const ehGestor = usuario?.perfil === 'Gestor';
  const [intervalo, setIntervalo] = useState<IntervaloEscolhido | null>(null);
  const [criada, setCriada] = useState<Reserva | null>(null);
  const recarregarAgenda = useRecarregarAgenda(id);

  function irPara(semana: string | null) {
    setParametros(semana ? { semana } : {});
  }

  function aoCriar(reserva: Reserva, data: string) {
    setIntervalo(null);
    setCriada(reserva);
    void recarregarAgenda();
    irPara(semanaDe(data));
  }

  if (agenda.isPending) return <Loader aria-label="Carregando agenda" />;
  if (agenda.isError) {
    return (
      <Alert color="red" role="alert">
        {agenda.error.message}
      </Alert>
    );
  }

  const { semana, recurso, indisponibilidades } = agenda.data;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Cabecalho recurso={recurso} />
        {usuario?.id === recurso.gestor.id && (
          <Button
            component={Link}
            to={`/gestao/recursos/${recurso.id}/indisponibilidade`}
            variant="default"
          >
            Cadastrar Indisponibilidade
          </Button>
        )}
      </Group>

      {indisponibilidades.map((indisponibilidade) => (
        <Alert
          // Duas podem começar no mesmo instante, e a API não manda o id.
          key={`${indisponibilidade.inicio} ${indisponibilidade.fim} ${indisponibilidade.motivo}`}
          color="orange"
        >
          {periodoDaIndisponibilidade(indisponibilidade, semana)}
        </Alert>
      ))}

      <Group justify="space-between" gap="xs">
        <Text fw={500}>
          Semana de {diaEMes(semana)} a {format(addDays(parseISO(semana), 6), 'dd/MM')}
        </Text>
        <Group gap="xs">
          <Button variant="default" size="xs" onClick={() => irPara(semanaVizinha(semana, -1))}>
            ← Anterior
          </Button>
          <Button variant="default" size="xs" onClick={() => irPara(null)}>
            Esta semana
          </Button>
          <Button variant="default" size="xs" onClick={() => irPara(semanaVizinha(semana, 1))}>
            Seguinte →
          </Button>
        </Group>
      </Group>

      {criada && (
        <Alert color="green" role="status" withCloseButton onClose={() => setCriada(null)}>
          {resumoDaCriada(criada)}
        </Alert>
      )}

      <Legenda />
      <Grade agenda={agenda.data} destacada={criada} aoEscolher={setIntervalo} />
      {ehGestor ? (
        <JanelaDoGestor aberta={intervalo !== null} aoFechar={() => setIntervalo(null)} />
      ) : (
        <JanelaDeReserva
          intervalo={intervalo}
          recurso={recurso}
          aoFechar={() => setIntervalo(null)}
          aoCriar={aoCriar}
        />
      )}
    </Stack>
  );
}
