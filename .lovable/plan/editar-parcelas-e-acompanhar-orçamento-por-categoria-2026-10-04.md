# Editar parcelas e acompanhar orçamento por categoria

## Resultado esperado

- Em **Parcelas**, cada compra parcelada e assinatura terá a opção **Editar**, inclusive no histórico. O formulário abrirá com os dados atuais e permitirá alterar nome, tipo, data da primeira cobrança, quantidade de parcelas e valor. Ao salvar, a lista, o limite mensal e a Visão Futura refletirão a alteração sem criar outra compra.
- Em **Lançamentos**, incluir um comparativo mensal **Orçamento x Real por categoria**. Para cada categoria, o usuário poderá definir ou alterar um limite mensal em R$; a tela mostrará o valor lançado no mês, a diferença e uma barra de progresso, destacando gastos acima do orçamento. Meses sem lançamentos mostrarão gasto zero; categorias sem limite definido ficarão claramente identificadas.
- Um seletor de mês e ano permitirá consultar o comparativo de meses anteriores ou futuros, sem alterar os filtros já existentes para a lista e os gráficos de Lançamentos. O orçamento definido para uma categoria será recorrente em todos os meses, até ser alterado.

## Detalhes técnicos

- Adicionar uma função autenticada de atualização de `installments` por ID e `user_id`, com as mesmas validações do cadastro e tratamento correto da assinatura recorrente; reutilizar o formulário existente em modo criar/editar, inclusive para compras quitadas, e invalidar os dados de parcelas e projeção após salvar.
- Adicionar `monthly_budget` opcional a `expense_categories`, mantendo os dados existentes e as políticas de acesso atuais. Persistir alterações com função autenticada, validação de número finito não negativo e escopo do usuário.
- Consultar as saídas de `month_check_rows` do mês selecionado por `category_id` e somar `valor` independentemente de `quitado`, sem incluir entradas, itens de planejamento de `checklist_items` ou parcelas separadas, evitando contagem dupla. Incluir categorias sem gastos, preservar o comportamento de exclusão de categoria e atualizar a comparação após mudanças em lançamentos/categorias/orçamento.
- Validar edição de parcela ativa e quitada, mudança de tipo, atualização do limite e da Visão Futura; testar orçamento acima/abaixo do realizado, troca de mês e visual em telas estreitas.
