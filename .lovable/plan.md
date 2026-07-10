## Nova aba "Investimentos" no Month Check

Aba independente ao lado de Conferência / Visão Geral / Parcelas. "Visão Geral" permanece como está. Patrimônio calculado só pelo custo (aportes + proventos reinvestidos), sem API de cotações. Reinvestimento aceita valor livre.

### 1. Banco de dados (migração Supabase)

Enums e 3 tabelas em `public`, RLS por `auth.uid()`, GRANT `authenticated`/`service_role`, trigger `updated_at`.

- Enum `asset_type`: `acao | fii | renda_fixa | cripto`
- Enum `provento_type`: `dividendo | jcp | rendimento | cupom`
- Enum `provento_status`: `a_reinvestir | reinvestido`

Tabelas:
- `ativos`: `user_id`, `tipo (asset_type)`, `nome` (texto — ticker ou descrição), `corretora` (texto opcional)
- `aportes`: `user_id`, `ativo_id` (FK `ativos` ON DELETE CASCADE), `data` (date), `quantidade` (numeric), `valor_unitario` (numeric), `valor_total` (numeric — gravado; front calcula qtd × unit + taxas), `taxas` (numeric default 0), `is_retroativo` (bool default false)
- `proventos`: `user_id`, `ativo_id` (FK `ativos` ON DELETE CASCADE), `tipo (provento_type)`, `data_recebimento` (date), `valor` (numeric), `status (provento_status)` default `a_reinvestir`, `aporte_reinvestimento_id` (FK `aportes` ON DELETE SET NULL, nullable)

RLS: todas policies escopadas a `auth.uid() = user_id`. Sem grant a `anon`.

### 2. Backend — `src/lib/investments-portfolio.functions.ts`

Novo arquivo (não mexer no `investments.functions.ts` da Visão Geral). Todas com `requireSupabaseAuth`:
- `listAtivos()`, `createAtivo({ tipo, nome, corretora? })`, `deleteAtivo({ id })`
- `listAportes({ ativoId? })`, `createAporte({ ativo_id, data, quantidade, valor_unitario, taxas?, is_retroativo?, provento_id? })` — se `provento_id`, atualiza aquele provento para `reinvestido` + set `aporte_reinvestimento_id` numa transação lógica (duas queries sequenciais com rollback manual do aporte se a segunda falhar)
- `bulkCreateAportesRetroativos({ ativo_id, linhas: [...] })` — para a tela "Popular meu histórico"
- `deleteAporte({ id })` — se estava vinculado a provento, volta o provento pra `a_reinvestir`
- `listProventos({ status?, ativoId? })`, `createProvento({...})`, `deleteProvento({ id })`
- `getDashboard()` — retorna `{ patrimonio_total, proventos_mes, proventos_ano, a_reinvestir }`
- `getEvolucaoPatrimonial({ meses, porTipo })` — retorna série mensal acumulada, opcionalmente separada por `asset_type`
- `getResumoPorAtivo()` — total investido, total proventos e % da carteira por ativo (agrupável no client por tipo)

### 3. Navegação

- `src/components/page-tabs.tsx`: adicionar `{ to: "/investimentos", label: "Investimentos" }`.
- Nova rota `src/routes/_authenticated/investimentos.tsx` com loader `ensureQueryData` (dashboard + ativos + aportes + proventos).

### 4. Página `/investimentos`

Mesmo header (Logo + PageTabs + InstallPWA + Logout). Estilo neumorphic, tokens existentes.

**a) Dashboard (4 cards neu-raised, grid-cols-1 md:grid-cols-4)**
Patrimônio Total · Proventos do Mês · Proventos no Ano · A Reinvestir (destaque cyan).

**b) Gráfico de Evolução Patrimonial** (recharts, já usado em Visão Geral)
- AreaChart mensal (soma acumulada custo dos aportes até o mês, incluindo retroativos).
- Filtro de período: chips `3M / 6M / 12M / Tudo`.
- Toggle "Segmentar por tipo": mostra múltiplas áreas empilhadas (Ações / FIIs / RF / Cripto) usando primary/secondary/dois tons neutros do design.
- Vazio: mensagem amigável.

**c) Ações rápidas** — 2 botões: "Novo aporte", "Novo provento". Botão terciário "Popular meu histórico".

**d) Modal "Novo Aporte"** (Dialog)
- Ativo: combobox com busca; opção "+ Novo ativo" abre subformulário inline (tipo + nome + corretora); ao salvar oferece checkbox "Já tenho posição nesse ativo" → abre linhas de aporte retroativo antes de fechar.
- Campos: data, quantidade, valor unitário, taxas (opcional). Valor total calculado ao vivo (`qtd × unit + taxas`).
- Se veio de "reinvestir provento", campos pré-preenchidos e badge "Reinvestimento de provento".

**e) Modal "Novo Provento"**
- Ativo (combobox + criação inline), tipo, valor, data. Salva como `a_reinvestir`. Toast + botão de undo opcional.

**f) Modal "Popular meu histórico"** (também abrível standalone)
- Seleção de ativo (ou novo).
- Grid de linhas tipo planilha (data, quantidade, valor unitário, valor total autocalculado). Botões +Linha / Remover. Salvar em lote via `bulkCreateAportesRetroativos` marcando `is_retroativo = true`.

**g) Lista de Ativos** — cards agrupados por tipo (accordion ou seções). Cada card: nome, corretora, total investido, total proventos, % da carteira, botão excluir. Ordenação: toggle "Por investido / Por proventos".

**h) Proventos a reinvestir** — seção compacta acima do histórico com os `a_reinvestir`: nome do ativo, valor, data, botão "Marcar como reinvestido" → abre modal de aporte pré-preenchido (valor total = provento; usuário ajusta qtd/unit livremente; ao salvar vincula via `provento_id`).

**i) Histórico** — lista cronológica combinada (aportes + proventos), filtros por tipo (aporte / provento) e por ativo. Aportes com `is_retroativo` recebem badge sutil "histórico". Proventos mostram status (a_reinvestir / reinvestido).

### 5. Regras / detalhes

- Valores em `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- `getDashboard` calcula patrimônio como `SUM(valor_total)` de todos os aportes (retroativos entram; proventos reinvestidos já viram aporte, então não somam de novo).
- Proventos do mês/ano: SUM por `date_trunc` no server.
- "A reinvestir": SUM `valor` onde `status = 'a_reinvestir'`.
- Evolução: query única de aportes agrupada por mês (+ opcionalmente por tipo), acumulada no server. Meses sem movimento herdam o valor do anterior no client.
- Invalidação de queries do TanStack Query após qualquer mutation (dashboard + evolução + listas relacionadas).
- Sem libs novas: `recharts`, `date-fns`, `sonner`, componentes shadcn (Dialog, Command/Combobox, Tabs, Accordion, RadioGroup, Input, Button, Badge) já existem.
- Mobile-first: cards empilham; modais full-width em telas pequenas; tabela do histórico vira lista de cards em `sm:`.

### 6. Fora de escopo

- Cotação em tempo real e valor de mercado (usaremos custo).
- Cálculo de rentabilidade % da posição (sem preço atual não faz sentido).
- Integração com a projeção da Visão Geral (mantida como está, usando a tabela `investments` legada).
