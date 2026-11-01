import {
  Alert,
  AppShell,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  NavLink,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Outlet, useLocation } from 'react-router';
import { Entrar, useSair, useSessao } from '../modulos/conduta';
import { Versao } from './Versao';

// Uma entrada por módulo (M1 a M4), na ordem do docs/requisitos.md §4.
const MENU = [
  { para: '/conduta', rotulo: 'Minha conduta' },
  { para: '/recursos', rotulo: 'Recursos' },
  { para: '/reservas', rotulo: 'Minhas reservas' },
  { para: '/gestao/pedidos', rotulo: 'Pedidos' },
];

export function Layout() {
  const [menuAberto, { toggle, close }] = useDisclosure();
  const { pathname } = useLocation();
  const sessao = useSessao();
  const sair = useSair();
  const usuario = sessao.data?.usuario;

  return (
    <AppShell
      header={{ height: 56 }}
      // Sem sessão não há menu: a tela inteira é o login.
      navbar={
        usuario ? { width: 220, breakpoint: 'sm', collapsed: { mobile: !menuAberto } } : undefined
      }
      footer={{ height: 32 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            {usuario && (
              <Burger
                opened={menuAberto}
                onClick={toggle}
                hiddenFrom="sm"
                size="sm"
                aria-label="Abrir menu"
              />
            )}
            <Title order={1} size="h4">
              <Link to="/" onClick={close} style={{ color: 'inherit', textDecoration: 'none' }}>
                Reservas do Campus
              </Link>
            </Title>
          </Group>
          {usuario && (
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" visibleFrom="sm">
                {usuario.nome} ({usuario.perfil})
              </Text>
              <Button
                variant="default"
                size="xs"
                loading={sair.isPending}
                onClick={() => sair.mutate()}
              >
                Sair
              </Button>
            </Group>
          )}
        </Group>
      </AppShell.Header>

      {usuario && (
        <AppShell.Navbar p="xs" component="nav" aria-label="Menu principal">
          {MENU.map(({ para, rotulo }) => (
            <NavLink
              key={para}
              component={Link}
              to={para}
              label={rotulo}
              active={pathname === para || pathname.startsWith(`${para}/`)}
              onClick={close}
            />
          ))}
        </AppShell.Navbar>
      )}

      <AppShell.Main>
        {sair.isError && usuario && (
          <Alert color="red" role="alert" title="Não foi possível sair" mb="md">
            {sair.error.message} A sessão continua aberta: tente sair de novo.
          </Alert>
        )}
        {sessao.isPending ? (
          <Center>
            <Loader aria-label="Carregando" />
          </Center>
        ) : sessao.isError ? (
          // Só o 401 vira "sem sessão"; outro erro não pode parecer que a pessoa saiu.
          <Alert color="red" role="alert" title="Não foi possível falar com a API">
            {sessao.error.message} Recarregue a página para tentar de novo.
          </Alert>
        ) : usuario ? (
          <Outlet />
        ) : (
          <Entrar />
        )}
      </AppShell.Main>

      <AppShell.Footer px="md">
        <Group h="100%" justify="flex-end">
          <Versao />
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
