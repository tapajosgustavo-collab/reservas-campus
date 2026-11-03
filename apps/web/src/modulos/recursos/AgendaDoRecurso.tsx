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
import type { Agenda } from '@reservas/shared';
import { addDays, format, parseISO } from 'date-fns';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useSessao } from '../conduta';
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
import { useAgenda } from './recursos';

const ROTULO_DO_ESTADO: Record<EstadoDaCelula, string> = {
  livre: 'Livre',
  ocupado: 'Ocupado',
  'minha-confirmada': 'Sua reserva (Confirmada)',
  'minha-pendente': 'Sua reserva (Pendente)',
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
  fechado: { background: `${LISTRAS}, var(--mantine-color-gray-1)` },
  passado: { background: 'var(--mantine-color-gray-2)' },
};

const ESTILO_ESCOLHIDO: CSSProperties = { background: 'var(--mantine-color-green-2)' };

/** `2026-11-10` → `10/11`. */
function diaEMes(data: string) {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function rotuloDoDia({ data, diaSemana }: DiaDaGrade) {
  return `${DIAS_DA_SEMANA[diaSemana]} ${diaEMes(data)}`;
}

function rotuloDoIntervalo({ inicio, fim }: IntervaloEscolhido) {
  return `${rotuloDoMinuto(inicio)} às ${rotuloDoMinuto(fim)}`;
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

/** A criação de Reserva chega no #37; até lá a janela só mostra o Intervalo escolhido. */
function JanelaDoIntervalo({
  intervalo,
  recurso,
  ehGestor,
  aoFechar,
}: {
  intervalo: IntervaloEscolhido | null;
  recurso: Agenda['recurso'];
  ehGestor: boolean;
  aoFechar: () => void;
}) {
  return (
    <Modal
      opened={intervalo !== null}
      onClose={aoFechar}
      title={ehGestor ? 'Gestor não cria Reservas' : 'Nova Reserva'}
    >
      {intervalo && (
        <Stack gap="sm">
          {ehGestor ? (
            <Text>
              Gestor não faz Reservas. Para impedir o uso de um Recurso num período, cadastre uma
              Indisponibilidade.
            </Text>
          ) : (
            <>
              <Text>
                <strong>{recurso.nome}</strong>
                <br />
                {diaEMes(intervalo.data)}, das {rotuloDoIntervalo(intervalo)}
              </Text>
              <Alert color="yellow">A criação de Reserva ainda não está disponível.</Alert>
            </>
          )}
          <Group justify="flex-end">
            <Button onClick={aoFechar}>Fechar</Button>
          </Group>
        </Stack>
      )}
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
  aoEscolher,
}: {
  agenda: Agenda;
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
        if (fim && fim.de !== fim.ate) aoEscolher(intervaloDoArraste(fim.dia, fim.de, fim.ate));
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
                const estado = estadoDaCelula(dia, minuto, agenda.ocupacoes, agora);
                const rotulo = `${rotuloDoDia(dia)}, ${rotuloDoMinuto(minuto)}: ${ROTULO_DO_ESTADO[estado]}`;
                return (
                  <Table.Td
                    key={dia.data}
                    p={0}
                    // Contém o VisuallyHidden (absoluto) no quadro que rola: sem isso, a página rola no celular.
                    pos="relative"
                    h={28}
                    style={escolhida(dia, minuto) ? ESTILO_ESCOLHIDO : ESTILO_DO_ESTADO[estado]}
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
                          aoEscolher(intervaloDoClique(dia, minuto, agenda.ocupacoes, agora))
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
  const ehGestor = useSessao().data?.usuario.perfil === 'Gestor';
  const [intervalo, setIntervalo] = useState<IntervaloEscolhido | null>(null);

  function irPara(semana: string | null) {
    setParametros(semana ? { semana } : {});
  }

  if (agenda.isPending) return <Loader aria-label="Carregando agenda" />;
  if (agenda.isError) {
    return (
      <Alert color="red" role="alert">
        {agenda.error.message}
      </Alert>
    );
  }

  const { semana, recurso } = agenda.data;
  return (
    <Stack gap="md">
      <Cabecalho recurso={recurso} />

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

      <Legenda />
      <Grade agenda={agenda.data} aoEscolher={setIntervalo} />
      <JanelaDoIntervalo
        intervalo={intervalo}
        recurso={recurso}
        ehGestor={ehGestor}
        aoFechar={() => setIntervalo(null)}
      />
    </Stack>
  );
}
