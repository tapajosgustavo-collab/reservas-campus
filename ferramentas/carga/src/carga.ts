import autocannon from 'autocannon';

export interface MedidaDeCarga {
  rota: string;
  metodo: 'GET' | 'POST';
  p97_5Ms: number;
  limiteMs: number;
  respostas2xx: number;
  nao2xx: number;
  erros: number;
}

export const META_P95_MS = 500;

export function relatorioDeCargaMd(medidas: MedidaDeCarga[]): string {
  const linhas = [
    '### Medidas de latência sob carga (RNF12)',
    '',
    'Condição: servidor acordado, banco do seed, 10 conexões simultâneas por 30 s. Meta de release: p95 ≤ 500 ms (medida pelo p97,5 do autocannon, limite conservador de p95).',
    '',
    '| Rota | Método | p97,5 | Meta | 2xx | Não-2xx | Erros/Timeouts | Status |',
    '|---|---|---|---|---|---|---|---|',
    ...medidas.map((m) => {
      const falhas = m.nao2xx + m.erros;
      const maioria2xx = m.respostas2xx > falhas;
      const passou = m.p97_5Ms <= m.limiteMs && maioria2xx;
      const status = passou ? '✅' : '⚠️';
      return `| \`${m.rota}\` | ${m.metodo} | ${m.p97_5Ms} ms | ≤ ${m.limiteMs} ms | ${m.respostas2xx} | ${m.nao2xx} | ${m.erros} | ${status} |`;
    }),
    '',
  ];
  return linhas.join('\n');
}

export function erroDeCargaMd(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return [
    '### Medidas de latência sob carga (RNF12)',
    '',
    `⚠️ **Falha ao medir carga:** ${mensagem}`,
    '',
  ].join('\n');
}

const SLOTS_POR_DIA = 32; // 07:00 às 23:00 em faixas de 30 min
const MINUTO_ABERTURA = 7 * 60;

function formatarHoraMinuto(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Gera um intervalo de 30 min único num dia útil (seg–sex, 07h–23h) a partir de 2026-11-16,
 * garantindo que cada POST /api/reservas na carga crie de fato uma Reserva (201 Created).
 */
export function corpoDeReservaParaIndice(recursoId: number, indice: number): string {
  const slotNoDia = indice % SLOTS_POR_DIA;
  const diaUtil = Math.floor(indice / SLOTS_POR_DIA);
  const diasCorridos = Math.floor(diaUtil / 5) * 7 + (diaUtil % 5);
  const data = new Date(Date.UTC(2026, 10, 16 + diasCorridos)).toISOString().slice(0, 10);
  const inicioMin = MINUTO_ABERTURA + slotNoDia * 30;
  const fimMin = inicioMin + 30;

  return JSON.stringify({
    recursoId,
    inicio: `${data}T${formatarHoraMinuto(inicioMin)}:00-03:00`,
    fim: `${data}T${formatarHoraMinuto(fimMin)}:00-03:00`,
  });
}

export interface OpcoesDeCarga {
  urlDaApp?: string;
  conexoes?: number;
  duracaoSegundos?: number;
  log?: (mensagem: string) => void;
}

export async function autenticarAna(urlDaApp: string): Promise<string> {
  const resposta = await fetch(`${urlDaApp}/api/sessao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana.demo@unifesp.br' }),
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao autenticar Ana para carga: HTTP ${resposta.status}`);
  }
  const cookies = resposta.headers.getSetCookie();
  if (cookies.length === 0) {
    const raw = resposta.headers.get('set-cookie');
    if (!raw) throw new Error('A API não devolveu o cookie de sessão.');
    const primeiro = raw.split(';')[0];
    if (!primeiro) throw new Error('A API não devolveu um cookie de sessão válido.');
    return primeiro;
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

export async function obterIdDaSala101(urlDaApp: string, cookie: string): Promise<number> {
  const resposta = await fetch(`${urlDaApp}/api/recursos?q=${encodeURIComponent('Sala 101')}`, {
    headers: { cookie },
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar Sala 101 para carga: HTTP ${resposta.status}`);
  }
  const itens = (await resposta.json()) as { id: number; nome: string }[];
  const sala101 = itens.find((r) => r.nome === 'Sala 101') ?? itens[0];
  if (!sala101) {
    throw new Error('Recurso Sala 101 não encontrado no banco para medir carga.');
  }
  return sala101.id;
}

export interface ResultadoDaRota {
  p97_5Ms: number;
  respostas2xx: number;
  nao2xx: number;
  erros: number;
}

export async function medirRota(opcoes: {
  url: string;
  metodo?: 'GET' | 'POST';
  cookie: string;
  gerarCorpo?: () => string;
  conexoes: number;
  duracaoSegundos: number;
}): Promise<ResultadoDaRota> {
  const metodo = opcoes.metodo ?? 'GET';
  const headersBase = {
    cookie: opcoes.cookie,
    ...(opcoes.gerarCorpo ? { 'Content-Type': 'application/json' } : {}),
  };
  const urlObj = new URL(opcoes.url);
  const caminho = `${urlObj.pathname}${urlObj.search}`;

  const resultado = await autocannon({
    url: opcoes.url,
    method: metodo,
    connections: opcoes.conexoes,
    duration: opcoes.duracaoSegundos,
    headers: headersBase,
    ...(opcoes.gerarCorpo
      ? {
          requests: [
            {
              method: metodo,
              path: caminho,
              headers: headersBase,
              setupRequest: (req) => ({
                ...req,
                body: opcoes.gerarCorpo!(),
              }),
            },
          ],
        }
      : {}),
  });

  return {
    p97_5Ms: resultado.latency.p97_5,
    respostas2xx: resultado['2xx'],
    nao2xx: resultado.non2xx,
    erros: resultado.errors + resultado.timeouts,
  };
}

export async function medirCargaDoIncremento1({
  urlDaApp = process.env.URL_DA_APP || 'http://localhost:3000',
  conexoes = Number(process.env.CONEXOES_CARGA ?? 10),
  duracaoSegundos = Number(process.env.DURACAO_CARGA ?? 30),
  log = console.log,
}: OpcoesDeCarga = {}): Promise<MedidaDeCarga[]> {
  const base = urlDaApp.replace(/\/$/, '');
  log(`Obtendo sessão da Ana em ${base}...`);
  const cookie = await autenticarAna(base);
  const recursoId = await obterIdDaSala101(base, cookie);

  log(
    `Medindo agenda (GET /api/recursos/${recursoId}/agenda) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  const agenda = await medirRota({
    url: `${base}/api/recursos/${recursoId}/agenda`,
    cookie,
    conexoes,
    duracaoSegundos,
  });

  log(
    `Medindo criar Reserva (POST /api/reservas) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  let indiceReserva = 0;
  const reservar = await medirRota({
    url: `${base}/api/reservas`,
    metodo: 'POST',
    cookie,
    gerarCorpo: () => corpoDeReservaParaIndice(recursoId, indiceReserva++),
    conexoes,
    duracaoSegundos,
  });

  return [
    {
      rota: '/api/recursos/:id/agenda',
      metodo: 'GET',
      ...agenda,
      limiteMs: META_P95_MS,
    },
    {
      rota: '/api/reservas',
      metodo: 'POST',
      ...reservar,
      limiteMs: META_P95_MS,
    },
  ];
}
