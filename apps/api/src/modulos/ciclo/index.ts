// Fachada do M4 ciclo: o que os outros módulos e o app podem importar.
export { executar } from './casca/efeitos';
export { registrarRotasDoCiclo } from './casca/rotas';
export { sincronizar } from './casca/sincronizar';
export type { NotificacaoEmitida } from './nucleo/notificacao';
