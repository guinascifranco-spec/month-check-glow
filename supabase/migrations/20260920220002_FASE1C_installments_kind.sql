-- Fase 1-C: installments.kind
-- Adiciona coluna kind para distinguir parcelamentos de assinaturas.
-- DEFAULT 'parcelamento' garante que todos os registros existentes permanecem inalterados.

ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'parcelamento'
  CHECK (kind IN ('parcelamento', 'assinatura'));
