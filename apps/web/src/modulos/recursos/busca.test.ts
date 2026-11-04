import { describe, expect, it } from 'vitest';
import {
  consultaDaBusca,
  FILTROS_VAZIOS,
  filtrosDaUrl,
  semanaDaData,
  urlDosFiltros,
  type FiltrosDaBusca,
} from './busca';

const tudo: FiltrosDaBusca = {
  tipo: 'Espaco',
  capacidadeMin: 40,
  q: 'lab',
  data: '2026-11-10',
  inicio: 10 * 60,
  fim: 12 * 60,
};

describe('US06 · Filtros da busca', () => {
  it('sem filtro, a consulta vai vazia', () => {
    expect(consultaDaBusca(FILTROS_VAZIOS)).toBe('');
  });

  it('o Intervalo vai em ISO com o deslocamento de São Paulo', () => {
    expect(Object.fromEntries(new URLSearchParams(consultaDaBusca(tudo)))).toEqual({
      tipo: 'Espaco',
      capacidadeMin: '40',
      q: 'lab',
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
    });
  });

  it('fim 24:00 é a meia-noite do dia seguinte', () => {
    const consulta = new URLSearchParams(
      consultaDaBusca({ ...tudo, inicio: 23 * 60, fim: 24 * 60 }),
    );
    expect(consulta.get('fim')).toBe('2026-11-11T00:00:00-03:00');
  });

  it('sem a data, o início ou o fim, a busca vai sem Intervalo', () => {
    const consulta = new URLSearchParams(consultaDaBusca({ ...tudo, fim: null }));
    expect(consulta.has('inicio')).toBe(false);
    expect(consulta.has('fim')).toBe(false);
  });

  it('texto só com espaços não filtra', () => {
    expect(consultaDaBusca({ ...FILTROS_VAZIOS, q: '   ' })).toBe('');
  });

  it('os filtros vão e voltam da URL da tela', () => {
    expect(filtrosDaUrl(urlDosFiltros(tudo))).toEqual(tudo);
    expect(filtrosDaUrl(new URLSearchParams())).toEqual(FILTROS_VAZIOS);
  });

  it('valores estranhos na URL da tela viram filtro vazio', () => {
    const url = new URLSearchParams({ tipo: 'Nave', capacidadeMin: 'muita', inicio: 'x' });
    expect(filtrosDaUrl(url)).toEqual(FILTROS_VAZIOS);
  });

  it('a agenda abre na semana da data buscada (segunda)', () => {
    expect(semanaDaData('2026-11-10')).toBe('2026-11-09');
    expect(semanaDaData('2026-11-15')).toBe('2026-11-09');
    expect(semanaDaData('2026-11-16')).toBe('2026-11-16');
  });
});
