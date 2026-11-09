import { Alert, List } from '@mantine/core';
import { useEffect } from 'react';
import { ErroDaApi } from '../../comum/api';
import { linhaDaViolacao } from '../../comum/violacoes';
import { useSessao } from '../conduta';

export function Erro({ erro }: { erro: Error }) {
  const violacoes = erro instanceof ErroDaApi ? erro.violacoes : [];
  return (
    <Alert color="red" role="alert" p="xs">
      {violacoes.length === 0 ? (
        erro.message
      ) : (
        <List size="sm">
          {violacoes.map((violacao, i) => (
            <List.Item key={i}>{linhaDaViolacao(violacao)}</List.Item>
          ))}
        </List>
      )}
    </Alert>
  );
}

/** Folga para o relógio do navegador adiantado: na borda, a API já tem que ter chegado lá. */
const FOLGA_MS = 1000;
/** O `setTimeout` estoura acima de ~24,8 dias e dispararia na hora; um dia basta para reagendar. */
const ESPERA_MAXIMA_MS = 24 * 60 * 60 * 1000;

/**
 * Com a tela parada, o `agora` da sessão envelhece. Quando a janela abre ou fecha, consulta a
 * sessão de novo para o botão aparecer ou sumir sem recarregar. Com o relógio da demo parado, a
 * resposta traz o mesmo `agora` e nada mais é agendado.
 */
export function useAgoraEmDiaNaBorda(espera: number | null) {
  const { refetch: consultarAgora } = useSessao();
  useEffect(() => {
    if (espera === null) return;
    const id = setTimeout(
      () => void consultarAgora(),
      Math.min(espera + FOLGA_MS, ESPERA_MAXIMA_MS),
    );
    return () => clearTimeout(id);
  }, [espera, consultarAgora]);
}
