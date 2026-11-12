import { createTheme, DEFAULT_THEME, type MantineColorsTuple } from '@mantine/core';

function comTonsAcessiveis(
  paleta: MantineColorsTuple,
  substitutos: Partial<Record<number, string>>,
): MantineColorsTuple {
  return paleta.map((cor, indice) => substitutos[indice] ?? cor) as unknown as MantineColorsTuple;
}

export const tema = createTheme({
  primaryColor: 'blue',
  primaryShade: { light: 8, dark: 8 },
  autoContrast: true,
  respectReducedMotion: true,
  colors: {
    // No tema claro, o Mantine usa gray[6] para textos dimmed e rótulos secundários (como Divider).
    // #495057 (gray[7]) garante razão de contraste de 8.18:1 sobre branco (WCAG AA exige >= 4.5:1).
    gray: comTonsAcessiveis(DEFAULT_THEME.colors.gray, { 6: DEFAULT_THEME.colors.gray[7] }),
    // #c92a2a (red[9]) garante razão de contraste >= 5.10:1 sobre branco e sobre red[0].
    red: comTonsAcessiveis(DEFAULT_THEME.colors.red, {
      6: DEFAULT_THEME.colors.red[9],
      7: DEFAULT_THEME.colors.red[9],
      8: DEFAULT_THEME.colors.red[9],
    }),
    // #1b6e2d garante razão de contraste >= 5.85:1 sobre branco e sobre green[0].
    green: comTonsAcessiveis(DEFAULT_THEME.colors.green, {
      6: '#1b6e2d',
      7: '#1b6e2d',
      8: '#1b6e2d',
      9: '#1b6e2d',
    }),
    // O fundo do item ativo do menu com o mouse em cima (variante light, hover) é blue[2]. O
    // #a5d8ff padrão dá 4.02:1 com o texto blue[9]; #c3e3fd dá 4.56:1.
    blue: comTonsAcessiveis(DEFAULT_THEME.colors.blue, { 2: '#c3e3fd' }),
    yellow: comTonsAcessiveis(DEFAULT_THEME.colors.yellow, {
      6: '#8a5200',
      7: '#8a5200',
      8: '#8a5200',
      9: '#8a5200',
    }),
  },
  components: {
    CloseButton: {
      defaultProps: {
        'aria-label': 'Fechar',
      },
    },
    Modal: {
      defaultProps: {
        closeButtonProps: { 'aria-label': 'Fechar' },
      },
    },
    Alert: {
      defaultProps: {
        closeButtonLabel: 'Fechar',
      },
    },
  },
});
