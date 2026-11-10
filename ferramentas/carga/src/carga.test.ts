import { createServer } from 'node:http';
import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  corpoDeReservaParaIndice,
  distribuirConexoesPorVagas,
  erroDeCargaMd,
  medirCriarECancelarReservas,
  pedidoDeReservaParaIndice,
  relatorioDeCargaMd,
  USUARIOS_DA_CARGA,
  type MedidaDeCarga,
} from './carga';

describe('RNF12 · Relatório de carga em Markdown', () => {
  it('formata a tabela com p97,5, contagem de 2xx/falhas e ícone de aprovação quando dentro da meta e maioria 2xx', () => {
    const medidas: MedidaDeCarga[] = [
      {
        rota: '/api/recursos/:id/agenda',
        metodo: 'GET',
        p97_5Ms: 45,
        limiteMs: 500,
        respostas2xx: 1200,
        nao2xx: 0,
        erros: 0,
      },
      {
        rota: '/api/reservas',
        metodo: 'POST',
        p97_5Ms: 82,
        limiteMs: 500,
        respostas2xx: 850,
        nao2xx: 0,
        erros: 0,
      },
    ];

    const md = relatorioDeCargaMd(medidas);

    expect(md).toContain('### Medidas de latência sob carga (RNF12)');
    expect(md).toContain('limite conservador de p95');
    expect(md).toContain(
      '| `/api/recursos/:id/agenda` | GET | 45 ms | ≤ 500 ms | 1200 | 0 | 0 | ✅ |',
    );
    expect(md).toContain('| `/api/reservas` | POST | 82 ms | ≤ 500 ms | 850 | 0 | 0 | ✅ |');
  });

  it('exibe alerta quando o p97,5 ultrapassa a meta de 500 ms', () => {
    const medidas: MedidaDeCarga[] = [
      {
        rota: '/api/reservas',
        metodo: 'POST',
        p97_5Ms: 550,
        limiteMs: 500,
        respostas2xx: 500,
        nao2xx: 0,
        erros: 0,
      },
    ];

    const md = relatorioDeCargaMd(medidas);

    expect(md).toContain('| `/api/reservas` | POST | 550 ms | ≤ 500 ms | 500 | 0 | 0 | ⚠️ |');
  });

  it('exibe alerta quando a maioria das respostas não é 2xx mesmo com latência baixa', () => {
    const medidas: MedidaDeCarga[] = [
      {
        rota: '/api/reservas',
        metodo: 'POST',
        p97_5Ms: 28,
        limiteMs: 500,
        respostas2xx: 1,
        nao2xx: 999,
        erros: 0,
      },
    ];

    const md = relatorioDeCargaMd(medidas);

    expect(md).toContain('| `/api/reservas` | POST | 28 ms | ≤ 500 ms | 1 | 999 | 0 | ⚠️ |');
  });

  it('formata mensagem de erro em Markdown quando a medição falha', () => {
    const md = erroDeCargaMd(new Error('Servidor indisponível'));
    expect(md).toContain('⚠️ **Falha ao medir carga:** Servidor indisponível');
  });
});

