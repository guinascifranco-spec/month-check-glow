-- Fase 2-A: category_id em checklist_items
-- Adiciona suporte a categorias de despesa na tabela de Conferência,
-- unificando o sistema de categorias com os Lançamentos.

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.expense_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.checklist_items.category_id IS
  'Referência opcional à categoria de despesa (expense_categories). Só relevante para itens do tipo saida.';