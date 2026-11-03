# Calendário Financeiro Inteligente

## O que existe e será reaproveitado
- Ciclo financeiro do dia 2 ao dia 1 já centralizado (`getFinancialCycle`) — o calendário usa esse ciclo, sem criar outro.
- Gastos reais com data: Lançamentos (já com parte pessoal das faturas, compras no cartão pela data da compra, pagamento de fatura neutro).
- Compromissos previstos: itens da Conferência (fixos/receitas do mês) e Parcelas.
- Contas, carteira VA, transferências e faturas: já existem, mas hoje não há contas nem saldos iniciais cadastrados.
- Não existe cadastro de metas/reservas.

## Regra de cálculo (função única e testada)
```text
Orçamento variável do ciclo = receitas previstas do ciclo
                              - despesas fixas e parcelas previstas
                              - valor reservado (metas)
Planejado por dia (base)     = orçamento variável / dias do ciclo
Para cada dia d:
  disponível(d) = (orçamento variável - gasto variável antes de d)
                  / dias restantes a partir de d
  saldo do dia  = disponível(d) - gasto(d)
  amanhã        = recálculo com o gasto de hoje
```
- Gastar menos aumenta automaticamente os dias seguintes; gastar mais os reduz.
- Status: verde abaixo de 80%, amarelo 80–100%, vermelho acima.
- Orçamento restante negativo: mostra "faltam R$ X no ciclo" e quanto economizar por dia sobre o planejado; se impossível, diz claramente, sem valores diários negativos.
- Limite do cartão nunca conta como dinheiro; pagamento de fatura e transferências ficam fora.
- Quando houver contas com saldo cadastrado, o saldo atual aparece como referência de caixa (não substitui o orçamento).
- Distribuição: "igual entre dias restantes" (padrão). Outras distribuições ficam fora desta versão para não inventar regras.

## Tela
- Novo item "Calendário" no menu lateral (grupo Planejamento).
- Topo enxuto: Disponível hoje, Gasto hoje, Seu orçamento de amanhã (com a mensagem baseada nos dados reais).
- Calendário mensal (grade no desktop; lista compacta de dias no celular), navegação ◀ ▶ por ciclo, inclusive passados.
- Ao tocar um dia: painel com lançamentos do dia (link para Lançamentos), planejado, gasto, restante e impacto nos próximos dias.
- Linha de situação do ciclo: receitas previstas, gasto realizado, compromissos futuros, orçamento variável restante, economia/excesso acumulado, saldo projetado no fim.
- Simulador "E se eu gastar R$ X?": mostra novo limite diário, redução por dia e se o ciclo fica negativo. Não registra nada.
- Campo opcional "Reservar para metas neste ciclo".

## Dados
- Uma única tabela nova e pequena para preferências do calendário (valor reservado por usuário), com acesso só do próprio dono. Nenhuma tabela existente é alterada e nenhum dado é modificado.

## Testes
- Testes da função de cálculo: dia sem gasto, excesso de R$ 40 reduzindo amanhã, economia compensando, receita futura, parcelas, pagamento de fatura ignorado, transferência ignorada, edição/exclusão, ciclo negativo recuperável e irrecuperável, troca de ciclo (dia 1 x dia 2).
- Conferência visual autenticada desktop/celular comparando totais do calendário com Lançamentos e Conferência do mesmo ciclo.

## Detalhes técnicos
- `src/lib/daily-budget.ts` (lógica pura) + `daily-budget.test.ts`.
- `src/lib/daily-budget.functions.ts` (leitura autenticada reaproveitando consultas existentes).
- `src/routes/_authenticated/calendario.tsx`, item em `app-sidebar.tsx`.
- Migração: `calendar_preferences(user_id pk, reserved_amount numeric default 0)` com GRANT + RLS do dono.
