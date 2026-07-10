## Objetivo
Na aba **Conferência**, permitir:
1. **Reordenar** as linhas de lançamentos manualmente (arrastar e soltar).
2. **Marcar como Quitado** cada lançamento (checkbox de controle pessoal, sem afetar os totais).

## Mudanças

### Banco de dados
- Adicionar coluna `quitado boolean not null default false` em `month_check_rows`.
- Nova server function `reorderRows({ year, month, orderedIds })` que atualiza `position` em lote, escopo do usuário autenticado.
- Estender `updateRow` para aceitar `quitado?: boolean`.

### UI (`src/routes/_authenticated/conferencia.tsx`)
- **Reordenação**: adicionar uma coluna de "alça" (ícone `GripVertical`) no início de cada linha. Usar drag-and-drop nativo HTML5 (sem nova dependência) para reordenar dentro do mesmo grupo (entradas com entradas, saídas com saídas — evita confusão com a coluna de valor). Ao soltar, atualiza estado local otimista e chama `reorderRows`.
- **Quitado**: adicionar coluna com checkbox neumórfico. Quando marcado:
  - Linha ganha visual "concluído": texto com `line-through` e opacidade reduzida.
  - Estado persistido via `updateRow({ quitado })` com o mesmo debounce/auto-save existente.
- **Totais e termômetro/gráficos**: continuam somando todos os valores independentemente de `quitado` (é apenas marcação pessoal, conforme pedido).

## Detalhes técnicos
- Drag-and-drop: `draggable`, `onDragStart`, `onDragOver`, `onDrop` nas `<tr>`. Restringir drop ao mesmo `tipo` da linha arrastada.
- Persistência de ordem: enviar apenas os IDs do grupo afetado; server function faz `update ... set position = idx` em transação por linha (loop com `.in` batch). RLS por `user_id`.
- Tipos do Supabase serão regenerados após a migração; o campo `quitado` aparecerá automaticamente em `Row/Insert/Update`.

## Fora do escopo
- Reordenação entre grupos entrada/saída.
- Impacto de "quitado" em totais, termômetro ou gráfico anual.
- Filtros por status quitado.