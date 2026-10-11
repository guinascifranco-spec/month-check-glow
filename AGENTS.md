# Architecture rules

- Keep historical `month_check_rows` separate from the `checklist_items` displayed in Conferência; this lets a monthly planning checklist coexist with dated Lançamentos.
- When restoring historical rows into `checklist_items`, retain `source_month_check_row_id` and its per-user unique index; this makes recovery traceable and idempotent without deleting more recent edits.
- Store a recurring optional category budget on each expense category and aggregate actual spending from dated `month_check_rows` only; this avoids mixing plans and installment schedules into actual spending.
- Invoice analysis uses an authenticated streaming server route with server-only Lovable AI helpers and memory-only documents; this prevents credentials and documents from entering client bundles or public storage.
- Invoice imports use owner-scoped atomic RPC with original-file hash and original line index, plus optional metadata on existing transactions; this preserves reviewed installments without creating future schedules or duplicating confirmed imports.
- Persist terminal AI access blocks server-side and require explicit restoration before fresh analysis; this prevents repeated billed requests during account or provider denials.
- Keep invoice integral values for reconciliation and deduplication; use personalContribution for all consumption metrics, classifying invoice credits as expense offsets and explicit invoice payments as neutral, while null responsibility preserves legacy behavior.
- Financial SQL regressions must run only against a disposable local PostgreSQL cluster with an explicit socket and port; this prevents tests from reaching the connected production database.
- Investment retries compare a normalized stored request under a per-owner/key transaction lock; this rejects key reuse with different parameters without duplicating cash activity.
- Financial SQL-nullable RPC arguments use an explicit app-owned contract replacing overlapping generated function types on the existing authenticated client; this preserves SQL NULL semantics without editing generated types or creating another connection.
- Bun unit tests run separately from the application compiler; this prevents Bun runtime declarations from changing the Worker's fetch types.
- Investment cost metrics and charts share reversal record filtering; this prevents cancelled contributions from remaining in accumulated cost while retaining audit rows.