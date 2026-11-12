import { POLITICA, type PerfilQueReserva, type Politica } from '@reservas/shared';
import autocannon, { type Client } from 'autocannon';

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

export const USUARIOS_DA_CARGA = [
  'ana.demo@unifesp.br',
  'bruno.demo@unifesp.br',
  'bia.demo@unifesp.br',
  'eduardo.demo@unifesp.br',
] as const;

export type UsuarioDaCarga = (typeof USUARIOS_DA_CARGA)[number];

export interface VagasDoUsuario {
  email: UsuarioDaCarga;
  perfil: PerfilQueReserva;
  ativas: number;
}

export interface RecursoDaCarga {
  id: number;
  capacidade: number;
}

/**
 * Distribui `conexoes` pelas vagas livres (`POLITICA.cota[perfil] - ativas`) de cada Usuário,
 * pulando quem não tem vaga disponível (RN07). Assim a carga não cancela nem mexe nas Reservas
 * pré-existentes (seed ou E2E) e continua funcionando quando o seed ganhar mais Reservas.
 */
export function distribuirConexoesPorVagas(
  usuarios: readonly VagasDoUsuario[],
  conexoes = 10,
  politica: Pick<Politica, 'cota'> = POLITICA,
): UsuarioDaCarga[] {
  const vagasRestantes = usuarios.map((u) => ({
    email: u.email,
    livres: Math.max(0, politica.cota[u.perfil] - u.ativas),
  }));

  const totalLivres = vagasRestantes.reduce((soma, u) => soma + u.livres, 0);
  if (totalLivres < conexoes) {
    throw new Error(
      `Vagas livres na Cota (${totalLivres}) insuficientes para ${conexoes} conexões simultâneas.`,
    );
  }

  const distribuicao: UsuarioDaCarga[] = [];
  while (distribuicao.length < conexoes) {
    for (const u of vagasRestantes) {
      if (u.livres > 0 && distribuicao.length < conexoes) {
        distribuicao.push(u.email);
        u.livres--;
      }
    }
  }
  return distribuicao;
}

/** Distribuicão padrão quando cada Aluno tem até 1 Reserva ativa no seed. */
const CONEXOES_PADRAO: readonly UsuarioDaCarga[] = distribuirConexoesPorVagas([
  { email: 'ana.demo@unifesp.br', perfil: 'Aluno', ativas: 1 },
  { email: 'bruno.demo@unifesp.br', perfil: 'Aluno', ativas: 1 },
  { email: 'bia.demo@unifesp.br', perfil: 'Aluno', ativas: 1 },
  { email: 'eduardo.demo@unifesp.br', perfil: 'Docente', ativas: 0 },
]);

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
const DIAS_UTEIS_NA_JANELA = 8; // 8 dias úteis entre [D+2, D+13] cabem sempre dentro dos 14 dias (RN05)
const TOTAL_SLOTS_JANELA = SLOTS_POR_DIA * DIAS_UTEIS_NA_JANELA; // 256 faixas recicladas
const MINUTO_ABERTURA = 7 * 60;
const CAPACIDADE_PADRAO_SALA_101 = 40;
const FUSO_SAO_PAULO_MS = -3 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const AGORA_PADRAO_DEMO = new Date('2026-11-10T08:00:00-03:00');

