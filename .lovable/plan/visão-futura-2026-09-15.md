# Visão Futura

## Objetivo
Adicionar uma nova aba autenticada **Visão Futura**, visual e responsiva, que projeta renda, gastos e saldo desde o mês atual pelo horizonte escolhido.

## O que será construído

### 1. Classificação dos lançamentos
- Adicionar às saídas da Conferência a classificação **Fixo** ou **Variável**.
- Exibir um seletor simples dessa classificação tanto nos cards mobile quanto na tabela desktop.
- Manter entradas sem essa classificação.
- Pré-classificar os itens padrão recorrentes como fixos; novas saídas começam como variáveis e podem ser alteradas.
- Salvar a classificação por usuário junto ao lançamento mensal existente.

### 2. Nova aba e navegação
- Criar a página protegida `/visao-futura`.
- Adicionar **Visão Futura** às abas no desktop e à navegação inferior no celular, ajustando os cinco itens sem sobreposição.
- Preservar o estilo neumórfico, a paleta e o cabeçalho atuais.

### 3. Seletor de período
- Oferecer atalhos para **1, 2, 3, 6 e 12 meses** e um campo para período personalizado.
- Iniciar a projeção no mês atual e atualizar cards, gráficos e eventos imediatamente ao mudar o horizonte.
- Limitar o período personalizado a uma faixa segura e legível de 1 a 60 meses.

### 4. Cálculo da projeção
- **Renda:** usar a média dos últimos 3 meses com lançamentos; quando houver apenas o mês atual, usar seus valores cadastrados.
- **Fixos:** repetir mensalmente o valor fixo mais recente cadastrado para cada descrição.
- **Parcelas:** incluir cada parcela somente entre seu primeiro e último mês, removendo-a após a quitação.
- **Variáveis:** usar a média dos últimos 3 meses registrados.
- Para não contar parcelas duas vezes, descontar da base variável histórica os compromissos parcelados ativos naquele mês, sem permitir resultado abaixo de zero; depois adicionar a agenda exata das parcelas futuras.
- Calcular por mês: renda, fixos, parcelas, variáveis, gastos totais e saldo.

### 5. Resumos e gráficos
- Quatro cards: **Gasto médio mensal**, **Melhor mês**, **Pior mês** e **Saldo acumulado**.
- Destacar valores e meses negativos em vermelho, positivos em verde e neutros em cinza.
- Gráfico principal de linhas com **Renda**, **Gastos** e **Saldo**, meses no eixo horizontal, valores em reais e tooltip detalhado.
- Gráfico secundário de barras empilhadas com **Fixos**, **Parcelas** e **Variáveis**.
- Usar largura total, alturas estáveis e rótulos reduzidos no celular.

### 6. Eventos importantes
- Gerar cards cronológicos para parcelas que terminam dentro do horizonte, informando o valor mensal liberado.
- Gerar alertas para meses cujo gasto fique acima da média projetada, mostrando o percentual.
- Usar textos simples, estados vazios claros e nenhum formato de tabela.

## Detalhes técnicos
- Criar uma migração para incluir a classificação da saída em `month_check_rows`, mantendo as regras de acesso por usuário e os grants existentes.
- Centralizar a leitura e o cálculo em uma função autenticada, combinando lançamentos mensais e parcelas sem expor dados entre usuários.
- Reutilizar Recharts e os tokens visuais atuais; não criar uma nova biblioteca de gráficos.
- Adicionar metadados próprios da nova página e manter os demais fluxos inalterados.

## Validação
- Conferir os cálculos com meses atravessando a virada do ano, parcelas iniciando/terminando e períodos sem histórico.
- Testar troca de horizonte, tooltips, estados negativo/zero/positivo e classificação de lançamentos.
- Verificar visualmente desktop e mobile, incluindo a navegação inferior com cinco abas.
- Confirmar que autenticação, edição da Conferência e demais páginas continuam funcionando.
