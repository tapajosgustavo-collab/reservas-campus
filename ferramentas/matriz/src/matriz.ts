// Monta a matriz RN → testes (RNF01), sem I/O: quem lê os arquivos e escreve o resumo é o gerar.ts.

export type RegraDeNegocio = { id: string; nome: string };

/** O relatório do `--reporter=json` do Vitest, só com o que a matriz usa. */
export type RelatorioDoVitest = {
  testResults: { assertionResults: { fullName: string; status: string }[] }[];
};

export type ResultadoDeTeste = { nome: string; status: 'passou' | 'falhou' | 'pulado' };

export type LinhaDaMatriz = RegraDeNegocio & {
  passaram: number;
  falharam: number;
  pulados: number;
};

export type Matriz = {
  linhas: LinhaDaMatriz[];
  /** RNs citadas em testes que não estão nos requisitos (erro de digitação ou RN apagada). */
  desconhecidas: string[];
};

/** As RNs do `docs/requisitos.md`: os cabeçalhos `**RN01: Sem Conflito.**`, em ordem de id. */
export function regrasDosRequisitos(requisitos: string): RegraDeNegocio[] {
  const regras = [...requisitos.matchAll(/^\*\*(RN\d{2}): (.+?)\.\*\*/gm)].map(([, id, nome]) => ({
    id: id!,
    nome: nome!,
  }));
  return regras.sort((a, b) => a.id.localeCompare(b.id));
}

/** Os ids de RN citados no nome completo de um teste (`RN01 · …`, `RN07_…`), sem repetir. */
export function idsCitados(nomeDoTeste: string): string[] {
  return [...new Set(nomeDoTeste.match(/(?<![A-Za-z0-9])RN\d{2}(?!\d)/g) ?? [])];
}

export function resultadosDoVitest(relatorio: RelatorioDoVitest): ResultadoDeTeste[] {
  return relatorio.testResults.flatMap(({ assertionResults }) =>
    assertionResults.map(({ fullName, status }) => ({
      nome: fullName,
      status: status === 'passed' ? 'passou' : status === 'failed' ? 'falhou' : 'pulado',
    })),
  );
}

export function matriz(regras: RegraDeNegocio[], resultados: ResultadoDeTeste[]): Matriz {
  const linhas = new Map<string, LinhaDaMatriz>(
    regras.map((regra) => [regra.id, { ...regra, passaram: 0, falharam: 0, pulados: 0 }]),
  );
  const desconhecidas = new Set<string>();
  for (const { nome, status } of resultados) {
    for (const id of idsCitados(nome)) {
      const linha = linhas.get(id);
      if (!linha) {
        desconhecidas.add(id);
        continue;
      }
      if (status === 'passou') linha.passaram++;
      else if (status === 'falhou') linha.falharam++;
      else linha.pulados++;
    }
  }
  return { linhas: [...linhas.values()], desconhecidas: [...desconhecidas].sort() };
}

function situacao({ passaram, falharam, pulados }: LinhaDaMatriz): string {
  if (falharam > 0) return '❌ falhando';
  if (passaram > 0) return '✅ passando';
  if (pulados > 0) return '⏭️ só pulados';
  return '➖ sem teste';
}

/** A matriz em Markdown, para o resumo do job no GitHub Actions. */
export function matrizMd(suite: string, { linhas, desconhecidas }: Matriz): string {
  const passando = linhas.filter((l) => l.falharam === 0 && l.passaram > 0).length;
  return [
    `## Matriz RN → testes (${suite})`,
    '',
    `${passando} de ${linhas.length} RNs com teste passando.`,
    '',
    '| RN | Regra | Situação | Passaram | Falharam | Pulados |',
    '|---|---|---|---:|---:|---:|',
    ...linhas.map(
      (l) =>
        `| ${l.id} | ${l.nome} | ${situacao(l)} | ${l.passaram} | ${l.falharam} | ${l.pulados} |`,
    ),
    ...(desconhecidas.length > 0
      ? [
          '',
          `⚠️ Testes citam RNs que não estão no \`docs/requisitos.md\`: ${desconhecidas.join(', ')}.`,
        ]
      : []),
    '',
  ].join('\n');
}
