import { describe, expect, it } from 'vitest';
import {
  corpoDeReservaParaIndice,
  erroDeCargaMd,
  relatorioDeCargaMd,
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

  it('gera intervalos de 30 min sem sobreposição em dias úteis (seg–sex, 07h–23h)', () => {
    const primeiro = JSON.parse(corpoDeReservaParaIndice(1, 0)) as {
      recursoId: number;
      inicio: string;
      fim: string;
    };
    const ultimoDaSegunda = JSON.parse(corpoDeReservaParaIndice(1, 31)) as {
      inicio: string;
      fim: string;
    };
    const primeiroDaTerca = JSON.parse(corpoDeReservaParaIndice(1, 32)) as {
      inicio: string;
      fim: string;
    };
    const primeiroDaSegundaSeguinte = JSON.parse(corpoDeReservaParaIndice(1, 160)) as {
      inicio: string;
      fim: string;
    };

    expect(primeiro).toEqual({
      recursoId: 1,
      inicio: '2026-11-16T07:00:00-03:00',
      fim: '2026-11-16T07:30:00-03:00',
    });
    expect(ultimoDaSegunda).toEqual({
      recursoId: 1,
      inicio: '2026-11-16T22:30:00-03:00',
      fim: '2026-11-16T23:00:00-03:00',
    });
    expect(primeiroDaTerca).toEqual({
      recursoId: 1,
      inicio: '2026-11-17T07:00:00-03:00',
      fim: '2026-11-17T07:30:00-03:00',
    });
    // Pula sábado (21/11) e domingo (22/11):
    expect(primeiroDaSegundaSeguinte).toEqual({
      recursoId: 1,
      inicio: '2026-11-23T07:00:00-03:00',
      fim: '2026-11-23T07:30:00-03:00',
    });
  });

  it('formata mensagem de erro em Markdown quando a medição falha', () => {
    const md = erroDeCargaMd(new Error('Servidor indisponível'));
    expect(md).toContain('⚠️ **Falha ao medir carga:** Servidor indisponível');
  });
});
