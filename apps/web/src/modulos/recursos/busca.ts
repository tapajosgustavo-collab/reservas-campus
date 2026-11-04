import { TZDate } from '@date-fns/tz';
import { esquemaTipoRecurso, type TipoRecurso } from '@reservas/shared';
import { format, formatISO, parseISO, startOfWeek } from 'date-fns';

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

function inteiro(valor: string | null) {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

export function filtrosDaUrl(url: URLSearchParams): FiltrosDaBusca {
  const tipo = esquemaTipoRecurso.safeParse(url.get('tipo'));
  const data = url.get('data');
  return {
    tipo: tipo.success ? tipo.data : null,
    capacidadeMin: inteiro(url.get('capacidadeMin')),
    q: url.get('q') ?? '',
    data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    inicio: inteiro(url.get('inicio')),
    fim: inteiro(url.get('fim')),
  };
}

/** A segunda-feira (`YYYY-MM-DD`) da semana de `data`. Só calendário, sem fuso. */
export function semanaDaData(data: string) {
  return format(startOfWeek(parseISO(data), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
