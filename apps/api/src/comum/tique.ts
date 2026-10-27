/**
 * Roda `tarefa` a cada `intervaloMs` (o tique de 1 min do #12) e devolve a função que para.
 * Um tique não começa enquanto o anterior não terminou, e uma falha não derruba os seguintes.
 */
export function iniciarTique(
  tarefa: () => Promise<unknown>,
  intervaloMs: number,
  aoFalhar: (erro: unknown) => void,
): () => void {
  let rodando = false;
  const timer = setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      await tarefa();
    } catch (erro) {
      aoFalhar(erro);
    } finally {
      rodando = false;
    }
  }, intervaloMs);
  // O tique não segura o processo aberto sozinho.
  timer.unref();
  return () => clearInterval(timer);
}
