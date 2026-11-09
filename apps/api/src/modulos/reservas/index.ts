// Fachada do M3 reservas: o que os outros módulos, o app e o seed podem importar.
export { registrarRotasDeReservas } from './casca/rotas';
// O seed grava pelo `executar` de cada módulo, como as rotas (#18).
export { executar } from './casca/efeitos';
// Pura, para a busca de Recurso livre (US06) do M2 usar as mesmas RN01–RN03 do reservar.
export { violacoesDoIntervalo, type FatosDaReserva, type Intervalo } from './nucleo/reservar';
// Quem decide uma mudança de Status (o Check-in, no M4) devolve este efeito e pede ao M3 que grave.
export type { StatusMudou } from './nucleo/reservar';
// A Indisponibilidade (US05, no M2) cancela as Reservas do período por este efeito (RN04).
export type { ReservasCanceladasPeloSistema } from './nucleo/reservar';
