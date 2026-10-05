# Conferência como central de fechamento mensal

## Mudanças na Conferência

1. Manter exatamente o cálculo atual de entradas, saídas e saldo planejado, deixando explícito nos três indicadores que se referem ao mês selecionado.
2. Inserir abaixo do resumo “Conferência do mês”, com “X de Y lançamentos conferidos” e barra de progresso. Contar os itens já exibidos no mês e o indicador `quitado` existente; para mês vazio, mostrar 0 de 0 sem divisão por zero. Acompanhar imediatamente marcação, desmarcação e exclusão.
3. Mostrar “Pendências de classificação” somente quando houver **saídas sem categoria** na lista mensal da Conferência, com quantidade e soma dos valores desses itens. O botão “Classificar agora” levará à página Lançamentos sem aplicar filtro: ela já oferece “Sem categoria”, mas seus registros históricos são separados dos itens da Conferência, então um filtro ali não corresponderia às pendências mostradas. A própria Conferência mantém o seletor de categoria para classificar esses itens.
4. Trocar apenas os rótulos “Quitado” da **Conferência** para “Conferido”/“Não conferido”, mantendo o campo e o comportamento existentes. O status serve ao controle pessoal e não participa dos totais. Destacar discretamente entrada/saída, fixo/variável e conferido/não conferido com os estilos atuais, sem retirar os controles de edição.
5. Ordenar visualmente: resumo do mês → progresso → pendências, quando houver → lista; preservar o seletor de mês, o estado vazio, as ações de copiar/criar mês e os botões de adicionar itens.

## Verificação

- Comparar os três totais do mesmo mês antes/depois, incluindo meses com dados e um mês vazio, sem alterar registros históricos.
- Confirmar na tela autenticada que marcar e desmarcar atualiza o progresso, persiste após recarregar e não muda os totais.
- Conferir apresentação e fluxo no computador e no celular, botão de navegação e ausência de erros de compilação.

## Detalhes técnicos

Alteração restrita à apresentação da rota de Conferência; reutilizar `getChecklistMonth`, `rows`, `totals`, `quitado`, `category_id` e estilos existentes. Sem migração, nova consulta, mudança de regra financeira ou alteração da tela Lançamentos.
