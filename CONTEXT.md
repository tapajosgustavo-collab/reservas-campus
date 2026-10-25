# Reservas do Campus

Sistema em que alunos e docentes da UNIFESP reservam espaços e equipamentos do campus, e em que gestores aprovam pedidos e acompanham o uso.

## Pessoas

**Usuário**:
Pessoa com acesso ao sistema, identificada pelo e-mail institucional. Todo Usuário tem exatamente um Perfil.
_Evitar_: conta, pessoa, cliente

**Perfil**:
Papel do Usuário que define o que ele pode fazer e quais limites da Política se aplicam a ele: Aluno, Docente ou Gestor.
_Evitar_: tipo de usuário, cargo, role

**Aluno**:
Usuário matriculado. Faz Reservas avulsas com os limites mais restritos.
_Evitar_: estudante, discente

**Docente**:
Usuário professor. Tem limites maiores que o Aluno e é o único que pode criar Séries.
_Evitar_: professor (na interface pode aparecer, no código e nos documentos usar Docente)

**Gestor**:
Usuário responsável por um conjunto de Recursos: cadastra os Recursos, decide os Pedidos de Recursos restritos e registra Devoluções.
_Evitar_: admin, administrador, responsável

## Recursos

**Recurso**:
Qualquer coisa que pode ser reservada. É sempre um Espaço ou um Equipamento.
_Evitar_: item, bem, ativo

**Espaço**:
Recurso físico onde as pessoas ficam durante o uso, como sala, laboratório ou auditório. Tem Capacidade.
_Evitar_: sala (sala é só um tipo de Espaço), local, ambiente

**Equipamento**:
Recurso móvel que é retirado e precisa ser devolvido, como projetor ou notebook. Cada Equipamento é uma unidade física única, identificada pelo número de patrimônio.
_Evitar_: material, dispositivo, item

**Capacidade**:
Número máximo de pessoas que um Espaço comporta.
_Evitar_: lotação, tamanho

**Recurso restrito**:
Recurso cujas Reservas só valem depois de aprovadas por um Gestor.
_Evitar_: recurso especial, recurso protegido

**Horário de funcionamento**:
Faixas da semana em que um Recurso pode ser usado, como segunda a sexta das 7h às 23h.
_Evitar_: expediente, disponibilidade

**Indisponibilidade**:
Intervalo definido por um Gestor em que o Recurso não pode ser reservado, como manutenção ou evento institucional.
_Evitar_: bloqueio (bloqueio fica para Suspensão de Usuário), manutenção

## Reservas

**Reserva**:
Direito de um Usuário de usar um Recurso durante um Intervalo.
_Evitar_: agendamento, booking, locação

**Intervalo**:
Período com início e fim, no mesmo dia, em múltiplos de 30 minutos. Dois Intervalos que só se encostam (10h–12h e 12h–14h) não se sobrepõem.
_Evitar_: horário, período, slot

**Pedido**:
Reserva em Recurso restrito que ainda aguarda decisão do Gestor (status Pendente).
_Evitar_: solicitação, requisição

**Reserva ativa**:
Reserva com status Pendente, Confirmada ou Em uso. Só Reservas ativas ocupam o Recurso e contam na Cota.
_Evitar_: reserva válida, reserva aberta

**Conflito**:
Situação em que duas Reservas ativas do mesmo Recurso têm Intervalos que se sobrepõem.
_Evitar_: choque, colisão, sobreposição

**Série**:
Conjunto de Reservas de um Docente, no mesmo Recurso e no mesmo Intervalo, repetidas toda semana até uma data final. Cada repetição é uma Reserva própria, chamada de Ocorrência.
_Evitar_: reserva recorrente, reserva fixa, evento

**Ocorrência**:
Cada uma das Reservas que formam uma Série.
_Evitar_: instância, repetição

## Ciclo de vida da Reserva

**Status**:
Situação da Reserva: Pendente, Confirmada, Recusada, Expirada, Cancelada, Em uso, Concluída ou Não comparecimento.
_Evitar_: estado, situação

**Aprovação**:
Decisão do Gestor que torna Confirmada uma Reserva Pendente.
_Evitar_: aceite, deferimento

**Recusa**:
Decisão do Gestor, com justificativa obrigatória, que encerra uma Reserva Pendente.
_Evitar_: rejeição, indeferimento, negação

**Expiração**:
Encerramento automático de um Pedido que não foi decidido até o Prazo de decisão.
_Evitar_: vencimento, timeout

**Cancelamento**:
Encerramento de uma Reserva ativa antes do início do uso, feito pelo próprio Usuário ou pelo sistema quando surge uma Indisponibilidade.
_Evitar_: desistência, exclusão

**Cancelamento tardio**:
Cancelamento feito pelo Usuário com menos antecedência do que a Política permite sem Penalidade.
_Evitar_: cancelamento em cima da hora

**Check-in**:
Registro de que o uso começou: o Usuário chegou ao Espaço ou retirou o Equipamento. Muda a Reserva para Em uso.
_Evitar_: entrada, retirada, confirmação de presença

**Tolerância**:
Tempo após o início do Intervalo em que o Check-in ainda é aceito.
_Evitar_: atraso permitido, margem

**Não comparecimento**:
Status da Reserva Confirmada sem Check-in até o fim da Tolerância. Libera o Recurso e gera Penalidade.
_Evitar_: falta, no-show, ausência

**Devolução**:
Registro, feito pelo Gestor, de que o Equipamento voltou. Encerra a Reserva de Equipamento.
_Evitar_: entrega, retorno

## Política e conduta

**Política**:
Conjunto de limites aplicados a cada Perfil: Antecedência, Duração máxima, Cota, Tolerância, Prazo de decisão e as regras de Penalidade e Suspensão.
_Evitar_: regras, configuração, parâmetros

**Antecedência**:
Tempo entre a criação da Reserva e o início do Intervalo. A Política define um mínimo e um máximo por Perfil.
_Evitar_: prazo, janela

**Duração máxima**:
Maior Intervalo que um Perfil pode reservar de uma vez em um tipo de Recurso.
_Evitar_: tempo máximo, limite de horas

**Cota**:
Número máximo de Reservas ativas que um Usuário pode ter ao mesmo tempo.
_Evitar_: limite, quota, franquia

**Prazo de decisão**:
Antecedência mínima, em relação ao início, até a qual o Gestor precisa decidir um Pedido antes da Expiração.
_Evitar_: SLA, prazo de aprovação

**Penalidade**:
Registro de mau uso no histórico do Usuário, gerado por Não comparecimento, Cancelamento tardio ou Devolução atrasada.
_Evitar_: advertência, multa, falta, strike

**Suspensão**:
Período em que o Usuário não pode criar Reservas, aplicado quando ele acumula Penalidades demais em pouco tempo.
_Evitar_: bloqueio, banimento, punição

**Notificação**:
Mensagem que o sistema envia ao Usuário sobre algo que aconteceu com as Reservas dele ou com a conduta dele.
_Evitar_: alerta, aviso, e-mail
