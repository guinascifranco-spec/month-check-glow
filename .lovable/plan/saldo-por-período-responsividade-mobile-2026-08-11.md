# Saldo por período + responsividade mobile

## 1. Card "Saldo disponível por período" (Conferência)

Novo card logo abaixo dos cards de resumo (Entradas, Saídas, Saldo do mês).

Cálculo:
- Saldo = total de entradas − total de saídas do mês exibido.
- Dias restantes = do dia de hoje até o último dia do mês (incluindo hoje).
- Semanas restantes = dias restantes ÷ 7 arredondado para baixo, mínimo 1.
- Se hoje for o último dia do mês: mostra "Último dia do mês".
- Quando o mês exibido não é o mês corrente (navegação para outro mês), o card usa o total de dias daquele mês como base e indica que é uma referência do mês inteiro.

Layout:
- Título "Saldo disponível por período" + subtítulo cinza "Faltam X dias para o fim do mês".
- Dois sub-cards neumórficos lado a lado (grid-cols-2 também no mobile):
  - Por dia — ícone CalendarDays, valor saldo ÷ dias restantes, auxiliar "para os próximos X dias".
  - Por semana — ícone CalendarRange, valor saldo ÷ semanas restantes, auxiliar "para as próximas X semanas" / "próxima semana".

Cores e estados:
- Positivo: verde (token success/primary).
- Negativo: vermelho + aviso "⚠️ Saldo negativo — revise seus gastos".
- Zero: cinza + "Saldo zerado para este mês".
- Skeleton neumórfico enquanto os dados do mês carregam.

## 2. Responsividade mobile (375–430px)

Aplicada às quatro páginas existentes: Conferência, Visão Geral, Parcelas, Investimentos.

Navegação:
- Barra fixa inferior no mobile com ícones + rótulos curtos (Conferência, Visão, Parcelas, Invest.), item ativo em destaque, respeitando a safe-area do iPhone.
- Abas atuais no topo continuam a partir de `lg:`.
- Espaçamento extra no fim das páginas para o conteúdo não ficar sob a barra.

Conferência:
- Cards de resumo em grid-cols-2 no mobile.
- Tabela de lançamentos vira cards empilhados no mobile (descrição, valor, tipo, quitado, arrastar, excluir), tabela mantida a partir de `md:`.
- Gráficos com altura reduzida (~200px) e largura total no mobile.

Visão Geral:
- Cards de patrimônio em grid-cols-2 no mobile.
- Tabela de investimentos vira cards empilhados (categoria, saldo, rendimento %) com ações como ícones compactos à direita.
- Gráficos em 100% da largura com altura reduzida.

Parcelas:
- Cards de resumo em grid-cols-2; barra de limite em largura total.
- Compras ativas e histórico como cards empilhados, um por linha, com informações compactas.

Investimentos:
- Cards de dashboard em grid-cols-2 no mobile.
- Listas de ativos/aportes/proventos como cards empilhados, com badge de tipo e ações em ícones.
- Gráfico de evolução com altura reduzida no mobile.

Modais:
- Todos os diálogos abrem como bottom sheet no mobile (deslizando de baixo, até 90% da altura, cantos arredondados no topo, conteúdo rolável) e como modal centralizado no desktop.
- Botões confirmar/cancelar fixos no rodapé do sheet.

Tipografia, toque e espaçamento:
- Padding dos cards p-4 no mobile, p-6 a partir de `sm:`.
- Títulos text-xl no mobile / text-2xl no desktop; valores principais text-2xl / text-3xl.
- Botões, inputs e selects com altura mínima de 44px no mobile.
- Nenhum scroll horizontal: containers de texto com `min-w-0`/`truncate`, ícones com `shrink-0`, cabeçalhos em grid duas colunas no mobile.

## Detalhes técnicos

- Novo componente `src/components/mobile-nav.tsx` (barra inferior) usando `Link` do TanStack Router; `PageTabs` recebe `hidden lg:inline-flex`.
- Novo componente `src/components/period-balance-card.tsx`, puro em props (saldo + data de referência), sem chamadas ao backend.
- Componente auxiliar de responsividade nos diálogos: classes condicionais no `DialogContent` (`max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[90vh] ...`) — sem trocar de biblioteca.
- Sem alterações de banco de dados nem de server functions; todo o trabalho é de UI.
