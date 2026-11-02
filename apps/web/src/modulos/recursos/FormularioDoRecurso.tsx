import {
  Alert,
  Button,
  Checkbox,
  Fieldset,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { Horario, Recurso, TipoRecurso } from '@reservas/shared';
import { useState, type FormEvent } from 'react';
import {
  DIAS_DA_SEMANA,
  HORARIO_INICIAL,
  horariosDasLinhas,
  linhasDoHorario,
  opcoesDeMeiaHora,
  type LinhaDoHorario,
} from './horario';

export const ROTULO_DO_TIPO: Record<TipoRecurso, string> = {
  Espaco: 'Espaço',
  Equipamento: 'Equipamento',
};

/** O que o formulário entrega; cada tela monta o corpo da rota dela. */
export interface DadosDoFormulario {
  tipo: TipoRecurso;
  nome: string;
  local: string;
  capacidade: number;
  patrimonio: string;
  horarios: Horario[];
}

interface Props {
  /** Na edição, o Recurso atual: o tipo e o patrimônio ficam travados (US04). */
  recurso?: Recurso;
  enviando: boolean;
  erro: Error | null;
  rotuloDoBotao: string;
  aoEnviar: (dados: DadosDoFormulario) => void;
}

const OPCOES_DE_ABRE = opcoesDeMeiaHora(0, 24 * 60 - 30);
const OPCOES_DE_FECHA = opcoesDeMeiaHora(30, 24 * 60);

/** Cadastro e edição de Recurso (US04). A tela não checa RN: quem recusa é a API. */
export function FormularioDoRecurso({ recurso, enviando, erro, rotuloDoBotao, aoEnviar }: Props) {
  const [tipo, setTipo] = useState<TipoRecurso>(recurso?.tipo ?? 'Espaco');
  const [nome, setNome] = useState(recurso?.nome ?? '');
  const [local, setLocal] = useState(recurso?.local ?? '');
  const [capacidade, setCapacidade] = useState<number | string>(recurso?.capacidade ?? '');
  const [patrimonio, setPatrimonio] = useState(recurso?.patrimonio ?? '');
  const [linhas, setLinhas] = useState(() => linhasDoHorario(recurso?.horarios ?? HORARIO_INICIAL));
  const espaco = tipo === 'Espaco';

  function mudarLinha(diaSemana: number, mudanca: Partial<LinhaDoHorario>) {
    setLinhas((atuais) =>
      atuais.map((linha) => (linha.diaSemana === diaSemana ? { ...linha, ...mudanca } : linha)),
    );
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    aoEnviar({
      tipo,
      nome,
      local,
      capacidade: Number(capacidade),
      patrimonio,
      horarios: horariosDasLinhas(linhas),
    });
  }

  return (
    <form onSubmit={enviar}>
      <Stack gap="md" maw={560}>
        {!recurso && (
          <Stack gap={4}>
            <Text size="sm" fw={500} id="rotulo-tipo">
              Tipo
            </Text>
            <SegmentedControl
              aria-labelledby="rotulo-tipo"
              value={tipo}
              onChange={(valor) => setTipo(valor as TipoRecurso)}
              data={[
                { value: 'Espaco', label: ROTULO_DO_TIPO.Espaco },
                { value: 'Equipamento', label: ROTULO_DO_TIPO.Equipamento },
              ]}
            />
          </Stack>
        )}
        <TextInput
          label="Nome"
          required
          maxLength={120}
          value={nome}
          onChange={(evento) => setNome(evento.currentTarget.value)}
        />
        <TextInput
          label="Local"
          description={espaco ? undefined : 'Opcional: onde o Equipamento é retirado'}
          required={espaco}
          maxLength={120}
          value={local}
          onChange={(evento) => setLocal(evento.currentTarget.value)}
        />
        {espaco ? (
          <NumberInput
            label="Capacidade"
            description="Número máximo de pessoas"
            required
            min={1}
            max={10_000}
            allowDecimal={false}
            value={capacidade}
            onChange={setCapacidade}
          />
        ) : (
          <TextInput
            label="Número de patrimônio"
            description={recurso ? 'O patrimônio não muda.' : 'Único: identifica a unidade.'}
            required
            disabled={Boolean(recurso)}
            maxLength={40}
            value={patrimonio}
            onChange={(evento) => setPatrimonio(evento.currentTarget.value)}
          />
        )}

        <Fieldset legend="Horário de funcionamento">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Uma faixa por dia. Dia desmarcado fica fechado.
            </Text>
            {linhas.map((linha) => (
              <Group key={linha.diaSemana} gap="xs" wrap="nowrap">
                <Checkbox
                  w={100}
                  label={DIAS_DA_SEMANA[linha.diaSemana]}
                  checked={linha.aberto}
                  onChange={(evento) =>
                    mudarLinha(linha.diaSemana, { aberto: evento.currentTarget.checked })
                  }
                />
                <Select
                  aria-label={`Abre (${DIAS_DA_SEMANA[linha.diaSemana]})`}
                  w={96}
                  data={OPCOES_DE_ABRE}
                  disabled={!linha.aberto}
                  allowDeselect={false}
                  value={String(linha.abre)}
                  onChange={(valor) => mudarLinha(linha.diaSemana, { abre: Number(valor) })}
                />
                <Text size="sm">às</Text>
                <Select
                  aria-label={`Fecha (${DIAS_DA_SEMANA[linha.diaSemana]})`}
                  w={96}
                  data={OPCOES_DE_FECHA}
                  disabled={!linha.aberto}
                  allowDeselect={false}
                  value={String(linha.fecha)}
                  onChange={(valor) => mudarLinha(linha.diaSemana, { fecha: Number(valor) })}
                />
              </Group>
            ))}
          </Stack>
        </Fieldset>

        {recurso && (
          <Text size="sm" c="dimmed">
            A edição só vale para as Reservas criadas depois: as que já existem não mudam.
          </Text>
        )}
        {erro && (
          <Alert color="red" role="alert" title="Não foi possível salvar">
            {erro.message}
          </Alert>
        )}
        <Group>
          <Button type="submit" loading={enviando}>
            {rotuloDoBotao}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
