# Recuperar os meses do Month Check

## Resultado esperado
Os valores de entradas e saídas do backup voltarão a aparecer na **Conferência** nos respectivos meses de 2026, com descrição, tipo, ordem, classificação e estado de quitação preservados. Os registros atuais não serão apagados nem duplicados.

## O que será feito
1. Comparar cada registro do backup de 23/09 com os dados atuais da conta e identificar alterações feitas depois da exportação. Hoje os 133 registros mensais do backup já existem na base antiga, mas a Conferência lê uma lista separada; nessa lista há somente 13 linhas zeradas em setembro e 13 em outubro.
2. Corrigir primeiro a estrutura pendente da lista de Conferência: aplicar a migração já existente para categorias, sem reescrevê-la. Confirmar que a página consegue ler os meses normalmente.
3. Preencher a lista de Conferência mês a mês a partir dos registros recuperados, inclusive linhas personalizadas. Reaproveitar os modelos zerados existentes em setembro/outubro em vez de criar duplicatas. Preservar qualquer valor ou alteração posterior já feita nessa lista; não apagar nem substituir os dados originais da aba Lançamentos.
4. Tornar a recuperação idempotente: uma segunda execução não deve acrescentar novamente os mesmos itens. Conferir contagens, totais e linhas por mês com o backup, registrando qualquer divergência ou alteração mais recente que precise ser preservada.
5. Abrir a Conferência autenticado e conferir meses representativos (abril, setembro e outubro), navegação, totais e persistência após atualizar a página; verificar também que os outros dados do backup — parcelas, investimentos e categorias — continuam intactos.

## Detalhes técnicos
- Manter `month_check_rows` como origem histórica já presente e `checklist_items` como fonte exibida na Conferência. Confrontar identificadores e conteúdo com o JSON enviado antes de migrar para não regredir edições posteriores ao backup.
- Usar uma migração de dados segura e restrita ao usuário do backup, com correspondência por mês, tipo e item/posição para reconciliar modelos vazios; controlar a origem de cada cópia ou equivalente para evitar duplicações em novas execuções. Preservar as regras atuais de acesso por usuário.
- Não importar novamente tabelas cujos registros já estejam presentes. Nenhuma substituição em massa nem exclusão de registros existentes.