function formatarHoraMinuto(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Calcula os 8 dias úteis (seg–sex) no intervalo `[D+2, D+13]` em relação a `agora` no fuso de
 * São Paulo (`-03:00`). Começar em `D+2` evita colidir com as Reservas de `D` do seed e de `D`/`D+1`
 * do E2E, e parar em `D+13` garante que `23:00` nunca passe da Antecedência máxima de 14 dias (RN05).
 */
function diasUteisNaJanelaDe14Dias(agora: Date): string[] {
  const spMs = agora.getTime() + FUSO_SAO_PAULO_MS;
  const meiaNoiteSpUtcMs = Math.floor(spMs / UM_DIA_MS) * UM_DIA_MS;
  const dias: string[] = [];

  for (let delta = 2; delta <= 13 && dias.length < DIAS_UTEIS_NA_JANELA; delta++) {
    const dataUtc = new Date(meiaNoiteSpUtcMs + delta * UM_DIA_MS);
    const diaDaSemana = dataUtc.getUTCDay();
    if (diaDaSemana >= 1 && diaDaSemana <= 5) {
      dias.push(dataUtc.toISOString().slice(0, 10));
    }
  }
  return dias;
}

export interface PedidoDeReservaDaCarga {
  usuario: UsuarioDaCarga;
  corpo: string;
}

/**
 * Gera um pedido de Reserva válido para o índice informado:
 * - RN05: Intervalo de 30 min em dia útil dentro da janela de 14 dias a partir de `agora`;
 * - RN07: Usuário distribuído pelas vagas livres da Cota;
 * - RN08: `participantes` entre 1 e `capacidade`.
 */
export function pedidoDeReservaParaIndice(
  recursoId: number,
  indice: number,
  agora: Date = AGORA_PADRAO_DEMO,
  capacidade: number = CAPACIDADE_PADRAO_SALA_101,
  conexoesPorUsuario: readonly UsuarioDaCarga[] = CONEXOES_PADRAO,
): PedidoDeReservaDaCarga {
  const slotNaJanela = indice % TOTAL_SLOTS_JANELA;
  const slotNoDia = slotNaJanela % SLOTS_POR_DIA;
  const indiceDiaUtil = Math.floor(slotNaJanela / SLOTS_POR_DIA);
  const diasUteis = diasUteisNaJanelaDe14Dias(agora);
  const data = diasUteis[indiceDiaUtil]!;

  const inicioMin = MINUTO_ABERTURA + slotNoDia * 30;
  const fimMin = inicioMin + 30;
  const participantes = (indice % capacidade) + 1;
  const usuario = conexoesPorUsuario[indice % conexoesPorUsuario.length]!;

  return {
    usuario,
    corpo: JSON.stringify({
      recursoId,
      inicio: `${data}T${formatarHoraMinuto(inicioMin)}:00-03:00`,
      fim: `${data}T${formatarHoraMinuto(fimMin)}:00-03:00`,
      participantes,
    }),
  };
}

/**
 * Gera o corpo JSON de `POST /api/reservas` para o índice informado, respeitando RN05 e RN08.
 */
export function corpoDeReservaParaIndice(
  recursoId: number,
  indice: number,
  agora: Date = AGORA_PADRAO_DEMO,
  capacidade: number = CAPACIDADE_PADRAO_SALA_101,
): string {
  return pedidoDeReservaParaIndice(recursoId, indice, agora, capacidade).corpo;
}

export interface OpcoesDeCarga {
  urlDaApp?: string;
  conexoes?: number;
  duracaoSegundos?: number;
  log?: (mensagem: string) => void;
}

/** A Gestora dos Espaços no seed: a fila de Pedidos (`GET /api/gestao/pedidos`) é medida com ela. */
export const GESTOR_DA_CARGA = 'dora.demo@unifesp.br';

async function abrirSessao(urlDaApp: string, email: string) {
  const resposta = await fetch(`${urlDaApp}/api/sessao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao autenticar ${email} para carga: HTTP ${resposta.status}`);
  }
  const cookies = resposta.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error('A API não devolveu o cookie de sessão.');
  }
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  return { cookie, resposta };
}

export async function autenticarUsuario(
  urlDaApp: string,
  email: UsuarioDaCarga,
): Promise<{ cookie: string; perfil: PerfilQueReserva; agora: Date }> {
  const { cookie, resposta } = await abrirSessao(urlDaApp, email);
  const dados = (await resposta.json()) as {
    usuario: { perfil: PerfilQueReserva };
    agora: string;
  };
  return {
    cookie,
    perfil: dados.usuario.perfil,
    agora: new Date(dados.agora),
  };
}

