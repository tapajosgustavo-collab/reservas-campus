// Fachada do M2 recursos: o que os outros módulos, o app e o seed podem importar.
export { registrarRotasDeRecursos } from './casca/rotas';
// O seed grava pelo `executar` de cada módulo, como as rotas (#18).
export { executar } from './casca/efeitos';
