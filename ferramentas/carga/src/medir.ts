// Ponto de entrada de `npm run carga`: executa carga leve (10 conexões por 30s) e publica Markdown.
import { appendFileSync } from 'node:fs';
import { erroDeCargaMd, medirCargaDoIncremento1, relatorioDeCargaMd } from './carga';

try {
  const medidas = await medirCargaDoIncremento1();
  const md = relatorioDeCargaMd(medidas);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${md}\n`);
  }
  console.log(md);
} catch (erro) {
  const mdErro = erroDeCargaMd(erro);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${mdErro}\n`);
  }
  console.error(mdErro);
  // O passo no CI tem `continue-on-error: true`: sair com 1 deixa o passo em alerta sem bloquear o job.
  process.exit(1);
}