/** A sessão do Gestor da carga: só o cookie importa, a fila não depende do `agora`. */
export async function autenticarGestor(urlDaApp: string): Promise<string> {
  const { cookie } = await abrirSessao(urlDaApp, GESTOR_DA_CARGA);
  return cookie;
}

export async function obterSala101(urlDaApp: string, cookie: string): Promise<RecursoDaCarga> {
  const resposta = await fetch(`${urlDaApp}/api/recursos?q=${encodeURIComponent('Sala 101')}`, {
    headers: { cookie },
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar Sala 101 para carga: HTTP ${resposta.status}`);
  }
  const itens = (await resposta.json()) as {
    id: number;
    nome: string;
    capacidade: number | null;
  }[];
  const sala101 = itens.find((r) => r.nome === 'Sala 101');
  if (!sala101 || typeof sala101.capacidade !== 'number') {
    throw new Error('Recurso Sala 101 não encontrado no banco para medir carga.');
  }
  return { id: sala101.id, capacidade: sala101.capacidade };
}

async function cancelarReserva(urlBase: string, id: number, cookie: string): Promise<void> {
  try {
    await fetch(`${urlBase}/api/reservas/${id}/cancelamento`, {
      method: 'POST',
      headers: { cookie },
    });
  } catch {
    // Ignora falha de rede eventual na limpeza.
  }
}

/**
 * Busca os IDs das Reservas ativas de um Usuário (para preservar as pré-existentes sem tocá-las
 * e limpar apenas o que a carga criou).
 */
async function listarIdsAtivosDoUsuario(urlBase: string, cookie: string): Promise<number[]> {
  try {
    const resposta = await fetch(`${urlBase}/api/reservas?situacao=ativas&pagina=1`, {
      headers: { cookie },
    });
    if (!resposta.ok) return [];
    const pagina = (await resposta.json()) as { itens?: { id: number }[] };
    return (pagina.itens ?? []).map((item) => item.id);
  } catch {
    return [];
  }
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

// Campos internos de `autocannon/lib/httpClient.js` (versão fixada em `~9.0.0` no package.json
// para evitar que um minor quebre a interceptação de `_doRequest`).
interface ClienteInternoAutocannon extends Client {
  destroyed?: boolean;
  _doRequest?: () => void;
  timeoutTicker?: { reschedule?: (ms: number) => void };
  timeout?: number;
}

/**
 * Mede `POST /api/reservas` distribuindo as conexões pelas vagas livres dos Usuários do seed
 * (Ana, Bruno, Bia e Eduardo) e cancelando cada Reserva criada antes de a mesma conexão disparar
 * o próximo `POST`.
 *
 * - As Reservas pré-existentes (seed, E2E ou testes manuais) nunca são canceladas: o número de
 *   Reservas ativas atuais de cada Usuário é lido antes do disparo e as conexões ocupam apenas as
 *   vagas livres (`POLITICA.cota[perfil] - ativas`).
 * - O cancelamento (`POST /api/reservas/:id/cancelamento`) é feito via `fetch` fora do socket do
 *   autocannon, logo após o evento `response` ter gravado a latência do `POST /api/reservas` no
 *   histograma e antes de `_doRequest` enviar o próximo `POST`. Assim, só o tempo de criar entra
 *   na medida, e cada conexão mantém no máximo 1 Reserva ativa por vez (sem estourar a Cota da RN07
 *   nem gerar Conflito da RN01).
 * - No `finally`, qualquer Reserva criada que tenha ficado ativa (inclusive de requisições em voo
 *   no exato fim do timer) é cancelada para não deixar sujeira no banco.
 */
export async function medirCriarECancelarReservas(opcoes: {
  urlBase: string;
  recursoId: number;
  capacidade?: number;
  cookiesPorUsuario: ReadonlyMap<UsuarioDaCarga, string>;
  perfisPorUsuario?: ReadonlyMap<UsuarioDaCarga, PerfilQueReserva>;
  agora: Date;
  conexoes: number;
  duracaoSegundos: number;
}): Promise<ResultadoDaRota> {
  const {
    urlBase,
    recursoId,
    capacidade = CAPACIDADE_PADRAO_SALA_101,
    cookiesPorUsuario,
    perfisPorUsuario,
    agora,
    conexoes,
    duracaoSegundos,
  } = opcoes;

  // Lê as Reservas ativas pré-existentes de cada Usuário para:
  // 1) distribuir as conexões apenas pelas vagas livres na Cota (sem cancelar o que já existia);
  // 2) no teardown (finally), cancelar apenas as Reservas novas criadas durante o benchmark.
  const idsPreExistentes = new Set<number>();
  const vagasPorUsuario: VagasDoUsuario[] = [];

  for (const [email, cookie] of cookiesPorUsuario.entries()) {
    const ids = await listarIdsAtivosDoUsuario(urlBase, cookie);
    for (const id of ids) {
      idsPreExistentes.add(id);
    }
    const perfil =
      perfisPorUsuario?.get(email) ?? (email === 'eduardo.demo@unifesp.br' ? 'Docente' : 'Aluno');
    vagasPorUsuario.push({ email, perfil, ativas: ids.length });
  }

  const conexoesPorUsuario = distribuirConexoesPorVagas(vagasPorUsuario, conexoes);

  const reservasAtivasDaCarga = new Map<number, string>();
  const cancelamentosEmVoo = new Set<Promise<void>>();
  let indiceConexao = 0;
  let passoGlobal = 0;

  try {
    const resultado = await autocannon({
      url: `${urlBase}/api/reservas`,
      method: 'POST',
      connections: conexoes,
      duration: duracaoSegundos,
      setupClient: (client) => {
        const slotConexao = indiceConexao++;
        const usuario = conexoesPorUsuario[slotConexao % conexoesPorUsuario.length]!;
        const cookie = cookiesPorUsuario.get(usuario)!;
        const clienteInterno = client as ClienteInternoAutocannon;

        if (typeof clienteInterno._doRequest !== 'function') {
          throw new Error(
            'autocannon mudou: o método interno Client._doRequest não foi encontrado.',
          );
        }

        let ultimoCorpoRecebido = '';
        let cancelamentoPendente: Promise<void> | null = null;

        const proximoCorpo = () => {
          const indice = slotConexao + passoGlobal++ * conexoesPorUsuario.length;
          return corpoDeReservaParaIndice(recursoId, indice, agora, capacidade);
        };

        client.setRequests([
          {
            method: 'POST',
            path: '/api/reservas',
            headers: {
              cookie,
              'Content-Type': 'application/json',
            },
            setupRequest: (req) => ({
              ...req,
              body: proximoCorpo(),
            }),
          },
        ]);

        client.on('body', (chunk: Buffer) => {
          ultimoCorpoRecebido += chunk.toString('utf8');
        });

        client.on('response', (statusCode: number) => {
          const texto = ultimoCorpoRecebido;
          ultimoCorpoRecebido = '';

          if (statusCode >= 200 && statusCode < 300 && texto) {
            try {
              const dados = JSON.parse(texto) as { id?: number };
              if (typeof dados.id === 'number') {
                const id = dados.id;
                reservasAtivasDaCarga.set(id, cookie);
                const promessa = cancelarReserva(urlBase, id, cookie).finally(() => {
                  reservasAtivasDaCarga.delete(id);
                  cancelamentosEmVoo.delete(promessa);
                });
                cancelamentosEmVoo.add(promessa);
                cancelamentoPendente = promessa;
              }
            } catch {
              // Resposta sem JSON de Reserva.
            }
          }
        });

        const doRequestOriginal = clienteInterno._doRequest.bind(clienteInterno);
        clienteInterno._doRequest = () => {
          if (clienteInterno.destroyed) return;
          if (cancelamentoPendente) {
            const pendente = cancelamentoPendente;
            cancelamentoPendente = null;
            void pendente.then(() => {
              if (clienteInterno.destroyed) return;
              clienteInterno.timeoutTicker?.reschedule?.(clienteInterno.timeout ?? 10_000);
              doRequestOriginal();
            });
            return;
          }
          doRequestOriginal();
        };
      },
    });

    return {
      p97_5Ms: resultado.latency.p97_5,
      respostas2xx: resultado['2xx'],
      nao2xx: resultado.non2xx,
      erros: resultado.errors + resultado.timeouts,
    };
  } finally {
    await Promise.allSettled([...cancelamentosEmVoo]);

    // Cancela qualquer Reserva rastreada que tenha sobrado em reservasAtivasDaCarga:
    await Promise.allSettled(
      [...reservasAtivasDaCarga.entries()].map(([id, cookie]) =>
        cancelarReserva(urlBase, id, cookie),
      ),
    );
    reservasAtivasDaCarga.clear();

    // Varredura final nos Usuários da carga para cancelar eventuais Reservas criadas por
    // requisições que estavam em voo no servidor quando o timer do autocannon fechou os sockets:
    for (const cookie of cookiesPorUsuario.values()) {
      const idsAtuais = await listarIdsAtivosDoUsuario(urlBase, cookie);
      for (const id of idsAtuais) {
        if (!idsPreExistentes.has(id)) {
          await cancelarReserva(urlBase, id, cookie);
        }
      }
    }
  }
}

export async function medirCarga({
  urlDaApp = process.env.URL_DA_APP || 'http://localhost:3000',
  conexoes = Number(process.env.CONEXOES_CARGA ?? 10),
  duracaoSegundos = Number(process.env.DURACAO_CARGA ?? 30),
  log = console.log,
}: OpcoesDeCarga = {}): Promise<MedidaDeCarga[]> {
  const base = urlDaApp.replace(/\/$/, '');
  log(`Obtendo sessões dos Usuários da carga em ${base}...`);

  const cookiesPorUsuario = new Map<UsuarioDaCarga, string>();
  const perfisPorUsuario = new Map<UsuarioDaCarga, PerfilQueReserva>();
  let agora = new Date();

  for (const email of USUARIOS_DA_CARGA) {
    const sessao = await autenticarUsuario(base, email);
    cookiesPorUsuario.set(email, sessao.cookie);
    perfisPorUsuario.set(email, sessao.perfil);
    agora = sessao.agora;
  }

  const cookieAna = cookiesPorUsuario.get('ana.demo@unifesp.br')!;
  const sala101 = await obterSala101(base, cookieAna);

  log(
    `Medindo agenda (GET /api/recursos/${sala101.id}/agenda) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  const agenda = await medirRota({
    url: `${base}/api/recursos/${sala101.id}/agenda`,
    cookie: cookieAna,
    conexoes,
    duracaoSegundos,
  });

  const cookieDora = await autenticarGestor(base);
  log(
    `Medindo a fila do Gestor (GET /api/gestao/pedidos) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  const fila = await medirRota({
    url: `${base}/api/gestao/pedidos`,
    cookie: cookieDora,
    conexoes,
    duracaoSegundos,
  });

  log(
    `Medindo as Notificações (GET /api/notificacoes) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  const notificacoes = await medirRota({
    url: `${base}/api/notificacoes`,
    cookie: cookieAna,
    conexoes,
    duracaoSegundos,
  });

  log(
    `Medindo criar Reserva (POST /api/reservas) com ${conexoes} conexões por ${duracaoSegundos}s...`,
  );
  const reservar = await medirCriarECancelarReservas({
    urlBase: base,
    recursoId: sala101.id,
    capacidade: sala101.capacidade,
    cookiesPorUsuario,
    perfisPorUsuario,
    agora,
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
      rota: '/api/gestao/pedidos',
      metodo: 'GET',
      ...fila,
      limiteMs: META_P95_MS,
    },
    {
      rota: '/api/notificacoes',
      metodo: 'GET',
      ...notificacoes,
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
