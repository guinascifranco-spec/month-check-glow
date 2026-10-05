# Evolução pontual da Visão Geral

## O que muda

1. **Fluxo financeiro:** organizar no início da Visão Geral três indicadores — Entradas, Saídas e Resultado — usando os totais do **último mês com lançamentos registrados** já retornados pela página. Identificar claramente o mês mostrado e oferecer estado vazio quando não houver lançamentos; não alterar os cálculos.
2. **Caixa:** apresentar separadamente o **Saldo acumulado** que a página já calcula, identificado como resultado acumulado dos lançamentos, **não** como saldo bancário.
3. **Patrimônio:** agrupar Total investido, Proventos recebidos e Patrimônio total já exibido pelo sistema. Reutilizar a consulta de proventos da aba Investimentos e o mesmo critério de soma, sem somar proventos novamente ao patrimônio ou criar patrimônio líquido. Manter o acesso à lista de ativos e os indicadores existentes sem multiplicar cards de destaque.
4. **Evolução e projeção:** conservar os gráficos, seus dados, os controles e fórmulas atuais na Visão Geral. Acrescentar a frase “Projeção baseada nos dados financeiros registrados no Month Check.” e manter discreta a explicação já existente sobre média dos últimos meses ou valor manual e juros compostos. Na Visão Futura, incluir essa mesma descrição e esclarecer que a estimativa usa histórico e parcelas, sem sugerir juros compostos nessa tela.
5. **Rótulos mais claros:** na Visão Futura, renomear “Melhor mês” e “Pior mês” para “Maior resultado mensal” e “Menor resultado mensal”, pois a seleção atual compara o saldo projetado dos meses; manter exatamente os valores.

## Limites e validação

- Alterar somente a apresentação de `visao-geral.tsx` e `visao-futura.tsx`; reutilizar `getAccumulatedWithPatrimony` e `listProventos` existentes. Sem migração, sem nova regra financeira e sem mudanças nas outras telas.
- Antes/depois: registrar os números atuais na Visão Geral e comparar cada indicador após a mudança; conferir que histórico e projeção recebem os mesmos conjuntos de dados e respondem aos controles; testar desktop e celular, inclusive estado sem dados, com sessão autenticada; verificar a compilação.
