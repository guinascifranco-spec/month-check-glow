# Bloqueios restantes — revisão limitada, 11/10/2026

## Estado real

Nenhum SQL executado no banco conectado, nenhuma migração aplicada nele, nenhuma publicação/deploy ou mudança de conexão. Nenhuma política de retenção escolhida. `bun.lock` não foi editado. A auditoria geral anterior não foi repetida.

**A correção da migração continua bloqueada por proteção de arquivo.** Uma tentativa normal de editar M4 foi recusada. Não usei outro mecanismo para escrever no diretório protegido nem a ferramenta que aplica SQL no banco conectado. O experimento abaixo só modifica uma função em um cluster local descartável; não constitui correção implantável do repositório.

## Arquivos efetivamente alterados nesta etapa

- `tests/financial-migrations/run.py`: regressão estrita em READ COMMITTED, REPEATABLE READ e SERIALIZABLE; ambas as ordens; RPC autenticada e INSERT de cartão/UPDATE de benefício privilegiados; observação efetiva de espera por lock e verificação de uma única associação.
- `tests/financial-migrations/fixture.sql`: inclui o trigger legado de atualização de `updated_at`, para não esconder o efeito colateral da proposta.
- `roadmap.md`: tarefas desta solicitação e bloqueio real atualizado.
- `financial-blockers-review.md`: este relatório e a alteração exata proposta.

**Não alterados:** seis migrações, aplicação, `tsconfig.json`, `AGENTS.md`, `package.json`, `bun.lock`, configurações, políticas e dados de produção. O relatório anterior permanece como registro da etapa anterior.

## Concorrência: causa e menor correção proposta

`guard_exclusive_purchase_link()` bloqueia a mesma linha em `month_check_rows`, mas não a modifica. Em REPEATABLE READ, a sessão que esperou o lock conserva seu snapshot anterior. O `EXISTS` contra a outra tabela não vê a associação recém-confirmada: duas tabelas distintas aceitam a mesma compra. Validação prévia, lock consultivo ou somente leitura em trigger não resolvem esse snapshot.

Na migração `supabase/migrations/20261013220000_benefit_wallets.sql`, substituir apenas estas duas linhas no guard:

```sql
PERFORM 1 FROM public.month_check_rows
  WHERE id = NEW.month_check_row_id AND user_id = NEW.user_id FOR UPDATE;
```

por:

```sql
-- A shared parent write forces stale snapshot transactions to abort.
UPDATE public.month_check_rows SET id = id
  WHERE id = NEW.month_check_row_id AND user_id = NEW.user_id;
```

Preservar `IF NOT FOUND`, as verificações bilaterais, os dois triggers e as validações/RPCs existentes. O UPDATE sem alteração da chave cria uma versão real da tupla comum. A segunda transação em REPEATABLE READ/SERIALIZABLE recebe SQLSTATE 40001 em vez de confirmar usando snapshot antigo. Em READ COMMITTED, as verificações existentes rejeitam a associação oposta após a espera. Os caminhos privilegiados com triggers ativos passam pela mesma escrita. Isso não oferece garantia contra operador que desative triggers ou use privilégios de superusuário para contornar integridade.

Não exige nova tabela, coluna, reclassificação, mudança de isolamento ou refatoração. Uma tabela central de reivindicações com unicidade também seria possível, mas precisaria sincronizar inserção, desvinculação, atualização e exclusão; é retrabalho desnecessário para este defeito confirmado. Rejeitar REPEATABLE READ por completo também bloquearia a falha, mas impediria operações válidas nesse isolamento. A proposta permite que uma operação vença e outra aborte corretamente.

**Efeito colateral explícito:** o trigger legado `update_month_check_rows_updated_at` atualiza `updated_at` quando a compra é vinculada. Valores financeiros, data da transação, titularidade e chave permanecem inalterados. A fixture agora inclui esse trigger. Existe custo de uma versão de tupla/WAL por associação e potencial de deadlock já inerente a lotes com ordens distintas; PostgreSQL aborta um participante, não aceita dupla associação. Ao receber 40001, repetir a transação inteira com snapshot novo; nunca somente a instrução dentro da transação falhada nem retry infinito. Nenhum mecanismo de retry novo foi adicionado à aplicação nesta etapa.

## Testes e evidência

- Antes de qualquer mudança: `python3 tests/financial-migrations/run.py` reproduziu a falha original: sessão privilegiada em REPEATABLE READ aceita e **2 associações** persistidas; saída 1 por bloqueio de integridade. As 42 verificações anteriores não significavam suíte integral aprovada.
- Regressão ampliada, migrações originais: saída 1 em `REPEATABLE READ / card first / authenticated`, com `loser accepted`. O teste padrão continua vermelho enquanto M4 não for editada; não mascara a pendência.
- Experimento explícito: `python3 tests/financial-migrations/run.py --probe-parent-write`. Obtém a definição do guard do cluster local, exige correspondência literal única com o trecho original e testa a substituição **em memória**, somente nesse cluster. Não grava SQL alternativo em migrações. Não deve ser usado como certificação da sequência original.
- Experimento após substituição: **51 verificações SQL e 12 disputas concorrentes passaram**, incluindo RPCs e writes privilegiados em ambas as ordens. REPEATABLE READ/SERIALIZABLE rejeitaram a perdedora por conflito de atualização; uma única associação permaneceu. Valores financeiros da compra preservados. O cluster inclui o trigger legado de `updated_at` e é removido ao terminar.
- `bun test src/lib/*.test.ts`: **70 passaram, 0 falhas, 251 verificações**, sem TODOs. Sem nova modificação de código de aplicação.

