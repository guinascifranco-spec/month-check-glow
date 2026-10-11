# Fechamento de pendências financeiras — 11/10/2026

## Limites respeitados

Nenhuma consulta ou operação no banco conectado. Nenhuma migração aplicada, publicação, deploy ou alteração de conexão. SQL executado exclusivamente em cluster PostgreSQL descartável, sem listener TCP, com socket e porta explícitos e dependências sintéticas.

## Arquivos efetivamente modificados nesta etapa

- `src/lib/financial-cycle.test.ts`: cinco TODOs substituídos por testes reais de caixa, transferências, consumo e data do pagamento.
- `src/lib/investment-reversals.ts`: filtro pequeno compartilhado de registros revertidos.
- `src/lib/investment-reversals.test.ts`: preservação de aportes legados, ativos e cancelados.
- `src/lib/financial-handlers.test.ts`: execução dos corpos reais dos handlers com cliente sintético, sem transporte/autenticação/banco; testa projeção e histórico acumulado.
- `src/lib/shared-metrics.functions.ts`: exclui aportes ligados a operações revertidas; acumula também aportes de ciclos anteriores sem lançamentos orçamentários; conserva moedas separadas e patrimônio desconhecido.
- `src/routes/_authenticated/investimentos.tsx`: reutiliza o mesmo filtro já aplicado às métricas, agora também no gráfico; registros revertidos continuam na lista de auditoria.
- `tests/financial-migrations/run.py`: testes reais de transferências, cancelamento, pagamento datado e concorrência em duas sessões com espera de lock observada; regressão de integridade falha se detectar dupla associação.
- `AGENTS.md`: regra única para filtragem compartilhada de reversões.
- `roadmap.md`: andamento e bloqueios desta etapa, sem remover tarefas históricas.
- `financial-review.md`: este relatório.

**Não modificados:** nenhuma migração, `bun.lock`, `tsconfig.json`, tipos gerados, configurações ou dependências.

## Resultados dos testes

- `bun test src/lib/*.test.ts`: **70 passaram, zero falhas, zero TODOs**, 251 verificações.
- PostgreSQL local: sequência M1→M6 aplicada com sucesso; **42 verificações passaram**. Incluem preservação literal do histórico orçamentário durante operações de investimento, idempotência, proteção de reversões, transferência/cancelamento e pagamento que só reduz caixa na data efetiva.
- Quatro disputas em **READ COMMITTED** passaram: cartão primeiro/benefício primeiro, via RPC autenticada e com inserção privilegiada no cartão. A sessão perdedora realmente esperou o lock e foi rejeitada; uma única associação permaneceu.
- **REPEATABLE READ com sessão privilegiada: falha confirmada.** Duas associações persistiram na mesma compra. O runner encerra com falha de integridade, não apresenta a suíte SQL como totalmente aprovada.
- Sinal automático da aplicação após mudanças de código: `build OK`.
- Não houve teste de telas contra as novas tabelas no banco conectado: migrações continuam pendentes e acessá-las não validaria esse fluxo. Os testes dos handlers não substituem validação autenticada após aplicação em ambiente isolado autorizado.

## Concorrência: bloqueio e correção proposta

Os locks bilaterais existentes funcionam no isolamento padrão. Contudo, esperar um `FOR UPDATE` não renova o snapshot de uma transação REPEATABLE READ; a verificação da outra tabela pode não enxergar a associação recém-confirmada.

Correção mínima proposta: no começo de `guard_exclusive_purchase_link()`, após o retorno para `month_check_row_id IS NULL`, rejeitar isolamento não compatível com as verificações de snapshot:

```sql
IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
  RAISE EXCEPTION 'Purchase associations require READ COMMITTED isolation';
END IF;
```

O PostgreSQL trata READ UNCOMMITTED como READ COMMITTED. Manter locks e verificações bilaterais existentes. Rejeitar também SERIALIZABLE neste caminho é conservador e explícito; não alterar isolamento global nem conexões. Depois de editar a migração no repositório, repetir a regressão em ambas as direções e com caminhos privilegiados, garantindo rejeição do isolamento não suportado e ausência de dupla associação.

**Não aplicada ao arquivo:** o ambiente recusou edição direta de `supabase/migrations/`; a alternativa disponível aplicaria SQL ao banco conectado, expressamente proibido nesta etapa. Não contornei a proteção. É necessário editar pelo fluxo autorizado do repositório antes de qualquer implantação. Não criei um segundo SQL concorrente nem declarei esse ponto corrigido.

## UUIDs de proprietário e exclusão de usuário

Restrição concreta confirmada nas instruções do Lovable Cloud (`cloud-db-workflow`, seção Mapping data to users): novas tabelas da aplicação usam UUID simples ou referência a `public.profiles`; apenas `public.profiles` e `public.user_roles` podem referenciar `auth.users` com cascata. Trata-se de regra aplicável da plataforma, **não** de limitação do PostgreSQL nem de erro de DDL comprovado em produção. Não consultado novamente o banco; referências legadas não foram removidas.

UUID + RLS protege acesso por proprietário, mas sozinho **não garante existência do usuário ou limpeza após exclusão**. As FKs compostas novas protegem o proprietário nas relações entre objetos financeiros; não fornecem cascata de autenticação. Exclusão direta de um usuário pode deixar dados novos órfãos ou esbarrar em RESTRICT ao alcançar tabelas legadas por cascata.

