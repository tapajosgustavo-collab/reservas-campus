import { expect, test } from '@playwright/test';
import {
  conferirSemRolagemHorizontal,
  emSaoPaulo,
  janelaDoCheckIn,
  proximoIntervaloReservavel,
} from './ajudantes';

// O relógio da demo é um só para todos os testes: o E2E de Check-in reserva o primeiro Intervalo
// que a Política aceita a partir do `agora` do servidor e só avança até a janela dele.
test.describe('RN05 · Primeiro Intervalo que a Antecedência mínima aceita', () => {
  test('agora às 08:00 → 09:00–09:30 (1h de Antecedência vale)', () => {
    const { inicio, fim } = proximoIntervaloReservavel('2026-11-10T08:00:00-03:00');

    expect(inicio.toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-10T12:30:00.000Z');
  });

  test('agora às 08:45:30 → 10:00–10:30 (pula para a próxima meia hora)', () => {
    const { inicio, fim } = proximoIntervaloReservavel('2026-11-10T08:45:30-03:00');

    expect(inicio.toISOString()).toBe('2026-11-10T13:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-10T13:30:00.000Z');
  });
});

test.describe('RN14 · Janela de Check-in', () => {
  test('Reserva às 10h → a janela abre às 9h45', () => {
    expect(janelaDoCheckIn(new Date('2026-11-10T10:00:00-03:00')).toISOString()).toBe(
      '2026-11-10T12:45:00.000Z',
    );
  });
});

test.describe('RNF08 · Instante em São Paulo', () => {
  test('mostra o campo da barra do relógio e o rótulo de Minhas reservas no fuso de lá', () => {
    // 01:30 em UTC ainda é o dia anterior em São Paulo.
    expect(emSaoPaulo(new Date('2026-11-12T01:30:00.000Z'))).toEqual({
      campo: '2026-11-11T22:30',
      data: '11/11/2026',
      hora: '22:30',
    });
  });
});

// Confere o próprio helper, sem a app: páginas montadas na hora.
test.describe('RNF07 · Página sem rolagem horizontal', () => {
  test('recusa a página mais larga que a janela', async ({ page }) => {
    await page.setContent('<div style="width: 2000px">largo</div>');

    await expect(conferirSemRolagemHorizontal(page)).rejects.toThrow('a página rola na horizontal');
  });

  test('aceita o que rola dentro do seu quadro, como a grade da agenda', async ({ page }) => {
    await page.setContent(
      '<div style="overflow-x: auto"><div style="width: 2000px">grade</div></div>',
    );

    await conferirSemRolagemHorizontal(page);
  });
});
