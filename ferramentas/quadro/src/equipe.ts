// Quem é responsável por cada módulo e quem revisa os PRs dele (rodízio do §4 dos requisitos).
// Mudou a equipe ou o rodízio? Mude só aqui e rode `npm run quadro` de novo.

export const REPO = 'tapajosgustavo-collab/reservas-campus';

export type Pessoa = {
  nome: string;
  login: string;
  modulo: string;
  label: string;
  revisor: string;
};

export const EQUIPE: Pessoa[] = [
  {
    nome: 'Kaio',
    login: 'KaioAlexandreFernandes',
    modulo: 'M1 Usuários e conduta',
    label: 'M1 conduta',
    revisor: 'Gustavo',
  },
  {
    nome: 'Gustavo',
    login: 'tapajosgustavo-collab',
    modulo: 'M2 Recursos e disponibilidade',
    label: 'M2 recursos',
    revisor: 'Rafael',
  },
  {
    nome: 'Rafael',
    login: 'rafael-figueredo',
    modulo: 'M3 Motor de reservas',
    label: 'M3 reservas',
    revisor: 'Guilherme',
  },
  {
    nome: 'Guilherme',
    login: 'gpombotky',
    modulo: 'M4 Ciclo de vida',
    label: 'M4 ciclo',
    revisor: 'Kaio',
  },
];
