import { describe, expect, it } from 'vitest';
import { ErroDaApi } from '../../comum/api';
import {
  corDoPrazo,
  msAteMudarACor,
  podeConfirmarRecusa,
  resumoDoLote,
  rotuloDasPessoas,
} from './pedidos';

const AGORA = '2026-11-10T09:00:00-03:00';

const expirou = new ErroDaApi(422, 'regra_violada', 'Não foi possível concluir.', [
  { rn: 'RN12', nome: 'Expiração', mensagem: 'Este Pedido já expirou.' },
]);
const jaDecidido = new ErroDaApi(422, 'regra_violada', 'Não foi possível concluir.', [
  { rn: 'RN10', nome: 'Restrito começa Pendente', mensagem: 'Este Pedido já foi recusado.' },
]);

describe('US11 · Expira em na fila', () => {
  it('a 24h ou mais do Prazo de decisão → sem cor', () => {
    expect(corDoPrazo('2026-11-11T09:00:00-03:00', AGORA)).toBeNull();
  });

  it('a menos de 24h → amarelo', () => {
    expect(corDoPrazo('2026-11-11T08:59:00-03:00', AGORA)).toBe('yellow');
    expect(corDoPrazo('2026-11-10T11:00:00-03:00', AGORA)).toBe('yellow');
  });

  it('a menos de 2h, ou já passado → vermelho', () => {
    expect(corDoPrazo('2026-11-10T10:59:00-03:00', AGORA)).toBe('red');
    expect(corDoPrazo('2026-11-10T08:00:00-03:00', AGORA)).toBe('red');
  });
});

describe('US11 · Expira em com a tela parada', () => {
  const HORA = 60 * 60 * 1000;

  it('a próxima mudança de cor entre os Pedidos: o de 25h fica amarelo em 1h', () => {
    expect(msAteMudarACor(['2026-11-11T10:00:00-03:00', '2026-11-12T09:00:00-03:00'], AGORA)).toBe(
      HORA,
    );
  });

  it('o amarelo de 3h fica vermelho em 1h', () => {
    expect(msAteMudarACor(['2026-11-10T12:00:00-03:00'], AGORA)).toBe(HORA);
  });

  it('já vermelhos, ou fila vazia → nada a esperar', () => {
    expect(msAteMudarACor(['2026-11-10T10:00:00-03:00'], AGORA)).toBeNull();
    expect(msAteMudarACor([], AGORA)).toBeNull();
  });
});

describe('US11 · Aprovação em lote', () => {
  it('todos aprovados → "3 aprovados"', () => {
    expect(resumoDoLote([null, null, null])).toBe('3 aprovados');
    expect(resumoDoLote([null])).toBe('1 aprovado');
  });

  it('RN12 · 3 aprovados e 1 que expirou antes → "3 aprovados, 1 já tinha expirado"', () => {
    expect(resumoDoLote([null, expirou, null, null])).toBe('3 aprovados, 1 já tinha expirado');
    expect(resumoDoLote([expirou, expirou])).toBe('0 aprovados, 2 já tinham expirado');
  });

  it('as outras recusas da API contam à parte', () => {
    expect(resumoDoLote([null, jaDecidido, new Error('Falha de rede')])).toBe(
      '1 aprovado, 2 não puderam ser aprovados',
    );
    expect(resumoDoLote([null, null, expirou, jaDecidido])).toBe(
      '2 aprovados, 1 já tinha expirado, 1 não pôde ser aprovado',
    );
  });
});

describe('RN11 · Recusa justificada na tela', () => {
  it('o botão de Recusa só habilita com a justificativa escrita', () => {
    expect(podeConfirmarRecusa('')).toBe(false);
    expect(podeConfirmarRecusa('   ')).toBe(false);
    expect(podeConfirmarRecusa('Sem técnico no horário.')).toBe(true);
  });
});

describe('US11 · Pessoas/Capacidade na fila', () => {
  it('Espaço → participantes sobre a Capacidade; Equipamento → traço', () => {
    expect(rotuloDasPessoas({ participantes: 25, recurso: { capacidade: 30 } })).toBe('25/30');
    expect(rotuloDasPessoas({ participantes: null, recurso: { capacidade: 30 } })).toBe('—/30');
    expect(rotuloDasPessoas({ participantes: null, recurso: { capacidade: null } })).toBe('—');
  });
});
