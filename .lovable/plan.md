
## Visão Geral

Nova rota `/_authenticated/visao-geral` com três seções (Investimentos, Balanço Geral, Projeção Futura) e navegação entre páginas via top-bar de tabs ("Conferência" / "Visão Geral") presente no header das duas páginas autenticadas.

## 1. Banco de dados

Nova tabela `public.investments` via migração:
- `id` (uuid, pk), `user_id` (uuid), `category` (text), `balance` (numeric), `monthly_return_pct` (numeric), `position` (int), `created_at`, `updated_at`
- RLS: usuário só lê/edita suas próprias linhas (`auth.uid() = user_id`)
- GRANT para `authenticated` e `service_role`; trigger `update_updated_at_column` para `updated_at`

## 2. Server functions (`src/lib/investments.functions.ts`)

- `listInvestments()` — retorna linhas do usuário ordenadas por `position`
- `addInvestment()` — cria linha vazia no final
- `updateInvestment({ id, category?, balance?, monthly_return_pct? })` — patch parcial
- `deleteInvestment({ id })`
- `getAllMonthlyTotals()` — retorna todos os meses lançados pelo usuário com `{ year, month, entradas, saidas, saldo }` (apenas meses que têm pelo menos uma linha com `valor != 0`), ordenado cronologicamente. Servirá como base do gráfico histórico e da projeção.

## 3. Página `src/routes/_authenticated/visao-geral.tsx`

### Header
- Mesmo logo/InstallPWA/Sair da Conferência
- Componente `<PageTabs />` compartilhado com botões "Conferência" e "Visão Geral" (também inserido no header da Conferência)

### Seção Investimentos
- Tabela neumórfica com colunas: Categoria | Saldo (R$) | Rentab. mensal (%) | Ação
- Botão "+ Adicionar investimento"
- Auto-save por linha com debounce de 1s usando `useMutation` (dispara no `onChange`; cada linha tem seu timer). Optimistic update no cache da query.
- Totais (cards abaixo): Total investido = Σ saldo; Rendimento mensal estimado = Σ (saldo × pct/100)

### Seção Balanço Geral
- 3 cards no topo da página:
  - Saldo acumulado = Σ saldo de todos os meses lançados
  - Total investido (vem dos investimentos)
  - Patrimônio total = saldo acumulado + total investido
- Gráfico Recharts `ComposedChart`:
  - Eixo X = meses lançados ("Mai/25", "Jun/25"...)
  - Barra: saldo mensal
  - Linha: saldo acumulado
  - Linha: patrimônio total acumulado (saldo acumulado + Σ rendimento dos investimentos até aquele mês — usando os investimentos atuais projetados retroativamente, ver seção técnica)
  - Tooltip formatado em R$

### Seção Projeção Futura
- Base = média do `saldo` (entradas − saídas) dos últimos 3 meses lançados (ou menos, se houver < 3)
- Rendimento mensal dos investimentos = Σ (saldo × pct/100)
- Iteração: a cada mês, `patrimônio = patrimônio_anterior × (1 + taxa_média_compostos) + saldo_médio`, onde `taxa_média_compostos = rendimento_mensal_investimentos / total_investido` (se total > 0; caso contrário, só soma o saldo médio)
- `Slider` (shadcn) de 6 a 60, passo 6. Label "X meses (Y anos)"
- Gráfico Recharts `AreaChart` com duas séries no mesmo eixo X: passado (área sólida) + projeção (área tracejada com `strokeDasharray`), começando do último mês real
- 3 cards abaixo do gráfico: Patrimônio projetado final, Ganho projetado (final − atual), Contribuição média mensal (saldo médio usado)

### Estilo
- Reuso das classes `neu-raised`, `neu-pressable`, `neu-inset` e tokens existentes (primary verde esmeralda, secondary ciano). Tudo via tokens de `src/styles.css`.

## 4. Dependências

- `bun add recharts` (não presente atualmente)

## 5. Detalhes técnicos

- Patrimônio histórico no gráfico: como não armazenamos snapshot por mês dos investimentos, calculamos a linha como `saldo_acumulado[t] + total_investido_atual` (constante) — alternativa simples e honesta; deixarei comentário no código. Caso o usuário prefira projetar rendimentos retroativos (juros compostos para trás), ajusto depois.
- Formato monetário: helper `brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` reutilizado.
- `useServerFn` + TanStack Query (`useQuery` / `useMutation`) seguindo o padrão da `conferencia.tsx`.
- `<PageTabs />` em `src/components/page-tabs.tsx`, usando `<Link>` do TanStack Router e `useRouterState` para destacar a ativa.
