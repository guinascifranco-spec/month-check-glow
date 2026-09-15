ALTER TABLE public.month_check_rows
ADD COLUMN expense_class text NOT NULL DEFAULT 'variavel';

ALTER TABLE public.month_check_rows
ADD CONSTRAINT month_check_rows_expense_class_check
CHECK (expense_class IN ('fixo', 'variavel'));

UPDATE public.month_check_rows
SET expense_class = 'fixo'
WHERE tipo = 'saida'
  AND lower(trim(descricao)) IN (
    'aluguel',
    'condomínio',
    'condominio',
    'energia',
    'internet e celular',
    'água',
    'agua',
    'gás',
    'gas',
    'lavanderia',
    'psicólogo',
    'psicologo'
  );