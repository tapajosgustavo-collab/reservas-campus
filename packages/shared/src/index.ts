// Contrato entre a API e a tela: os schemas Zod de cada rota.
export { esquemaHealth, type Health } from './health';
export {
  esquemaErro,
  esquemaViolacao,
  STATUS_DO_ERRO,
  type CodigoErro,
  type RespostaErro,
  type Violacao,
} from './erros';
export { REGRAS, type IdRegra, type Regra } from './regras';
export { esquemaMudarRelogio, esquemaRelogio, type MudarRelogio, type RelogioDemo } from './demo';
export {
  esquemaEntrar,
  esquemaPerfil,
  esquemaSessao,
  esquemaUsuarioDemo,
  esquemaUsuariosDemo,
  type Entrar,
  type Perfil,
  type Sessao,
  type UsuarioDemo,
} from './sessao';
