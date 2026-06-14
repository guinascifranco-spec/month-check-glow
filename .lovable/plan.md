## Month Check — Plano de Implementação

### 1. Infraestrutura
- Habilitar Lovable Cloud (Supabase) para auth e persistência.
- Ajustar `src/styles.css` com tokens de design: fundo `#F0F4F8`, primário Verde Esmeralda `#10B981`, secundário Ciano `#06B6D4`, tipografia Inter.
- Definir utilidades de sombra neumórfica (`@utility`) com sombras duplas claras/escuras para o fundo `#F0F4F8`.

### 2. Banco de Dados (1 tabela)
- `month_check_rows`:
  - `id` UUID PK
  - `user_id` UUID FK → auth.users
  - `year` integer
  - `month` integer (1-12)
  - `descricao` text
  - `tipo` text (`entrada` | `saida`)
  - `valor` numeric
  - `created_at` timestamptz default now()
  - `updated_at` timestamptz
- RLS: usuários só leem/escrevem/apagam suas próprias linhas (`user_id = auth.uid()`).
- GRANTs para `authenticated` e `service_role`.

### 3. Auth
- Páginas `/auth` (login + signup combinados) com Supabase Auth (email/senha).
- Layout protegido `_authenticated/route.tsx` (`ssr: false`, redirect para `/auth`).
- `attachSupabaseAuth` registrado no `src/start.ts`.

### 4. Rotas Públicas
- `/` → redireciona para `/conferencia`.
- `/auth` → formulário de autenticação.

### 5. Rota Protegida (`/_authenticated/conferencia`)
- Página única do app com:
  - **Seletor de mês/ano** com botões ◀ ▶.
  - **Tabela editável** com colunas: Descrição | Tipo | Valor Entrada (R$) | Valor Saída (R$) | Ação (🗑️).
  - **Cards de resumo** na parte superior: Total Entradas (verde), Total Saídas (vermelho), Saldo do Mês (verde/vermelho condicional).
  - **Botões flutuantes ou no topo**: ＋ Entrada e ＋ Saída.

### 6. Comportamentos da Tabela
- **Template automático**: se o mês/ano selecionado não tiver nenhuma linha para o usuário, o server fn insere as 12 linhas padrão (6 entrada, 6 saída).
- **Campo de valor ativo**: se `tipo === 'entrada'`, a coluna "Valor Saída" fica disabled/zerada; vice-versa.
- **Trocar tipo**: ao alterar `tipo`, o valor da linha é zerado e a coluna oposta passa a ser editável.
- **Deletar linha**: sem confirmação; ao clicar no ícone, remove imediatamente.
- **Auto-save**: `onBlur` em qualquer campo dispara save da linha; debounce de 1s para o campo de valor/descrição.

### 7. Server Functions (`src/lib/month-check.functions.ts`)
- `getMonthRows(userId, year, month)` → lista de linhas do mês.
- `ensureTemplate(userId, year, month)` → verifica se existe linha; se não, insere as 12 padrão.
- `upsertRow(id?, userId, year, month, descricao, tipo, valor)` → insert/update.
- `deleteRow(id, userId)` → deleta linha.

### 8. Frontend — Detalhes Técnicos
- Usar `useServerFn` + `useMutation` + `useQuery` (TanStack Query) para carregar e mutar dados.
- Formatação de moeda em BRL (R$) com `Intl.NumberFormat`.
- Estados locais dos inputs controlados por React state; sync para o Supabase via mutations.
- Spinner discreto durante salvamento e erro sutil em caso de falha.

### 9. SEO / Head
- Título e meta da rota principal: "Month Check — Conferência Financeira Mensal".

### 10. Fora de escopo (MVP)
- Gráficos, relatórios, histórico multi-mês comparativo, importação/exportação, categorias customizáveis além do template.
