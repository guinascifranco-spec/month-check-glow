## Gráfico de linhas anual (entradas × saídas por mês)

1. **Novo server function** `getYearTotals` em `src/lib/month-check.functions.ts`:
   - Recebe `{ year }`, autenticado via `requireSupabaseAuth`.
   - Lê todas as linhas do usuário no ano em uma única query.
   - Retorna array de 12 itens `{ month, entradas, saidas }` (zeros para meses sem dados).

2. **Novo componente** `YearLineChart` em `src/routes/_authenticated/conferencia.tsx`:
   - SVG puro (sem libs), responsivo via `viewBox`.
   - Duas linhas suaves: entradas (`--color-primary`) e saídas (`--color-danger`).
   - Áreas com baixa opacidade abaixo de cada linha; pontos por mês; mês atual destacado.
   - Eixo X com rótulos `Jan…Dez`; eixo Y escalado pelo maior valor do ano.
   - Tooltip simples (título nativo do SVG) por mês com valores em BRL.
   - Card `neu-raised`, legenda compacta no topo.

3. **Integração**:
   - `useQuery` com key `["year-totals", year]` consumindo `getYearTotals`.
   - Renderizado abaixo do termômetro, visível em qualquer mês.
   - Invalidar `["year-totals", year]` nos `onSuccess` de `addMutation`, `updateMutation` e `deleteMutation` para refletir edições em tempo real.

### Não muda
- Schema/banco/RLS, template padrão, termômetro existente, nenhum pacote novo.