Socket e porta explícitos, sem listener TCP e com variáveis PG externas removidas. Nenhum acesso ao banco conectado foi necessário.

## Exclusão de usuários: alternativas para aprovação

A regra concreta do Lovable Cloud (`cloud-db-workflow`, Mapping data to users) exige UUID simples ou referência a `public.profiles` nas **novas** tabelas da aplicação; somente `profiles` e `user_roles` podem referenciar `auth.users` com cascata. É uma restrição da plataforma, não incapacidade do PostgreSQL nem erro demonstrado de DDL. Referências legadas continuam intactas. Nenhum perfil artificial foi criado apenas para obter FK.

UUID simples e RLS não asseguram existência do usuário nem cascata após remoção. As FKs compostas financeiras asseguram coerência entre proprietários dos objetos; não substituem integridade do ciclo de vida do usuário. Sessões antigas ainda podem estar válidas após exclusão: fechamento precisa bloquear gravações também.

| Alternativa | Tratamento financeiro | Dependências e riscos |
|---|---|---|
| Desativação com retenção identificável por prazo aprovado | Manter conta de autenticação desativada e financeiro intacto até o prazo de eliminação | Não é remoção imediata do usuário; exige bloqueio de sessões/gravações, prazo, acesso restrito e limpeza programada. Preserva FKs legadas sem alterá-las. |
| Exclusão permanente coordenada | Limpar financeiro por proprietário antes de excluir autenticação | Procedimento privilegiado e auditável, ordem de dependências, caminho interno para registros imutáveis e falhas recuperáveis. Exclusão da autenticação não participa da mesma transação SQL: tratar como duas etapas idempotentes. |
| Retenção anonimizada após encerramento | Remover/reduzir identificadores e conservar somente os dados aprovados | UUID sozinho não anonimiza descrições/documentos/metadados. Exige inventário do que pode reidentificar, prazo e finalidade. FKs legadas CASCADE/RESTRICT podem impedir preservar as linhas ao remover autenticação; sem alterar FKs legadas, exportação sanitizada ou manutenção da conta desativada precisa de aprovação e testes. |

**Não escolher automaticamente:** finalidade e prazo de retenção; exclusão versus anonimização; exportação antes do encerramento; acesso futuro pelo titular; necessidade de recuperar uma conta encerrada.

Qualquer opção exige reautenticação recente, autoridade derivada da sessão (não `user_id` arbitrário do navegador), bloqueio de novas gravações/sessões, estado recuperável e idempotência, testes de cascatas legadas/RESTRICT e auditoria sem conteúdo financeiro. Não adicionar trigger destrutivo em `auth.users`, não desativar triggers globalmente nem criar flag de limpeza manipulável pelo cliente. Não implementar exclusão até a decisão aprovada e a suíte própria de fechamento passar.

## Revisão acumulada e lockfile

Comparação direcionada de `75ab7a0^1..HEAD`, incluindo correções anteriores, sem repetir auditoria de schema:

- `tsconfig.json`: única diferença é excluir `src/**/*.test.ts` do compilador da aplicação. Compatível com testes Bun separados; não remover.
- `AGENTS.md`: regras de isolamento SQL, idempotência, contrato de tipos pendentes, execução Bun separada e filtro de reversões correspondem às correções concluídas. Nenhuma alteração nesta etapa.
- `roadmap.md`: acompanhamento e bloqueios; tarefas históricas preservadas, não são novas decisões financeiras.
- `package.json`: sem diferença nesse intervalo, nenhuma dependência adicionada nesta etapa.
- `bun.lock`: única diferença é o registro resolvido **`bun-types@1.4.2`**, linha 700, e sua linha separadora. Não existe dependência direta correspondente. `drizzle-orm` já anuncia `bun-types` como peer opcional; essa declaração preexistente não deve ser apagada. O registro residual surgiu na tentativa anterior de instalar tipos Bun, não é necessário para rodar estes testes.

Correção necessária quando permitido: remover somente o registro resolvido órfão e a separadora adicionada, ou regenerar pelo fluxo autorizado garantindo esse diff mínimo e nenhuma mudança de versões/dependências. Não reinstalar dependências apenas para forçar atualização de arquivo protegido. Não editar enquanto protegido.

## Aprovações e próximo passo

1. Edição de M4 por fluxo autorizado do repositório, fora da proteção atual: aplicar as duas linhas exatas e executar a suíte **padrão** sem `--probe-parent-write`. Essa edição é um bloqueio externo real, não tarefa concluída.
2. Revisar o efeito documentado em `updated_at` e a estratégia de escrita comum antes da implantação.
3. Escolher política de retenção/eliminação e aprovar implementação e testes do fechamento de conta. Nenhuma opção aplicada.
4. Limpeza mínima do lockfile por fluxo permitido quando desbloqueado.
5. Somente depois, autorização separada para aplicação/testes autenticados em ambiente isolado. Nenhuma autorização para produção foi presumida.

**Pronto para revisar a proposta e as evidências; não pronto para implantação nem produção.** A migração original ainda falha na regressão. O experimento comprova a proposta no ambiente sintético, não que a aplicação conectada já esteja corrigida.