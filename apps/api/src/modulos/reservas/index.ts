// Fachada do M3 reservas: o que os outros módulos, o app e o seed podem importar.
export { registrarRotasDeReservas } from './casca/rotas';
// O seed grava pelo `executar` de cada módulo, como as rotas (#18).
export { executar } from './casca/efeitos';
