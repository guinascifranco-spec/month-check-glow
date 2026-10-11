# Fechamento das pendências financeiras — sem implantação

## Aplicação autorizada — plano aprovado

- [x] Testar sequência com proteção explícita de isolamento, preservando updated_at — 67 SQL e 70 unitários
- [x] Confirmar recuperação disponível e registrar totais legados antes da aplicação — arquivo público privado restaurado em cluster local
- [ ] Aplicar M1–M4, proteção adicional, M5–M6 pelo fluxo autorizado
- [ ] Validar acesso autenticado e preservação dos dados, sem registros financeiros fictícios

## Bloqueios restantes — revisão atual

- [ ] Aplicar correção de concorrência em M4 por fluxo autorizado — edição protegida; hipótese local passou 51 verificações/12 disputas, migração original ainda falha
- [x] Documentar alternativas de exclusão/retenção sem escolher uma política
- [x] Conferir a entrada órfã do lockfile sem modificá-lo e registrar resultados reais em financial-blockers-review.md

- [x] Substituir os cinco TODOs por regressões dos comportamentos existentes
- [x] Alinhar aportes revertidos no histórico e na tela Investimentos
- [ ] Garantir exclusividade cartão/benefício sob concorrência real — falha REPEATABLE READ reproduzida; migração protegida contra edição sem aplicação
- [x] Documentar titularidade e estratégia de exclusão para aprovação
- [x] Revisar diff anterior, executar testes isolados e registrar resultado
- [ ] Aprovar política de exclusão/retenção e implementar limpeza privilegiada auditável — depende de decisão do usuário

# Correção consolidada financeira — sem implantação

- [x] Corrigir migrações financeiras e preservar definições legadas
- [x] Testar sequência e integridade em PostgreSQL temporário isolado
- [x] Executar regressões e registrar relatório para aprovação
- [ ] Aplicação e validação das telas financeiras — bloqueadas até autorização explícita para migrações

# Visão Futura

# Analisar fatura

- [ ] Persistir responsabilidade e parte pessoal sem mudar valores integrais
- [ ] Revisão, resumo e edição posterior das quatro classificações
- [ ] Aplicar contribuição pessoal em indicadores e estornos, excluir pagamentos identificados
- [ ] Validar importação, edição, conciliação e regressões com dados sintéticos

- [x] Análise autenticada de PDF/imagem com resposta estruturada e cancelamento
- [x] Prévia editável, conferência de centavos e confirmação obrigatória
- [x] Importação atômica, metadados de parcelas e prevenção de duplicidade
- [x] Navegação editorial e validação desktop/mobile e chamadas reais de IA

- [x] Classificar saídas como fixas ou variáveis na Conferência
- [x] Calcular projeção combinando lançamentos e parcelas
- [x] Criar a página Visão Futura com resumos, gráficos e eventos
- [x] Integrar a nova página às navegações desktop e mobile
- [x] Validar cálculos, interação e visual responsivo

# Lançamentos

- [x] Criar categorias editáveis e campos de data/categoria
- [x] Criar cadastro e filtros unificados com a Conferência
- [x] Criar gráficos de distribuição por categoria e mês
- [x] Validar sincronização e responsividade

# Recuperação do backup

- [x] Conferir o backup contra os registros existentes e preservar os dados originais
- [x] Recuperar os 133 itens nos meses correspondentes da Conferência sem duplicações
- [x] Validar totais e navegação autenticada em abril, setembro e outubro

# Parcelas e orçamento

- [x] Editar parcelas e assinaturas ativas ou quitadas
- [x] Definir orçamento recorrente por categoria e comparar com saídas de cada mês
- [x] Validar salvamento e leitura de volta nas duas telas com usuário autenticado