import { TZDate } from '@date-fns/tz';
import { esquemaTipoRecurso, type TipoRecurso } from '@reservas/shared';
import { formatISO } from 'date-fns';

const FUSO = 'America/Sao_Paulo';

/** O formulário da busca (US06). O Intervalo é a data e os minutos desde 0h em São Paulo. */
export interface FiltrosDaBusca {
  tipo: TipoRecurso | null;
  capacidadeMin: number | null;
  q: string;
  /** `YYYY-MM-DD`. */
  data: string | null;
  inicio: number | null;
  fim: number | null;
}

export const FILTROS_VAZIOS: FiltrosDaBusca = {
  tipo: null,
  capacidadeMin: null,
  q: '',
  data: null,
  inicio: null,
  fim: null,
};

/** `minuto` do dia `data` em São Paulo, em ISO com o deslocamento (1440 = 0h do dia seguinte). */
function isoDe(data: string, minuto: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return formatISO(new TZDate(ano!, mes! - 1, dia!, 0, minuto, FUSO));
}

/** A query de `GET /api/recursos`. O Intervalo só vai com a data, o início e o fim. */
export function consultaDaBusca({ tipo, capacidadeMin, q, data, inicio, fim }: FiltrosDaBusca) {
  const consulta = new URLSearchParams();
  if (tipo) consulta.set('tipo', tipo);
  if (capacidadeMin !== null) consulta.set('capacidadeMin', String(capacidadeMin));
  if (q.trim()) consulta.set('q', q.trim());
  if (data && inicio !== null && fim !== null) {
    consulta.set('inicio', isoDe(data, inicio));
    consulta.set('fim', isoDe(data, fim));
  }
  return consulta.toString();
}

/** Os filtros na URL da tela, para o voltar da agenda trazer a mesma busca. */
export function urlDosFiltros({ tipo, capacidadeMin, q, data, inicio, fim }: FiltrosDaBusca) {
  const url = new URLSearchParams();
  if (tipo) url.set('tipo', tipo);
  if (capacidadeMin !== null) url.set('capacidadeMin', String(capacidadeMin));
  if (q) url.set('q', q);
  if (data) url.set('data', data);
  if (inicio !== null) url.set('inicio', String(inicio));
  if (fim !== null) url.set('fim', String(fim));
  return url;
}

/** Inteiro entre `min` e `max`, múltiplo de `passo`; o resto vira `null`. */
function inteiro(valor: string | null, min: number, max: number, passo = 1) {
  if (!valor) return null;
  const numero = Number(valor);
  const valido = Number.isInteger(numero) && numero >= min && numero <= max;
  return valido && numero % passo === 0 ? numero : null;
}

/** A URL da tela pode vir editada à mão: o que não for um filtro possível cai. */
export function filtrosDaUrl(url: URLSearchParams): FiltrosDaBusca {
  const tipo = esquemaTipoRecurso.safeParse(url.get('tipo'));
  const data = url.get('data');
  const inicio = inteiro(url.get('inicio'), 0, 24 * 60 - 30, 30);
  const fim = inteiro(url.get('fim'), 30, 24 * 60, 30);
  return {
    tipo: tipo.success ? tipo.data : null,
    // Equipamento não tem Capacidade.
    capacidadeMin:
      tipo.data === 'Equipamento' ? null : inteiro(url.get('capacidadeMin'), 1, 10_000),
    q: url.get('q') ?? '',
    data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    inicio,
    fim: fim !== null && (inicio === null || fim > inicio) ? fim : null,
  };
}
