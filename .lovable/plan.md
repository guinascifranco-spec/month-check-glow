### Alterar template padrão de novos meses

Atualizar o array `DEFAULT_TEMPLATE` em `src/lib/month-check.functions.ts` para refletir a nova lista de linhas padrão.

**Linhas padrão (entrada):**
- Salário
- Adiantamento
- Acertos Bia
- Demais entradas

**Linhas padrão (saída):**
- Fatura NBK
- Aluguel
- Condomínio
- Energia
- Internet e Celular
- Água
- Gás
- Lavanderia
- Psicólogo

**Alterações necessárias:**
1. Substituir o conteúdo do `DEFAULT_TEMPLATE` pelo novo conjunto de linhas (13 itens total: 4 entradas + 9 saídas).

Nenhum outro arquivo precisa ser modificado. A tabela `month_check_rows` já suporta os campos necessários.