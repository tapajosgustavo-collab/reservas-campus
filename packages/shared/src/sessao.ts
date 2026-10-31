import { z } from 'zod';

export const esquemaPerfil = z.enum(['Aluno', 'Docente', 'Gestor']);

export type Perfil = z.infer<typeof esquemaPerfil>;

// Só a forma: o domínio @unifesp.br e o cadastro são da US01, no núcleo (422).
export const esquemaEntrar = z.strictObject({
  email: z.string().min(1).max(254),
});

export type Entrar = z.infer<typeof esquemaEntrar>;

export const esquemaUsuarioDemo = z.object({
  nome: z.string(),
  email: z.string(),
  perfil: esquemaPerfil,
});

export type UsuarioDemo = z.infer<typeof esquemaUsuarioDemo>;

export const esquemaUsuariosDemo = z.array(esquemaUsuarioDemo);

export const esquemaSessao = z.object({
  usuario: esquemaUsuarioDemo.extend({ id: z.number().int() }),
  agora: z.iso
    .datetime({ offset: true })
    .describe('O agora da API, com o deslocamento de São Paulo: a tela não usa o relógio dela'),
  demo: z.boolean().describe('`DEMO=1`: a tela mostra a barra do relógio'),
});

export type Sessao = z.infer<typeof esquemaSessao>;
