import { Alert, Anchor, Loader, Stack, Title } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router';
import { FormularioDoRecurso, ROTULO_DO_TIPO, type DadosDoFormulario } from './FormularioDoRecurso';
import { useCadastrarRecurso, useEditarRecurso, useRecurso } from './recursos';

const MEUS_RECURSOS = '/gestao/recursos';

function Voltar() {
  return (
    <Anchor component={Link} to={MEUS_RECURSOS} size="sm">
      ← Meus recursos
    </Anchor>
  );
}

/** Cadastro de Espaço ou Equipamento: quem cadastra fica como Gestor responsável (RN13). */
export function CadastrarRecurso() {
  const cadastrar = useCadastrarRecurso();
  const navegar = useNavigate();

  function enviar({ tipo, nome, local, capacidade, patrimonio, horarios }: DadosDoFormulario) {
    cadastrar.mutate(
      tipo === 'Espaco'
        ? { tipo, nome, local, capacidade, horarios }
        : { tipo, nome, local: local || undefined, patrimonio, horarios },
      { onSuccess: () => navegar(MEUS_RECURSOS) },
    );
  }

  return (
    <Stack gap="md">
      <Voltar />
      <Title order={2}>Cadastrar Recurso</Title>
      <FormularioDoRecurso
        enviando={cadastrar.isPending}
        erro={cadastrar.error}
        rotuloDoBotao="Cadastrar"
        aoEnviar={enviar}
      />
    </Stack>
  );
}

/** Edição pelo Gestor responsável: o tipo e o patrimônio não mudam (US04). */
export function EditarRecurso() {
  const id = Number(useParams().id);
  const recurso = useRecurso(id);
  const editar = useEditarRecurso(id);
  const navegar = useNavigate();

  function enviar({ tipo, nome, local, capacidade, horarios }: DadosDoFormulario) {
    editar.mutate(
      {
        nome,
        // Equipamento com o local apagado fica sem local; Espaço sempre tem.
        local: local || (tipo === 'Equipamento' ? null : undefined),
        capacidade: tipo === 'Espaco' ? capacidade : undefined,
        horarios,
      },
      { onSuccess: () => navegar(MEUS_RECURSOS) },
    );
  }

  return (
    <Stack gap="md">
      <Voltar />
      {/* O formulário guarda o que recebe ao montar: espera a busca desta visita, não o cache. */}
      {!recurso.isFetchedAfterMount && <Loader aria-label="Carregando Recurso" />}
      {recurso.isError && (
        <Alert color="red" role="alert">
          {recurso.error.message}
        </Alert>
      )}
      {recurso.data && recurso.isFetchedAfterMount && (
        <>
          <Title order={2}>
            Editar {ROTULO_DO_TIPO[recurso.data.tipo]}: {recurso.data.nome}
          </Title>
          <FormularioDoRecurso
            recurso={recurso.data}
            enviando={editar.isPending}
            erro={editar.error}
            rotuloDoBotao="Salvar"
            aoEnviar={enviar}
          />
        </>
      )}
    </Stack>
  );
}
