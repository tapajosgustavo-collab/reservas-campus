// Fachada do M1 conduta: o que os outros módulos e o app podem importar.
export { registrarSessaoDoUsuario } from './casca/sessao';
export { registrarRotasDaConduta } from './casca/conduta';
// Quem gera uma Penalidade (o Não comparecimento e o Cancelamento tardio, no M4) devolve este
// efeito e pede ao M1 que registre; o registro diz se nasceu uma Suspensão (RN19).
export { registrarPenalidade } from './casca/efeitos';
export type { PenalidadeGerada } from './nucleo/penalidade';
// Puro: até quando o Usuário está suspenso, para a RN09 do M3 e o "suspenso até" da fila (M4).
export { suspensoAte } from './nucleo/suspensao';
// Puro: as Penalidades dos últimos 30 dias do solicitante, na fila do Gestor (US11, M4).
export { penalidadesNaJanela } from './nucleo/conduta';
