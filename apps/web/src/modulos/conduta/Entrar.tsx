import {
  Alert,
  Button,
  Divider,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { Perfil, UsuarioDemo } from '@reservas/shared';
import { useState, type FormEvent } from 'react';
import { useEntrar, useUsuariosDemo } from './sessao';

const PERFIS: Perfil[] = ['Aluno', 'Docente', 'Gestor'];

/** Tela de login (US01): e-mail institucional sem senha e a lista "Entrar como…" (ADR 0002). */
export function Entrar() {
  const [email, setEmail] = useState('');
  const entrar = useEntrar();
  const usuarios = useUsuariosDemo();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    entrar.mutate(email);
  }

  return (
    <Stack maw={420} mx="auto" gap="lg">
      <Title order={2}>Entrar</Title>

      <form onSubmit={enviar}>
        <Stack gap="sm">
          <TextInput
            label="E-mail institucional"
            placeholder="nome@unifesp.br"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.currentTarget.value)}
          />
          {entrar.error && (
            <Alert color="red" role="alert">
              {entrar.error.message}
            </Alert>
          )}
          <Button type="submit" loading={entrar.isPending}>
            Entrar
          </Button>
        </Stack>
      </form>

      <Divider label="Entrar como…" labelPosition="center" />

      {usuarios.isPending && <Loader size="sm" mx="auto" aria-label="Carregando Usuários" />}
      {usuarios.isError && (
        <Alert color="red" role="alert">
          Não foi possível carregar os Usuários de demonstração.
        </Alert>
      )}
      {usuarios.data && (
        <Stack gap="md">
          {PERFIS.map((perfil) => (
            <ListaDoPerfil
              key={perfil}
              perfil={perfil}
              usuarios={usuarios.data.filter((usuario) => usuario.perfil === perfil)}
              aoEscolher={(escolhido) => entrar.mutate(escolhido)}
              desabilitado={entrar.isPending}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface PropsDaLista {
  perfil: Perfil;
  usuarios: UsuarioDemo[];
  aoEscolher: (email: string) => void;
  desabilitado: boolean;
}

function ListaDoPerfil({ perfil, usuarios, aoEscolher, desabilitado }: PropsDaLista) {
  if (usuarios.length === 0) return null;
  return (
    <Stack gap={6}>
      <Title order={3} size="h5">
        {perfil}
      </Title>
      {usuarios.map((usuario) => (
        <UnstyledButton
          key={usuario.email}
          onClick={() => aoEscolher(usuario.email)}
          disabled={desabilitado}
        >
          <Paper withBorder p="xs">
            <Text fw={500}>{usuario.nome}</Text>
            <Text size="sm" c="dimmed">
              {usuario.email}
            </Text>
          </Paper>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
