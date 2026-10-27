import { AppShell, Burger, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Outlet, useLocation } from 'react-router';
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

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !menuAberto } }}
      footer={{ height: 32 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger
            opened={menuAberto}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            aria-label="Abrir menu"
          />
          <Title order={1} size="h4">
            <Link to="/" onClick={close} style={{ color: 'inherit', textDecoration: 'none' }}>
              Reservas do Campus
            </Link>
          </Title>
        </Group>
      </AppShell.Header>

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

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <AppShell.Footer px="md">
        <Group h="100%" justify="flex-end">
          <Versao />
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
