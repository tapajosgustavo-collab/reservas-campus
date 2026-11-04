import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import type { ResumoDoRecurso, TipoRecurso } from '@reservas/shared';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  consultaDaBusca,
  FILTROS_VAZIOS,
  filtrosDaUrl,
  semanaDaData,
  urlDosFiltros,
  type FiltrosDaBusca,
} from './busca';
import { ROTULO_DO_TIPO } from './FormularioDoRecurso';
import { opcoesDeMeiaHora, rotuloDoMinuto } from './horario';
import { useBuscarRecursos } from './recursos';

const OPCOES_DE_TIPO = [
  { value: 'Espaco', label: ROTULO_DO_TIPO.Espaco },
  { value: 'Equipamento', label: ROTULO_DO_TIPO.Equipamento },
];

const OPCOES_DE_INICIO = opcoesDeMeiaHora(0, 24 * 60 - 30);

/** "em 10/11/2026, das 10:00 às 12:00", se a busca tem o Intervalo inteiro. */
function rotuloDoIntervalo({ data, inicio, fim }: FiltrosDaBusca) {
  if (data === null || inicio === null || fim === null) return null;
  const [ano, mes, dia] = data.split('-');
  return `em ${dia}/${mes}/${ano}, das ${rotuloDoMinuto(inicio)} às ${rotuloDoMinuto(fim)}`;
}

/** "1 Recurso livre em …", "3 Recursos", "0 Recursos livres em …". */
function rotuloDoTotal(total: number, intervalo: string | null) {
  const um = total === 1;
  const livres = intervalo && ` ${um ? 'livre' : 'livres'} ${intervalo}`;
  return `${total} ${um ? 'Recurso' : 'Recursos'}${livres ?? ''}`;
}

function minutoOuNulo(valor: string | null) {
  return valor === null ? null : Number(valor);
}