describe('RNF12 · Geração de pedidos válidos da carga (RN05, RN07, RN08)', () => {
  const agoraBase = new Date('2026-11-10T08:00:00-03:00');
  const umDiaMs = 24 * 60 * 60 * 1000;
  const umaHoraMs = 60 * 60 * 1000;

  it('RN05 e RN08 · gera intervalos de 30 min em dias úteis dentro de 14 dias e com participantes dentro da Capacidade', () => {
    const primeiro = JSON.parse(corpoDeReservaParaIndice(1, 0, agoraBase, 30)) as {
      recursoId: number;
      inicio: string;
      fim: string;
      participantes: number;
    };
    const ultimoDoPrimeiroDia = JSON.parse(corpoDeReservaParaIndice(1, 31, agoraBase, 30)) as {
      recursoId: number;
      inicio: string;
      fim: string;
      participantes: number;
    };
    const primeiroDoSegundoDia = JSON.parse(corpoDeReservaParaIndice(1, 32, agoraBase, 30)) as {
      recursoId: number;
      inicio: string;
      fim: string;
      participantes: number;
    };
    // Quinta (12/11 = 0), Sexta (13/11 = 1) -> pula Sábado (14/11) e Domingo (15/11) -> Segunda (16/11 = 2, índice 64):
    const primeiroDaSegunda = JSON.parse(corpoDeReservaParaIndice(1, 64, agoraBase, 30)) as {
      recursoId: number;
      inicio: string;
      fim: string;
      participantes: number;
    };

    expect(primeiro).toEqual({
      recursoId: 1,
      inicio: '2026-11-12T07:00:00-03:00',
      fim: '2026-11-12T07:30:00-03:00',
      participantes: 1,
    });
    expect(ultimoDoPrimeiroDia).toEqual({
      recursoId: 1,
      inicio: '2026-11-12T22:30:00-03:00',
      fim: '2026-11-12T23:00:00-03:00',
      participantes: 2,
    });
    expect(primeiroDoSegundoDia).toEqual({
      recursoId: 1,
      inicio: '2026-11-13T07:00:00-03:00',
      fim: '2026-11-13T07:30:00-03:00',
      participantes: 3,
    });
    expect(primeiroDaSegunda).toEqual({
      recursoId: 1,
      inicio: '2026-11-16T07:00:00-03:00',
      fim: '2026-11-16T07:30:00-03:00',
      participantes: 5,
    });
  });

  it('RN05 e RN08 · recicla os intervalos dentro da janela de 14 dias mesmo para milhares de requisições', () => {
    for (const indice of [0, 31, 64, 159, 255, 256, 512, 5000, 12737]) {
      const pedido = pedidoDeReservaParaIndice(1, indice, agoraBase, 40);
      const corpo = JSON.parse(pedido.corpo) as {
        recursoId: number;
        inicio: string;
        fim: string;
        participantes: number;
      };

      const inicioMs = new Date(corpo.inicio).getTime();
      const fimMs = new Date(corpo.fim).getTime();
      const antecedenciaMs = inicioMs - agoraBase.getTime();

      expect(fimMs - inicioMs).toBe(30 * 60 * 1000);
      expect(antecedenciaMs).toBeGreaterThanOrEqual(umaHoraMs);
      expect(antecedenciaMs).toBeLessThanOrEqual(14 * umDiaMs);
      expect(corpo.participantes).toBeGreaterThanOrEqual(1);
      expect(corpo.participantes).toBeLessThanOrEqual(40);
      expect(USUARIOS_DA_CARGA).toContain(pedido.usuario);
    }
  });

  it('RN07 · distribui as 10 conexões pelas vagas livres (POLITICA.cota - ativas) pulando quem está com a Cota cheia', () => {
    // Ana está com 3 ativas (seed + 2 do E2E -> 0 livres), Bruno tem 2 ativas (seed + Pedido #54 -> 1 livre),
    // Bia tem 1 ativa (2 livres) e Eduardo tem 0 ativas (10 livres):
    const distribuicao = distribuirConexoesPorVagas(
      [
        { email: 'ana.demo@unifesp.br', perfil: 'Aluno', ativas: 3 },
        { email: 'bruno.demo@unifesp.br', perfil: 'Aluno', ativas: 2 },
        { email: 'bia.demo@unifesp.br', perfil: 'Aluno', ativas: 1 },
        { email: 'eduardo.demo@unifesp.br', perfil: 'Docente', ativas: 0 },
      ],
      10,
      POLITICA,
    );

    const contagem = new Map<string, number>();
    for (const u of distribuicao) {
      contagem.set(u, (contagem.get(u) ?? 0) + 1);
    }

    expect(distribuicao).toHaveLength(10);
    expect(contagem.get('ana.demo@unifesp.br') ?? 0).toBe(0);
    expect(contagem.get('bruno.demo@unifesp.br')).toBe(1);
    expect(contagem.get('bia.demo@unifesp.br')).toBe(2);
    expect(contagem.get('eduardo.demo@unifesp.br')).toBe(7);
  });

  it('RNF12 e RN07 · cria e cancela cada Reserva da carga sem tocar nas pré-existentes e sem sujar o histograma', async () => {
    // Ana já começa com 3 Reservas ativas pré-existentes (IDs 1, 2 e 3: Cota cheia = 3).
    // Bruno começa com 2 pré-existentes (IDs 4 e 5: resta 1 vaga).
    const ativasPorId = new Map<number, { usuario: string; inicio: string }>([
      [1, { usuario: 'ana.demo@unifesp.br', inicio: '2026-11-03T10:00:00-03:00' }],
      [2, { usuario: 'ana.demo@unifesp.br', inicio: '2026-11-10T12:00:00-03:00' }],
      [3, { usuario: 'ana.demo@unifesp.br', inicio: '2026-11-11T12:00:00-03:00' }],
      [4, { usuario: 'bruno.demo@unifesp.br', inicio: '2026-11-10T10:00:00-03:00' }],
      [5, { usuario: 'bruno.demo@unifesp.br', inicio: '2026-11-10T12:00:00-03:00' }],
    ]);
    const idsPreExistentes = [1, 2, 3, 4, 5];

    let proximoId = 100;
    let totalCriadasPelaCarga = 0;
    let totalCanceladasPelaCarga = 0;
    let cancelouPreExistente = false;
    let violacoesDeCotaOuConflito = 0;

    const cotaMaxima: Record<string, number> = {
      'ana.demo@unifesp.br': POLITICA.cota.Aluno,
      'bruno.demo@unifesp.br': POLITICA.cota.Aluno,
      'bia.demo@unifesp.br': POLITICA.cota.Aluno,
      'eduardo.demo@unifesp.br': POLITICA.cota.Docente,
    };

    const servidor = createServer((req, res) => {
      const cookie = req.headers.cookie ?? '';
      const usuario = cookie.replace('sessao=', '');

      if (req.method === 'GET' && req.url?.startsWith('/api/reservas?situacao=ativas')) {
        const itens = [...ativasPorId.entries()]
          .filter(([, r]) => r.usuario === usuario)
          .map(([id]) => ({ id }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ itens, total: itens.length, pagina: 1, porPagina: 20 }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/reservas') {
        const pedacos: Buffer[] = [];
        req.on('data', (c: Buffer) => pedacos.push(c));
        req.on('end', () => {
          const texto = Buffer.concat(pedacos).toString('utf8');
          if (!texto) return;
          const corpo = JSON.parse(texto) as {
            inicio: string;
            participantes?: number;
          };
          const usadas = [...ativasPorId.values()].filter((r) => r.usuario === usuario).length;
          const limite = cotaMaxima[usuario] ?? 0;
          const conflito = [...ativasPorId.values()].some((r) => r.inicio === corpo.inicio);

          if (
            usadas >= limite ||
            conflito ||
            !corpo.participantes ||
            corpo.participantes < 1 ||
            corpo.participantes > 25
          ) {
            violacoesDeCotaOuConflito++;
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ erro: 'regra_violada' }));
            return;
          }

          const id = proximoId++;
          ativasPorId.set(id, { usuario, inicio: corpo.inicio });
          totalCriadasPelaCarga++;
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id }));
        });
        return;
      }

      const matchCancelamento = req.url?.match(/^\/api\/reservas\/(\d+)\/cancelamento$/);
      if (req.method === 'POST' && matchCancelamento) {
        const id = Number(matchCancelamento[1]);
        if (idsPreExistentes.includes(id)) {
          cancelouPreExistente = true;
        }
        const reserva = ativasPorId.get(id);
        if (!reserva || reserva.usuario !== usuario) {
          res.writeHead(404);
          res.end();
          return;
        }
        ativasPorId.delete(id);
        totalCanceladasPelaCarga++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reserva: { id, status: 'Cancelada' }, penalidade: null }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    try {
      const endereco = servidor.address();
      if (!endereco || typeof endereco === 'string') throw new Error('Endereço inválido');
      const urlBase = `http://127.0.0.1:${endereco.port}`;

      const cookiesPorUsuario = new Map(USUARIOS_DA_CARGA.map((u) => [u, `sessao=${u}`] as const));

      const resultado = await medirCriarECancelarReservas({
        urlBase,
        recursoId: 1,
        capacidade: 25,
        cookiesPorUsuario,
        agora: agoraBase,
        conexoes: 4,
        duracaoSegundos: 1,
      });

      expect(resultado.respostas2xx).toBeGreaterThan(0);
      expect(resultado.nao2xx).toBe(0);
      expect(resultado.erros).toBe(0);
      expect(violacoesDeCotaOuConflito).toBe(0);
      expect(cancelouPreExistente).toBe(false);
      // O histograma do autocannon contou apenas os POST /api/reservas:
      expect(resultado.respostas2xx).toBeLessThanOrEqual(totalCriadasPelaCarga);
      expect(resultado.respostas2xx).toBeGreaterThanOrEqual(totalCriadasPelaCarga - 4);
      // As 5 Reservas pré-existentes continuam intocadas, e todas as criadas pela carga foram canceladas:
      expect([...ativasPorId.keys()].sort((a, b) => a - b)).toEqual(idsPreExistentes);
      expect(totalCanceladasPelaCarga).toBe(totalCriadasPelaCarga);
    } finally {
      await new Promise<void>((resolve) => servidor.close(() => resolve()));
    }
  });
});
