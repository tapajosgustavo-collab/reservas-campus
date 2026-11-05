// Fachada do M3 reservas: o que os outros módulos e o app podem importar.
export { registrarRotasDeReservas } from './casca/rotas';
// Pura, para a busca de Recurso livre (US06) do M2 usar as mesmas RN01–RN03 do reservar.
export { violacoesDoIntervalo, type FatosDaReserva, type Intervalo } from './nucleo/reservar';
