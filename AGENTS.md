# Architecture rules

- Keep historical `month_check_rows` separate from the `checklist_items` displayed in Conferência; this lets a monthly planning checklist coexist with dated Lançamentos.
- When restoring historical rows into `checklist_items`, retain `source_month_check_row_id` and its per-user unique index; this makes recovery traceable and idempotent without deleting more recent edits.