import { Alert, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { useSessao } from '../conduta';
import {
  ATALHOS_DE_MINUTOS,
  corpoIrPara,
  paraCampoDeDataHora,
  rotuloDoAgora,
  useMudarRelogio,
} from './relogio';

/**
 * RNF02 (#52): barra da demo local (`DEMO=1`) para o apresentador ver o `agora` do servidor e
 * avançar o tempo em minutos ou ir para um horário exato sem esperar.
 */
export function BarraDoRelogio() {
  const sessao = useSessao();
  const mudar = useMudarRelogio();
  const [minutosLivres, setMinutosLivres] = useState('10');
  const [editado, setEditado] = useState<{ base: string; valor: string } | null>(null);

  if (!sessao.data?.demo) return null;

  const { agora } = sessao.data;
  const dataHora = editado?.base === agora ? editado.valor : paraCampoDeDataHora(agora);

  function avancarLivre(evento: FormEvent) {
    evento.preventDefault();
    const minutos = Number(minutosLivres);
    if (Number.isInteger(minutos) && minutos > 0) {
      mudar.mutate({ avancarMinutos: minutos });
    }
  }

  function irParaHorario(evento: FormEvent) {
    evento.preventDefault();
    if (dataHora) {
      mudar.mutate(corpoIrPara(dataHora));
    }
  }

  return (
    <Paper withBorder p="xs" mb="md" role="region" aria-label="Relógio da demonstração">
      <Stack gap="xs">
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="sm" fw={500}>
            Agora no servidor: {rotuloDoAgora(agora)}
          </Text>

          <Group gap={6} wrap="wrap">
            {ATALHOS_DE_MINUTOS.map(({ minutos, rotulo }) => (
              <Button
                key={minutos}
                variant="default"
                size="xs"
                disabled={mudar.isPending}
                onClick={() => mudar.mutate({ avancarMinutos: minutos })}
              >
                {rotulo}
              </Button>
            ))}

            <form onSubmit={avancarLivre}>
              <Group gap={4} wrap="nowrap">
                <TextInput
                  type="number"
                  min={1}
                  step={1}
                  required
                  size="xs"
                  w={72}
                  aria-label="Minutos para avançar"
                  value={minutosLivres}
                  onChange={(evento) => setMinutosLivres(evento.currentTarget.value)}
                />
                <Button type="submit" variant="default" size="xs" disabled={mudar.isPending}>
                  Avançar
                </Button>
              </Group>
            </form>

            <form onSubmit={irParaHorario}>
              <Group gap={4} wrap="nowrap">
                <TextInput
                  type="datetime-local"
                  required
                  size="xs"
                  aria-label="Ir para data e hora"
                  value={dataHora}
                  onChange={(evento) =>
                    setEditado({ base: agora, valor: evento.currentTarget.value })
                  }
                />
                <Button type="submit" variant="default" size="xs" disabled={mudar.isPending}>
                  Ir
                </Button>
              </Group>
            </form>
          </Group>
        </Group>

        {mudar.error && (
          <Alert color="red" role="alert" py="xs">
            {mudar.error.message}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
