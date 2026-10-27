import { Text } from '@mantine/core';
import { esquemaHealth } from '@reservas/shared';
import { useQuery } from '@tanstack/react-query';
import { buscarJson } from './api';

export function Versao() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => buscarJson('/api/health', esquemaHealth),
  });

  const texto = data
    ? `versão ${data.sha.slice(0, 7)}`
    : isError
      ? 'API fora do ar'
      : 'conectando…';
  return (
    <Text size="xs" c="dimmed" title={data?.sha}>
      {texto}
    </Text>
  );
}
