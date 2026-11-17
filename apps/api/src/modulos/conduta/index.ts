// Fachada do M1 conduta: o que os outros módulos e o app podem importar.
export { registrarSessaoDoUsuario } from './casca/sessao';
// Quem gera uma Penalidade (o Não comparecimento, no M4) devolve este efeito e pede ao M1 que grave.
export { executar } from './casca/efeitos';
export type { PenalidadeGerada } from './nucleo/penalidade';
