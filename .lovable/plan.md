# Responsabilidade financeira nas faturas — Month Check

## Objetivo

Adicionar classificação manual por lançamento, preservando o fluxo atual de análise, revisão, confirmação e importação, a identidade visual e os dados existentes. Não integrar o outro SaaS nem criar controle de dívidas da Bia ou de reembolsos.

## Situação verificada

- A revisão já permite editar valor integral, data, categoria, tipo e parcelas; a conciliação é feita em centavos, incluindo estornos, com tolerância de R$ 0,01.
- Os lançamentos importados ficam em `month_check_rows`. Os indicadores e gráficos hoje somam `valor`, sem distinguir responsabilidade financeira.
- A importação já verifica duplicidades e mantém origem do arquivo e posição da linha. Essas identificações serão preservadas.
- A Conferência usa `checklist_items`, separadamente dos gastos reais. Não copiar compras para essa lista nem substituir automaticamente seu planejamento ou o item de pagamento da fatura.
- A análise já orienta a IA a excluir pagamentos e resumos da fatura. Isso não identifica pagamentos cadastrados manualmente em Lançamentos.

## 1. Classificação na revisão

Acrescentar um seletor compacto por linha, reutilizável na edição posterior:

| Classificação | Valor que afeta despesas pessoais |
|---|---|
| 100% meu | Valor integral |
| Dividido com a Bia | Valor em R$ informado em “Minha parte” |
| 100% da Bia | Zero |
| 100% reembolsável | Zero |

- Usar **100% meu** como padrão para novas revisões. A IA não escolhe a responsabilidade.
- Ao escolher divisão, exigir “Minha parte”, sem preencher automaticamente metade. Validar em centavos, entre zero e o valor integral.
- Manter o campo de valor integral separado da parte pessoal. Alterar a classificação nunca modifica os valores extraídos.
- Caso a edição do valor integral torne a divisão inválida, pedir correção antes de salvar/importar; não ajustar silenciosamente.
- Manter seleção, remoção, categorias, parcelas, confiança e confirmação existentes. Linhas não pessoais selecionadas também são preservadas após importar, sem efeito nos indicadores pessoais.

## 2. Resumo e conciliação

Mostrar no resumo existente:

- Total da fatura e total integral identificado/revisado.
- Total pessoal efetivo.
- Total correspondente à Bia: lançamentos 100% da Bia **mais o restante dos divididos**, conforme sua escolha.
- Total reembolsável.
- Diferença de conciliação.

O total da Bia é apenas uma composição da fatura, não uma dívida ou cobrança. Não criar renda ou recebíveis para as partes não pessoais.

A conciliação continua usando valores integrais de todas as linhas mantidas na revisão. Desmarcar uma linha altera apenas o lote a importar; não altera a conciliação. Mostrar separadamente o impacto pessoal das linhas selecionadas na confirmação.

**Estornos:** conforme sua escolha, a parte pessoal reduz as despesas da categoria, sem aparecer como renda. A parte atribuída à Bia ou reembolsável reduz apenas o respectivo subtotal da fatura. Manter o tipo original visível como crédito/estorno e a conciliação integral; permitir categoria também no estorno importado.

## 3. Persistência e indicadores

Preservar `valor` como valor integral da linha. Acrescentar somente os metadados necessários para classificação e parte pessoal, sem criar uma segunda transação ou um novo sistema de faturas.

Aplicar uma regra compartilhada nos pontos de cálculo existentes:

- Compra pessoal: soma a parte pessoal às despesas.
- Estorno pessoal de fatura: subtrai a parte pessoal das despesas; não soma às receitas.
- Linha 100% da Bia ou reembolsável: não contribui para receitas, despesas, categorias, orçamento ou projeções pessoais.
- Linha histórica sem nova classificação: mantém o comportamento anterior, sem reclassificação automática.

