import { Stack, Text, Title } from '@mantine/core';

interface Props {
  titulo: string;
  descricao: string;
}

export function EmConstrucao({ titulo, descricao }: Props) {
  return (
    <Stack gap="xs">
      <Title order={2}>{titulo}</Title>
      <Text c="dimmed">{descricao}</Text>
    </Stack>
  );
}
