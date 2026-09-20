# Finalização da Visão Futura e guia Lançamentos

## Objetivo
Concluir e validar a **Visão Futura** e criar uma guia **Lançamentos** que use os mesmos registros da Conferência, permitindo cadastrar, classificar e analisar receitas e gastos sem duplicidade.

## O que será construído

### 1. Finalizar a Visão Futura
- Corrigir os erros de compilação pendentes e o problema de hidratação observado na autenticação.
- Completar a área positiva/negativa do saldo no gráfico principal e revisar tooltips, estados vazios e mensagens de erro.
- Validar a projeção em virada de ano, períodos sem histórico, parcelas iniciando/terminando e horizontes de 1 a 60 meses.
- Conferir visualmente desktop e celular e preservar a navegação e o estilo atuais.

### 2. Dados unificados para Lançamentos e Conferência
- Evoluir os lançamentos mensais existentes com **data** e **categoria**, mantendo tipo, descrição, valor, classificação fixa/variável e situação de quitação.
- Usar o mesmo registro nas duas guias: criar, editar ou excluir em uma delas atualiza a outra e também as projeções.
- Preservar todos os dados atuais; registros antigos continuam visíveis e podem ser categorizados depois.
- Manter cada usuário restrito aos próprios lançamentos.

### 3. Categorias editáveis
- Criar categorias pessoais com um conjunto inicial de opções comuns, como Moradia, Alimentação, Transporte, Saúde, Lazer, Assinaturas, Educação e Outros.
- Permitir criar, renomear e excluir categorias; ao excluir uma categoria em uso, os lançamentos ficam como **Sem categoria**.
- Exibir a categoria como seletor simples no cadastro e na edição dos lançamentos.

### 4. Nova guia Lançamentos
- Adicionar a página protegida `/lancamentos` às abas do desktop e à navegação inferior do celular.
- Oferecer cadastro e edição de data, descrição, entrada/saída, categoria, fixo/variável, valor e quitado.
- Incluir busca e filtros por período, tipo, categoria e situação, além de totais de entradas, saídas e saldo do recorte.
- No celular, usar cards empilhados e formulário em painel inferior; no desktop, usar uma lista compacta e legível.

### 5. Gráficos de distribuição
- Exibir um gráfico de rosca com a participação de cada categoria nas saídas do período.
- Exibir barras mensais empilhadas por categoria para comparar a evolução dos gastos.
- Mostrar valores e percentuais no tooltip, legenda clara e estado vazio quando não houver gastos.
- Fazer os gráficos responderem aos mesmos filtros da lista.

### 6. Integração dos cálculos
- Atualizar Conferência, totais anuais e Visão Futura para considerar data e categoria sem mudar a lógica financeira já aprovada.
- Invalidar os resumos e gráficos relacionados após qualquer alteração, evitando valores desatualizados.
- Ajustar a navegação móvel para comportar a nova guia sem sobreposição, priorizando rótulos curtos e alvos de toque adequados.

## Detalhes técnicos
- Criar migração para as categorias e para os novos campos dos lançamentos, com permissões e regras de acesso por usuário.
- Implementar leituras e gravações autenticadas no servidor, com validação dos filtros e valores.
- Reutilizar Recharts, componentes e tokens visuais existentes; não adicionar outra biblioteca de gráficos.
- Adicionar metadados próprios à nova página e completar os metadados das páginas existentes que estiverem incompletos.

## Validação
- Confirmar sincronização bidirecional entre Conferência e Lançamentos, inclusive criação, edição e exclusão.
- Testar categorias em uso, exclusão de categoria, filtros combinados e períodos atravessando anos.
- Conferir se os totais dos gráficos correspondem exatamente aos lançamentos filtrados.
- Verificar autenticação, parcelas, investimentos, Visão Geral, Visão Futura e navegação em desktop e celular.
