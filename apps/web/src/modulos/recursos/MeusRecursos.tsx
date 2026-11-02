import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { Link } from 'react-router';
import { ROTULO_DO_TIPO } from './FormularioDoRecurso';
import { useMeusRecursos } from './recursos';

/** "Meus recursos": os Recursos de que o Gestor da sessão é o responsável (US04, RN13). */
export function MeusRecursos() {
  const recursos = useMeusRecursos();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Meus recursos</Title>
        <Button component={Link} to="/gestao/recursos/novo">
          Cadastrar Recurso
        </Button>
      </Group>

      {recursos.isPending && <Loader aria-label="Carregando Recursos" />}
      {recursos.isError && (
        <Alert color="red" role="alert">
          {recursos.error.message}
        </Alert>
      )}
      {recursos.data?.length === 0 && (
        <Text c="dimmed">Você ainda não cadastrou nenhum Recurso.</Text>
      )}
      {recursos.data && recursos.data.length > 0 && (
        <Table.ScrollContainer minWidth={520}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nome</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Local</Table.Th>
                <Table.Th>Capacidade ou patrimônio</Table.Th>
                <Table.Th>
                  <VisuallyHidden>Ações</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recursos.data.map((recurso) => (
                <Table.Tr key={recurso.id}>
                  <Table.Td>{recurso.nome}</Table.Td>
                  <Table.Td>{ROTULO_DO_TIPO[recurso.tipo]}</Table.Td>
                  <Table.Td>{recurso.local ?? '—'}</Table.Td>
                  <Table.Td>
                    {recurso.tipo === 'Espaco'
                      ? `${recurso.capacidade} pessoas`
                      : `Patrimônio ${recurso.patrimonio}`}
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} to={`/gestao/recursos/${recurso.id}/editar`}>
                      Editar<VisuallyHidden> {recurso.nome}</VisuallyHidden>
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
