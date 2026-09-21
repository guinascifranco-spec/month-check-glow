-- Fase 1-D: ativos — saldo_atual e rentabilidade_mensal_pct
-- Necessário para que a projeção use ativos como fonte de dados de investimentos,
-- substituindo a tabela simples `investments`.

ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS saldo_atual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rentabilidade_mensal_pct numeric NOT NULL DEFAULT 0;
