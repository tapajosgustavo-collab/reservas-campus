import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Regras de arquitetura do ADR 0001 e do AGENTS.md, com regras nativas do ESLint.
// O teste delas está em apps/api/src/arquitetura.test.ts.

const MODULOS = ['conduta', 'recursos', 'reservas', 'ciclo'];
const SEM_RELOGIO = 'O núcleo não lê o relógio: o agora chega por parâmetro.';
const SEM_IDS = 'O núcleo não gera ids: eles vêm do banco.';

// Depois do nome do módulo, só a fachada: nada, "index" ou "index.ts(x)".
const FACHADA = /(?!(index(\.tsx?)?)?$)/.source;
const SUBIR = /^(\.\.\/)+/.source;

// Um módulo só importa outro pelo index.ts dele.
const arquivoInternoDe = (modulos) => [
  {
    regex: `(^|/)modulos/(${modulos.join('|')})/${FACHADA}`,
    message: 'Importe o outro módulo só pelo index.ts dele.',
  },
  {
    regex: `${SUBIR}(${modulos.join('|')})/${FACHADA}`,
    message: 'Importe o outro módulo só pelo index.ts dele.',
  },
];

const IMPORTS_PROIBIDOS_NO_NUCLEO = {
  paths: [
    { name: 'node:crypto', message: SEM_IDS },
    { name: 'crypto', message: SEM_IDS },
  ],
  patterns: [
    {
      regex: /^@prisma\/|(^|\/)\.?prisma(\/|$)/.source,
      message: 'O núcleo não usa o Prisma: a casca carrega os fatos.',
    },
    {
      regex: '^(fastify|@fastify/|fastify-)',
      message: 'O núcleo não conhece o Fastify: as rotas ficam na casca.',
    },
    {
      regex: '(^|/)casca(/|$)',
      message: 'O núcleo não importa a casca: é a casca que chama o núcleo.',
    },
  ],
};

const SINTAXE_PROIBIDA_NO_NUCLEO = [
  ...[
    "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    "NewExpression[callee.name='Date'][arguments.length=0]",
    "CallExpression[callee.name='Date']",
    "MemberExpression[object.name='performance']",
  ].map((selector) => ({ selector, message: SEM_RELOGIO })),
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'O núcleo não sorteia nada: o resultado tem que ser o mesmo a cada chamada.',
  },
  {
    selector:
      "MemberExpression[object.name='crypto'][property.name=/^(randomUUID|getRandomValues)$/]",
    message: SEM_IDS,
  },
  {
    // Fecha os atalhos para as proibições acima (globalThis.Date.now(), process.hrtime()...).
    selector: 'MemberExpression[object.name=/^(globalThis|global|window|self|process)$/]',
    message: 'O núcleo não acessa o ambiente: tudo o que ele usa chega por parâmetro.',
  },
  {
    selector: 'ImportExpression',
    message: 'O núcleo não faz import dinâmico: as dependências ficam visíveis no topo.',
  },
];

const regrasPorModulo = MODULOS.flatMap((modulo) => {
  const outros = MODULOS.filter((m) => m !== modulo);
  return [
    {
      files: [`apps/*/src/modulos/${modulo}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': ['error', { patterns: arquivoInternoDe(outros) }],
      },
    },
    {
      files: [`apps/api/src/modulos/${modulo}/nucleo/**/*.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: IMPORTS_PROIBIDOS_NO_NUCLEO.paths,
            patterns: [...arquivoInternoDe(outros), ...IMPORTS_PROIBIDOS_NO_NUCLEO.patterns],
          },
        ],
        'no-restricted-syntax': ['error', ...SINTAXE_PROIBIDA_NO_NUCLEO],
        'no-console': 'error',
      },
    },
  ];
});

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', '.claude/', '.obsidian/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: { globals: globals.node },
    rules: {
      // Os testes conferem o resultado, não se algo foi chamado: o único dublê é o RelogioFixo.
      'no-restricted-properties': [
        'error',
        ...['mock', 'doMock', 'spyOn'].map((property) => ({
          object: 'vi',
          property,
          message: 'Sem vi.mock/vi.spyOn: confira o resultado, não a chamada.',
        })),
      ],
    },
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: arquivoInternoDe(MODULOS) }],
    },
  },
  ...regrasPorModulo,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },
  prettier,
);
