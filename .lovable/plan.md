## Nova aba "Parcelas" no Month Check

Adiciona uma terceira aba ao lado de Conferência e Visão Geral para gerenciar gastos parcelados, com limite mensal, resumo, cadastro, lista de ativas e histórico de quitadas.

### 1. Banco de dados (migração Supabase)

Duas novas tabelas em `public`, com RLS por `auth.uid()`, GRANTs para `authenticated`/`service_role`, trigger de `updated_at`:

- `installment_settings`
  - `user_id` (uuid, PK) — uma linha por usuário
  - `monthly_limit` (numeric, default 0)
- `installments`
  - `id` (uuid, PK)
  - `user_id` (uuid)
  - `name` (text)
  - `first_date` (date) — data da 1ª parcela
  - `installment_value` (numeric) — valor mensal
  - `total_installments` (int)
  - `total_amount` (numeric) — `installment_value * total_installments`
  - `position` (int)

Status (ativo/quitado) e número de parcelas pagas são **derivados** da data atual e de `first_date + total_installments`, evitando manutenção manual. Quando `today >= first_date + total_installments meses`, a compra aparece no Histórico automaticamente.

### 2. Backend — `src/lib/installments.functions.ts`

Server functions com `requireSupabaseAuth`:
- `getSettings()` / `upsertLimit({ monthly_limit })`
- `listInstallments()` — retorna todas as compras do usuário
- `addInstallment({ name, first_date, installment_value, total_installments })`
- `updateInstallment(...)` / `deleteInstallment(id)`

Cálculo de status (ativo / restantes / data de término) feito no cliente a partir de `first_date` + `total_installments`, usando `date-fns` (já em uso no projeto — verificar; caso contrário, usar `Date` nativo).

### 3. Navegação

- `src/components/page-tabs.tsx`: adicionar `{ to: "/parcelas", label: "Parcelas" }`.
- Nova rota: `src/routes/_authenticated/parcelas.tsx`.

### 4. Página `/parcelas`

Layout neumorphic consistente com Conferência e Visão Geral (mesmo header com Logo, PageTabs, InstallPWAButton, LogOut).

**Topo — Limite mensal**
- Input numérico (R$) com auto-save (debounce 1s, mesmo padrão do Visão Geral).
- Barra de progresso (`Progress` do shadcn já existente) com cor dinâmica:
  - `< 70%` verde (primary)
  - `70–90%` amarelo
  - `> 90%` vermelho (destructive)
- Texto: `R$ X de R$ Y comprometido (Z%)`.

**Cards de resumo (3 cards neu-raised)**
- Total comprometido = soma de `installment_value` das ativas
- Próximas a vencer = quantidade de ativas que terminam nos próximos 2 meses
- Maior parcela = compra ativa com maior `installment_value` (nome + valor)

**Botão "Nova Compra" → modal (Dialog)**
- Campos: Nome, Data 1ª parcela (date input), Nº de parcelas.
- Toggle (RadioGroup) Modo A / Modo B:
  - A: input "Valor total" → preview do valor mensal
  - B: input "Valor da parcela mensal" → preview do total
- Preview ao vivo mostrando ambos os valores formatados em R$.
- Aviso vermelho não-bloqueante quando `total_comprometido + nova_parcela > limite`, mostrando "Excederia em R$ X. Disponível: R$ Y".
- Salva sempre `installment_value` e `total_installments` (o total é derivado).

**Lista de ativas**
- Cards (não tabela), um por compra, ordenados por data de término ASC.
- Conteúdo: nome, R$ parcela/mês, badge `pago/total` (ex: `4/12`), data de término (`MMM/AA`), mini-barra de progresso de parcelas pagas, botão excluir.

**Seção Histórico (colapsável ou abaixo)**
- Compras cujo término já passou.
- Mostra: nome, valor total pago, período (início → fim), data de quitação.

### 5. Design / regras

- Tokens existentes (`neu-raised`, `neu-inset`, `neu-pressable`, primary `#10B981`, secondary `#06B6D4`, fundo `#F0F4F8`, Inter).
- Valores em `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Mobile-friendly: grid responsivo (`grid-cols-1 md:grid-cols-3` nos cards), modal full-width em telas pequenas.
- Sem bibliotecas novas (Dialog, Progress, RadioGroup, Input, Button já existem em `src/components/ui`).

### Detalhes técnicos

- Loader da rota usa `ensureQueryData` para `getSettings` + `listInstallments` (padrão TanStack Query + `_authenticated`).
- Auto-save do limite: `useRef` timer (mesmo padrão do `visao-geral.tsx`).
- Status derivado: `monthsElapsed = diff(today, first_date)`; `paid = clamp(monthsElapsed + 1, 0, total)`; `remaining = total - paid`; `endDate = first_date + (total - 1) meses`.
- RLS: todas as policies escopadas em `auth.uid() = user_id`; sem grant a `anon`.
