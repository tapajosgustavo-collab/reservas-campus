// Fachada do M4 ciclo: o que os outros módulos e o app podem importar.
export { executar } from './casca/efeitos';
export { registrarRotasDoCiclo } from './casca/rotas';
export { sincronizar } from './casca/sincronizar';
// RN17: a agenda (M2) mostra o Equipamento em Devolução atrasada como ocupado até o agora.
export { devolucaoAtrasada } from './nucleo/devolucao';
export type { NotificacaoEmitida } from './nucleo/notificacao';