Reutilizar essa regra nos totais e gráficos de Lançamentos, orçamento por categoria, métricas mensais/acumuladas e médias das projeções. Meses compostos somente por linhas sem efeito pessoal não devem virar novos meses de referência nas médias.

Não alterar fórmulas de investimentos, cronogramas de Parcelas ou planejamento da Conferência. O fechamento dos gastos reais passa a refletir apenas a responsabilidade pessoal; a lista planejada da Conferência permanece independente.

## 4. Consulta, edição e duplicidade

- Em Lançamentos, exibir a classificação, valor integral e parte pessoal das linhas importadas. “Zero pessoal” não deve aparecer como “sem valor”.
- Reutilizar o formulário atual para editar classificação e divisão, preservando datas, categorias, parcelas e situação.
- Manter as duplicidades baseadas no valor **integral**, origem e linha, não na parte pessoal. Mudar uma divisão não permite reimportar a mesma compra.
- Não classificar pagamentos ou reembolsos históricos por palavras como “NBK”, “Bia” ou “RDV”.
- Disponibilizar no formulário existente de Lançamentos uma identificação explícita de **pagamento de fatura**, sem efeito adicional nos indicadores pessoais, para não contar o pagamento e as compras duas vezes. Preservar seu valor para consulta; exigir escolha do usuário, sem marcar, apagar ou compensar registros automaticamente.
- Não criar lançamento de reembolso recebido nem inferir receita recorrente a partir de gastos reembolsáveis. Receitas manuais não relacionadas continuam funcionando como antes.

## Detalhes técnicos

- Migração aditiva em `month_check_rows`: classificação opcional, parte pessoal opcional e identificação opcional de pagamento de fatura. Sem novas tabelas, sem apagar dados; ausência dos metadados mantém a interpretação anterior.
- Validar combinações e limites no servidor e na persistência: integral para 100% meu, zero para Bia/reembolsável e parte válida para dividido. Impedir metadados contraditórios.
- Atualizar o contrato de revisão/importação e a RPC atômica existente. Conservar autenticação, isolamento por usuário, idempotência e confirmação obrigatória.
- Criar uma pequena função compartilhada de contribuição financeira para evitar regras divergentes nos gráficos, totais e projeções; adaptar apenas os consumidores afetados.
- Principais alterações: `invoice.ts`, `invoice-review.tsx`, `analisar-fatura.tsx`, `invoice.functions.ts`, RPC `import_invoice_rows`, `transactions.functions.ts`, `lancamentos.tsx`, `shared-metrics.functions.ts`, `future-view.functions.ts` e demais leitores de totais identificados na verificação.
- Manter a integração e o modelo de IA atuais; a classificação é humana, posterior à extração. Verificar que o backup inclui os novos metadados.

## Validação

1. Fatura sintética de R$ 1.000: R$ 200 meus, R$ 400 divididos com minha parte de R$ 150, R$ 100 da Bia e R$ 300 reembolsáveis. Esperado: pessoal R$ 350, Bia R$ 350, reembolsável R$ 300 e diferença zero.
2. Acrescentar estorno pessoal de R$ 50: total integral R$ 950, consumo pessoal R$ 300, receitas inalteradas. Testar também estorno não pessoal.
3. Testar limites da divisão, valores ausentes, alterações de classificação, seleção parcial e diferença de conciliação.
4. Confirmar importação em sessão autenticada, recarregar, consultar e editar; conferir persistência e impacto nas categorias, orçamento, totais e projeções.
5. Testar cancelamento, repetição do arquivo e duplicidade após mudar a parte pessoal.
6. Marcar um pagamento sintético de fatura e confirmar que não duplica consumo; verificar que lançamentos manuais comuns mantêm seu comportamento.
7. Conferir computador/celular, backup e preservação do planejamento e registros existentes; remover somente os dados sintéticos de teste.

Ao concluir, apresentar resumo das alterações e dos testes realizados, indicando qualquer verificação que não tenha sido possível executar.