# Ativar as funcionalidades financeiras preservando os dados

## Objetivo

Aplicar ao Lovable Cloud as mudanças necessárias para o código já sincronizado funcionar, sem recriar o aplicativo, apagar histórico ou escolher uma política de retenção. Não publicar automaticamente.

## Situação confirmada nesta revisão

- O código sincronizado ainda contém em M4 a proteção de concorrência baseada somente em `FOR UPDATE`; a correção experimental não está incorporada.
- A consulta de leitura ao histórico não encontrou migrações registradas a partir de `20261010000000`.
- O trigger existente de `month_check_rows` atualiza `updated_at` em qualquer UPDATE. A proposta anterior de escrever nessa linha não atende à exigência de evitar datas artificiais.
- A plataforma protege os arquivos de migração contra edição direta. Seu fluxo autorizado aplica SQL e registra um novo arquivo; agora a aplicação ao banco é o objetivo solicitado, mas só ocorrerá após aprovação deste plano.

## Execução proposta

### 1. Fechar a proteção de concorrência antes de aplicar qualquer mudança

Preparar uma correção adicional, pequena, para `guard_exclusive_purchase_link()`, sem editar M4 à força e sem tocar na função compartilhada de `updated_at`.

A correção manterá os locks e as verificações bilaterais existentes, mas recusará associações em REPEATABLE READ ou SERIALIZABLE. O uso normal em READ COMMITTED continuará permitido. É uma restrição explícita e conservadora: impede a falha sem escrever artificialmente no lançamento, adicionar tabelas ou reconstruir a implementação. Essa opção não pretende oferecer suporte a associações nos isolamentos recusados.

Executar primeiro a sequência completa, incluindo essa correção, em PostgreSQL descartável. Ajustar os testes para comprovar:

- Uma única associação em disputas READ COMMITTED, nas duas ordens e por caminhos autenticados/privilegiados.
- Rejeição explícita das associações nos isolamentos não suportados, sem efeitos financeiros parciais.
- Preservação literal de `updated_at` e dos valores da compra.
- Continuidade dos testes de investimentos, reversões, idempotência, transferências, pagamentos e histórico legado.

Se qualquer teste falhar, não iniciar a aplicação no banco conectado.

### 2. Preparar preservação e recuperação

Confirmar os meios de backup/restauração disponíveis antes da primeira mudança. Comparar contagens e totais agregados das tabelas financeiras legadas antes e depois, sem expor dados pessoais no relatório.

Conferir apenas pré-condições das seis migrações e ausência de aplicação parcial, sem repetir a auditoria geral. Não converter registros antigos em movimentações, não inserir saldos presumidos e não fazer backfill automático.

### 3. Aplicar as mudanças pelo fluxo autorizado

Aplicar M1, M2, M3 e M4, usando o conteúdo existente byte a byte. Logo após M4, aplicar a correção adicional de isolamento pelo sistema de migrações. Em seguida, aplicar M5 e M6.

As aplicações são etapas separadas, não uma transação única. A proteção adicional deve ser validada imediatamente após M4, antes de continuar. Não afirmar que toda a sequência será atomicamente revertida se uma etapa falhar. Em caso de falha, interromper, informar o estado exato e não repetir uma migração já registrada.

Manter referências legadas, categorias, classificações de fatura, tabelas antigas de investimentos e políticas existentes. Não implementar exclusão de usuário nem retenção nesta etapa.

### 4. Validar o aplicativo com uma sessão autenticada

Verificar Contas, Movimentações, Faturas, Benefícios, Investimentos, Visão Geral e Visão Futura. Confirmar ausência de erros de tabelas/funções ausentes, isolamento por usuário e preservação dos totais antigos.

Usar testes descartáveis para operações de escrita que geram registros imutáveis. Não criar aportes, pagamentos ou reversões fictícios na conta pessoal para testar. A leitura autenticada das telas será feita no banco conectado; qualquer teste adicional que exija dados reais será apresentado separadamente.

## Detalhes técnicos e limites

- Correção adicional: depois do retorno para vínculo nulo, verificar `current_setting('transaction_isolation')`; permitir `read committed` e `read uncommitted` (equivalentes no PostgreSQL), rejeitar os demais com erro claro. Preservar o restante do guard.
- Usar exclusivamente o sistema autorizado de migrações para alterações de schema; nunca `db push` ou edição indireta de arquivos protegidos.
- Verificar GRANTs, RLS e acesso às funções na validação, sem ampliar permissões indiscriminadamente.
- `bun-types@1.4.2` no lockfile não impede a aplicação do schema. Sua limpeza fica fora desta implantação e não será forçada enquanto protegido.
- Se surgir um conflito não previsto ou faltar recuperação segura, interromper com uma explicação objetiva em vez de improvisar alterações em produção.

## Entrega

Relatório curto com migrações efetivamente aplicadas, correção adicional registrada, testes reais, comparação dos dados antigos e limitações restantes. Não declarar produção validada apenas porque o SQL executou.

**A aprovação autoriza alterações de estrutura no banco conectado, compartilhado pelo preview e pelo aplicativo publicado. Não autoriza exclusão/reclassificação de histórico, política de retenção ou publicação.**