function Formulario({
  inicial,
  aoBuscar,
}: {
  inicial: FiltrosDaBusca;
  aoBuscar: (filtros: FiltrosDaBusca) => void;
}) {
  const [filtros, setFiltros] = useState(inicial);
  const mudar = (mudanca: Partial<FiltrosDaBusca>) => setFiltros((f) => ({ ...f, ...mudanca }));
  const espaco = filtros.tipo !== 'Equipamento';
  // O fim só oferece horários depois do início.
  const opcoesDeFim = opcoesDeMeiaHora((filtros.inicio ?? 0) + 30, 24 * 60);
  const partesDoIntervalo = [filtros.data, filtros.inicio, filtros.fim].filter((p) => p !== null);
  const intervaloIncompleto = partesDoIntervalo.length > 0 && partesDoIntervalo.length < 3;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    aoBuscar(filtros);
  }

  function limpar() {
    setFiltros(FILTROS_VAZIOS);
    aoBuscar(FILTROS_VAZIOS);
  }

  return (
    <form onSubmit={enviar} aria-label="Filtros da busca">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput
            label="Nome ou local"
            placeholder="Ex.: laboratório, Bloco A, projetor"
            value={filtros.q}
            onChange={(evento) => mudar({ q: evento.currentTarget.value })}
          />
          <Select
            label="Tipo"
            placeholder="Todos"
            data={OPCOES_DE_TIPO}
            value={filtros.tipo}
            onChange={(tipo) =>
              mudar({
                tipo: tipo as TipoRecurso | null,
                // Equipamento não tem Capacidade.
                ...(tipo === 'Equipamento' && { capacidadeMin: null }),
              })
            }
            clearable
          />
          <NumberInput
            label="Capacidade mínima"
            description={espaco ? undefined : 'Equipamento não tem Capacidade'}
            placeholder="Pessoas"
            min={1}
            max={10_000}
            allowDecimal={false}
            disabled={!espaco}
            value={filtros.capacidadeMin ?? ''}
            onChange={(valor) => mudar({ capacidadeMin: typeof valor === 'number' ? valor : null })}
          />
        </SimpleGrid>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              type="date"
              label="Data"
              value={filtros.data ?? ''}
              onChange={(evento) => mudar({ data: evento.currentTarget.value || null })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <Select
              label="Início"
              placeholder="—"
              data={OPCOES_DE_INICIO}
              value={filtros.inicio === null ? null : String(filtros.inicio)}
              onChange={(valor) => {
                const inicio = minutoOuNulo(valor);
                const fimValido = inicio === null || filtros.fim === null || filtros.fim > inicio;
                mudar({ inicio, ...(!fimValido && { fim: null }) });
              }}
              clearable
              searchable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <Select
              label="Fim"
              placeholder="—"
              data={opcoesDeFim}
              value={filtros.fim === null ? null : String(filtros.fim)}
              onChange={(valor) => mudar({ fim: minutoOuNulo(valor) })}
              clearable
              searchable
            />
          </Grid.Col>
        </Grid>
        {intervaloIncompleto && (
          <Text size="sm" c="dimmed">
            Escolha a data, o início e o fim para ver só o que está livre.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={limpar}>
            Limpar
          </Button>
          <Button type="submit">Buscar</Button>
        </Group>
      </Stack>
    </form>
  );
}

function CartaoDoRecurso({ recurso, semana }: { recurso: ResumoDoRecurso; semana: string | null }) {
  const agenda = `/recursos/${recurso.id}/agenda${semana ? `?semana=${semana}` : ''}`;
  return (
    <Card withBorder padding="md" component="li">
      <Stack gap={4} h="100%">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600}>{recurso.nome}</Text>
          <Badge variant="light" color={recurso.tipo === 'Espaco' ? 'blue' : 'grape'}>
            {ROTULO_DO_TIPO[recurso.tipo]}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {recurso.local ?? 'Sem local'}
        </Text>
        <Text size="sm">
          {recurso.tipo === 'Espaco'
            ? `${recurso.capacidade} pessoas`
            : `Patrimônio ${recurso.patrimonio}`}
        </Text>
        <Button component={Link} to={agenda} variant="light" mt="auto">
          Ver agenda<VisuallyHidden> de {recurso.nome}</VisuallyHidden>
        </Button>
      </Stack>
    </Card>
  );
}

/** US06: buscar Recursos por tipo, Capacidade, texto e Intervalo; com Intervalo, só os livres. */
export function BuscaDeRecursos() {
  const [url, setUrl] = useSearchParams();
  const filtros = filtrosDaUrl(url);
  const recursos = useBuscarRecursos(consultaDaBusca(filtros));
  const intervalo = rotuloDoIntervalo(filtros);

  return (
    <Stack gap="md">
      <Title order={2}>Buscar Recursos</Title>
      <Card withBorder padding="md">
        <Formulario
          // Remonta o formulário quando a URL muda por fora (voltar, link).
          key={url.toString()}
          inicial={filtros}
          aoBuscar={(novos) => setUrl(urlDosFiltros(novos))}
        />
      </Card>

      {recursos.isError && (
        <Alert color="red" role="alert">
          {recursos.error.message}
        </Alert>
      )}
      {recursos.isPending && <Loader aria-label="Buscando Recursos" />}
      {recursos.data && (
        <Stack gap="sm" aria-live="polite">
          <Text size="sm" c="dimmed">
            {rotuloDoTotal(recursos.data.length, intervalo)}
          </Text>
          {recursos.data.length === 0 ? (
            <Text>
              {intervalo
                ? 'Nenhum Recurso livre com esses filtros. Tente outro horário ou tire um filtro.'
                : 'Nenhum Recurso com esses filtros.'}
            </Text>
          ) : (
            <SimpleGrid
              cols={{ base: 1, sm: 2, lg: 3 }}
              component="ul"
              style={{ listStyle: 'none', padding: 0, margin: 0 }}
            >
              {recursos.data.map((recurso) => (
                <CartaoDoRecurso
                  key={recurso.id}
                  recurso={recurso}
                  semana={filtros.data && semanaDaData(filtros.data)}
                />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      )}
    </Stack>
  );
}
