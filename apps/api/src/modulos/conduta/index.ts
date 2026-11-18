// Fachada do M1 conduta: o que os outros módulos e o app podem importar.
export { registrarSessaoDoUsuario } from './casca/sessao';
// Quem gera uma Penalidade (o Não comparecimento e o Cancelamento tardio, no M4) devolve este
// efeito e pede ao M1 que registre; o registro diz se nasceu uma Suspensão (RN19).
export { registrarPenalidade } from './casca/efeitos';
export type { PenalidadeGerada } from './nucleo/penalidade';
// Puro: até quando o Usuário está suspenso, para a RN09 do M3 (e o "suspenso até" do #58).
export { suspensoAte } from './nucleo/suspensao';
