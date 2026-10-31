// Leitura das configurações do GitHub em .github/, para os testes conferirem que elas
// continuam combinando com a equipe (equipe.ts) e com o CI (ci.yml).

// Quem o GitHub pede como revisor de um arquivo: vale a última linha do CODEOWNERS que casa.
// Cobre só os padrões que o nosso CODEOWNERS usa: `*`, `/pasta/`, `/arquivo` e `nome` solto.
export function quemRevisa(codeowners: string, arquivo: string): string[] {
  let donos: string[] = [];
  for (const linha of codeowners.split('\n')) {
    const [padrao, ...logins] = linha.trim().split(/\s+/);
    if (!padrao || padrao.startsWith('#')) continue;
    if (casa(padrao, arquivo)) donos = logins.map((login) => login.replace(/^@/, ''));
  }
  return donos;
}

// O nome de cada job do ci.yml, que é o nome do check no PR. Todo job do CI tem `name:` logo
// abaixo do id, com a indentação de 2 e 4 espaços do Prettier.
export function jobsDoCi(ciYml: string): string[] {
  const nomes = ciYml.replace(/\r/g, '').matchAll(/^ {2}[\w-]+:\n {4}name: (\S+)$/gm);
  return [...nomes].map(([, nome]) => nome!);
}

type Ruleset = {
  rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[];
};

// Os checks que o ruleset exige verdes antes do merge.
export function checksExigidos(ruleset: Ruleset): string[] {
  return ruleset.rules
    .filter((regra) => regra.type === 'required_status_checks')
    .flatMap((regra) => regra.parameters?.required_status_checks ?? [])
    .map((check) => check.context);
}

function casa(padrao: string, arquivo: string): boolean {
  if (padrao === '*') return true;
  // Um padrão fora desse subconjunto não pode passar calado: o teste deixaria de espelhar o GitHub.
  if (/[*?[]/.test(padrao) || (!padrao.startsWith('/') && padrao.includes('/')))
    throw new Error(`Padrão do CODEOWNERS que o quemRevisa não entende: ${padrao}`);
  if (!padrao.startsWith('/')) return arquivo.split('/').at(-1) === padrao;
  const caminho = padrao.slice(1);
  return caminho.endsWith('/') ? arquivo.startsWith(caminho) : arquivo === caminho;
}