### Estratégia recomendada para aprovação, não implementada

1. Não criar perfis fictícios apenas para obter FK nem alterar referências legadas.
2. Usar procedimento explícito de encerramento de conta, autorizado no servidor com reautenticação recente; jamais aceitar `user_id` arbitrário fornecido pelo navegador. Bloquear novas gravações e tratar sessões ainda válidas durante o encerramento.
3. Definir primeiro **eliminação permanente versus retenção/anônimização**, prazo e necessidade de exportação. Não reter histórico identificável indefinidamente como decisão implícita.
4. Para eliminação: função privilegiada transacional exclusivamente do procedimento de encerramento, por proprietário, com auditoria sem conteúdo financeiro; limpeza em ordem de dependências (reversões/operações e avaliações; eventos de benefício; itens e pagamentos de fatura; conciliações e cancelamentos; movimentações e transferências; faturas/cartões/contas; depois dados legados). Os guards de imutabilidade precisam de caminho interno de limpeza controlado, não de desativação geral de triggers nem flag manipulável por usuários. A ordem exata deve ser testada no grafo completo incluindo referências recíprocas.
5. Exclusão na autenticação é etapa separada, idempotente, somente após a transação de limpeza. Registrar estado recuperável em caso de falha e impedir que sessões sobreviventes recriem dados. Evitar exclusão direta pelo operador que pule esse procedimento.
6. Se retenção for escolhida, implementar vínculo/titularidade e política de acesso/anonimização conforme o prazo aprovado; RLS sozinha não é política de retenção.
7. Testar usuário inexistente em operações privilegiadas, usuário errado, sessões existentes, falha intermediária, repetição, cascatas legadas/RESTRICT, exportação e ausência de restos antes de autorizar eliminação real.

Até essa estratégia ser aprovada e implementada, exclusão de conta **não está resolvida**. Não foi adicionado endpoint de exclusão nem trigger em `auth.users`.

## Regras de negócio que não foram inventadas

- RPCs de investimento e transferências alimentam caixa, não criam `month_check_rows`; projeção continua derivada do orçamento, portanto resgate de reserva não mascara déficit nesses caminhos.
- Uma entrada/saída **manual legada** descrita como “resgate”/“aporte” continua com comportamento legado; não inferir neutralidade por nome/categoria. Eventual reclassificação/migração histórica depende de regra e autorização suas.
- Reversão cancela custo do aporte na visão corrente e no histórico derivado, como já esperado nas métricas de Investimentos; não é resgate parcial nem reconstrução patrimonial “como era conhecido naquela data”. Não converti custo em valor de mercado.
- Mantida a agenda futura por mês civil, existente no projeto. Migrá-la para agenda do ciclo 2→1 é decisão separada, não necessária para os cinco testes pendentes.

## Revisão consolidada do diff anterior

Comparação de leitura da correção anterior (`75ab7a0^1..HEAD` no início desta etapa): mudanças em 26 arquivos. Revisão por grupos das seis migrações, contrato e chamadas tipadas, teste isolado, metadados e configuração; sem nova auditoria geral de produção.

- `tsconfig.json`: exclusão de `src/**/*.test.ts` necessária para separar declarações Bun do compilador da aplicação. Mantida; testes continuam executados separadamente.
- `AGENTS.md`: regras de isolamento, idempotência e contrato de tipos pertinentes à correção; mantidas. Nesta etapa acrescentada apenas a regra do filtro compartilhado.
- `roadmap.md`: status e bloqueios pertinentes; tarefas históricas não são evidência de auditoria nem novas funcionalidades e foram preservadas.
- `bun.lock`: **entrada órfã `bun-types@1.4.2`** restou da instalação/removal anterior; não há dependência correspondente em `package.json` nem `@types/bun`. Não é suporte necessário aos testes (Bun executa sem ela). Remoção desejável para limpar o diff, mas edição direta recusada por proteção; não reinstalei dependências só para provocar atualização automática.
- Contrato `financial-schema.ts` e substituições nas chamadas: evitam modificar tipos gerados antes da implantação; não mudam conexão. Mantidos.
- Metadados das quatro páginas financeiras: não afetam cálculos, rotas ou dados; mantidos por exigência de títulos e descrições específicos. Alteração de cast em Faturas acompanha contrato de retorno tipado.
- Navegações, ciclo 2→1 e patrimônio desconhecido pertencem às etapas financeiras já mescladas, não à correção anterior; não revertidos como se fossem alterações acidentais desta etapa.

## Decisões e próximo passo

**Revisável agora, não pronto para implantação/produção.**

1. Editar a migração protegida pelo fluxo do repositório, revisar a restrição explícita de isolamento proposta e fazer a regressão de dupla associação passar.
2. Aprovar exclusão/retenção e implementar o procedimento de integridade de titularidade antes de habilitar exclusão de contas.
3. Limpar a entrada órfã de `bun.lock` pelo fluxo permitido, sem novas dependências.
4. Rever diff final e autorizar separadamente aplicação M1→M6 e testes autenticados em ambiente isolado; somente depois discutir autorização de produção.

Nenhum dos bloqueios autoriza automaticamente SQL, deploy ou publicação.