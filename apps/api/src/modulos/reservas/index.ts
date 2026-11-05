// Fachada do M3 reservas: o que os outros módulos, o app e o seed podem importar.
export { registrarRotasDeReservas } from './casca/rotas';
// O seed grava pelo `executar` de cada módulo, como as rotas (#18).
export { executar } from './casca/efeitos';
// Pura, para a busca de Recurso livre (US06) do M2 usar as mesmas RN01–RN03 do reservar.
export { violacoesDoIntervalo, type FatosDaReserva, type Intervalo } from './nucleo/reservar';
