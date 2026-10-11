/** Explicit M1–M6 contract for SQL-nullable arguments and results.
 * Reuses generated legacy types without intersecting incompatible RPC nullability.
 * Keep synchronized with the applied migration files.
 */
import type { Database as LiveDatabase, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type PublicSchema = LiveDatabase["public"];
export type FinancialDatabase = Omit<LiveDatabase, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Functions"> & {
    Tables: Omit<PublicSchema["Tables"], "ativos"> & {
      ativos: {
        Row: {
          corretora: string | null
          currency_code: string
          current_value_known: boolean
          current_value_date: string | null
          created_at: string
          id: string
          nome: string
          rentabilidade_mensal_pct: number
          saldo_atual: number
          tipo: LiveDatabase["public"]["Enums"]["asset_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          corretora?: string | null
          currency_code?: string
          current_value_known?: boolean
          current_value_date?: string | null
          created_at?: string
          id?: string
          nome: string
          rentabilidade_mensal_pct?: number
          saldo_atual?: number
          tipo: LiveDatabase["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          corretora?: string | null
          currency_code?: string
          current_value_known?: boolean
          current_value_date?: string | null
          created_at?: string
          id?: string
          nome?: string
          rentabilidade_mensal_pct?: number
          saldo_atual?: number
          tipo?: LiveDatabase["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          account_type: string
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          opening_balance: number | null
          opening_balance_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number | null
          opening_balance_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number | null
          opening_balance_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_movements: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          credit_card_payment_id: string | null
          created_at: string
          description: string
          effective_date: string
          id: string
          movement_type: string
          transfer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          credit_card_payment_id?: string | null
          created_at?: string
          description: string
          effective_date: string
          id?: string
          movement_type: string
          transfer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          credit_card_payment_id?: string | null
          created_at?: string
          description?: string
          effective_date?: string
          id?: string
          movement_type?: string
          transfer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_transfers: {
        Row: {
          amount: number
          created_at: string
          description: string
          effective_date: string
          from_account_id: string
          id: string
          status: string
          to_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          effective_date: string
          from_account_id: string
          id?: string
          status?: string
          to_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          effective_date?: string
          from_account_id?: string
          id?: string
          status?: string
          to_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          closing_day: number | null
          created_at: string
          currency_code: string
          due_day: number | null
          id: string
          is_active: boolean
          last_four: string | null
          name: string
          payment_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closing_day?: number | null
          created_at?: string
          currency_code?: string
          due_day?: number | null
          id?: string
          is_active?: boolean
          last_four?: string | null
          name: string
          payment_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closing_day?: number | null
          created_at?: string
          currency_code?: string
          due_day?: number | null
          id?: string
          is_active?: boolean
          last_four?: string | null
          name?: string
          payment_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_card_invoices: {
        Row: {
          card_id: string
          closed_at: string | null
          closing_date: string | null
          created_at: string
          currency_code: string
          due_date: string | null
          id: string
          period_end: string
          period_start: string
          source: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          closed_at?: string | null
          closing_date?: string | null
          created_at?: string
          currency_code: string
          due_date?: string | null
          id?: string
          period_end: string
          period_start: string
          source?: string
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          closed_at?: string | null
          closing_date?: string | null
          created_at?: string
          currency_code?: string
          due_date?: string | null
          id?: string
          period_end?: string
          period_start?: string
          source?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_card_payments: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          effective_date: string
          id: string
          idempotency_key: string
          invoice_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          effective_date: string
          id?: string
          idempotency_key: string
          invoice_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          effective_date?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_card_invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          month_check_row_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          month_check_row_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          month_check_row_id?: string
          user_id?: string
        }
        Relationships: []
      }
      benefit_wallet_events: {
        Row: {
          created_at: string
          event_type: string
          idempotency_key: string
          month_check_row_id: string | null
          movement_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          idempotency_key: string
          month_check_row_id?: string | null
          movement_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          idempotency_key?: string
          month_check_row_id?: string | null
          movement_id?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_account_reconciliations: {
        Row: { id: string; user_id: string; account_id: string; account_type: string; currency_code: string; reference_date: string; reported_balance: number; calculated_balance: number | null; difference: number | null; status: string; note: string | null; created_at: string }
        Insert: { id?: string; user_id: string; account_id: string; account_type: string; currency_code: string; reference_date: string; reported_balance: number; calculated_balance?: number | null; difference?: number | null; status: string; note?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; account_id?: string; account_type?: string; currency_code?: string; reference_date?: string; reported_balance?: number; calculated_balance?: number | null; difference?: number | null; status?: string; note?: string | null; created_at?: string }
        Relationships: []
      }
      financial_transfer_cancellations: {
        Row: { id: string; user_id: string; transfer_id: string; reason: string; created_at: string }
        Insert: { id?: string; user_id: string; transfer_id: string; reason: string; created_at?: string }
        Update: { id?: string; user_id?: string; transfer_id?: string; reason?: string; created_at?: string }
        Relationships: []
      }
      investment_valuations: {
        Row: { id: string; user_id: string; asset_id: string; market_value: number; currency_code: string; reference_date: string; recorded_at: string; origin: string; note: string | null }
        Insert: { id?: string; user_id: string; asset_id: string; market_value: number; currency_code: string; reference_date: string; recorded_at?: string; origin?: string; note?: string | null }
        Update: { id?: string; user_id?: string; asset_id?: string; market_value?: number; currency_code?: string; reference_date?: string; recorded_at?: string; origin?: string; note?: string | null }
        Relationships: []
      }
      investment_operation_reversals: {
        Row: { id: string; user_id: string; source_operation_id: string; compensating_movement_id: string; reason: string; effective_date: string; created_at: string }
        Insert: { id?: string; user_id: string; source_operation_id: string; compensating_movement_id: string; reason: string; effective_date: string; created_at?: string }
        Update: { id?: string; user_id?: string; source_operation_id?: string; compensating_movement_id?: string; reason?: string; effective_date?: string; created_at?: string }
        Relationships: []
      }
      investment_cash_operations: {
        Row: {
          request_payload: Json
          amount: number
          asset_id: string
          aporte_id: string | null
          created_at: string
          currency_code: string
          description: string
          effective_date: string
          financial_movement_id: string | null
          id: string
          idempotency_key: string
          operation_type: string
          provento_id: string | null
          user_id: string
        }
        Insert: {
          request_payload: Json
          amount: number
          asset_id: string
          aporte_id?: string | null
          created_at?: string
          currency_code: string
          description: string
          effective_date: string
          financial_movement_id?: string | null
          id?: string
          idempotency_key: string
          operation_type: string
          provento_id?: string | null
          user_id: string
        }
        Update: {
          request_payload?: Json
          amount?: number
          asset_id?: string
          aporte_id?: string | null
          created_at?: string
          currency_code?: string
          description?: string
          effective_date?: string
          financial_movement_id?: string | null
          id?: string
          idempotency_key?: string
          operation_type?: string
          provento_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    };
    Functions: Omit<PublicSchema["Functions"],
      | "cancel_financial_transfer_with_reason" | "record_financial_account_reconciliation"
      | "list_financial_account_reconciliations" | "record_investment_valuation"
      | "list_investment_valuations" | "reverse_investment_cash_operation"
      | "record_investment_contribution" | "record_investment_redemption"
      | "record_investment_dividend_receipt" | "associate_credit_card_invoice_row"
      | "close_credit_card_invoice" | "create_credit_card_invoice"
      | "list_credit_card_invoice_items" | "list_credit_card_invoices"
      | "list_credit_card_payments" | "unlink_credit_card_invoice_row"
      | "list_credit_cards" | "list_unlinked_invoice_rows" | "record_credit_card_payment"
      | "reopen_credit_card_invoice" | "save_credit_card" | "set_credit_card_active"
      | "cancel_financial_transfer" | "record_benefit_wallet_event"
      | "list_benefit_wallet_events" | "list_unlinked_benefit_budget_rows"
      | "unlink_benefit_budget_row" | "create_financial_movement"
      | "create_financial_transfer" | "delete_financial_movement"
      | "financial_account_balances" | "import_invoice_rows"
      | "list_financial_movement_categories" | "list_financial_movements"
      | "update_financial_movement"
    > & {
      cancel_financial_transfer_with_reason: {
        Args: { p_transfer_id: string; p_reason: string }
        Returns: string
      }
      record_financial_account_reconciliation: {
        Args: { p_account_id: string; p_reference_date: string; p_reported_balance_text: string; p_note?: string | null }
        Returns: string
      }
      list_financial_account_reconciliations: {
        Args: { p_account_id?: string | null }
        Returns: { id: string; account_id: string; account_name: string; account_type: string; currency_code: string; reference_date: string; reported_balance: string; calculated_balance: string | null; difference: string | null; status: string; note: string | null; created_at: string }[]
      }
      record_investment_valuation: {
        Args: { p_asset_id: string; p_market_value_text: string; p_reference_date: string; p_note?: string | null }
        Returns: string
      }
      list_investment_valuations: {
        Args: { p_asset_id?: string | null }
        Returns: { id: string; asset_id: string; asset_name: string; market_value: string; currency_code: string; reference_date: string; recorded_at: string; origin: string; note: string | null }[]
      }
      reverse_investment_cash_operation: {
        Args: { p_operation_id: string; p_effective_date: string; p_reason: string }
        Returns: string
      }
      record_investment_contribution: {
        Args: { p_asset_id: string; p_account_id: string; p_effective_date: string; p_quantity_text: string; p_unit_price_text: string; p_fees_text: string; p_description: string; p_idempotency_key: string; p_provento_id?: string | null }
        Returns: string
      }
      record_investment_redemption: {
        Args: { p_asset_id: string; p_account_id: string; p_effective_date: string; p_amount_text: string; p_description: string; p_idempotency_key: string }
        Returns: string
      }
      record_investment_dividend_receipt: {
        Args: { p_asset_id: string; p_provento_id: string; p_account_id: string; p_idempotency_key: string }
        Returns: string
      }
      associate_credit_card_invoice_row: {
        Args: { p_invoice_id: string; p_row_id: string }
        Returns: string
      }
      close_credit_card_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      create_credit_card_invoice: {
        Args: {
          p_card_id: string
          p_closing_date: string | null
          p_due_date: string | null
          p_period_end: string
          p_period_start: string
          p_source?: string
          p_total_text: string
        }
        Returns: string
      }
      list_credit_card_invoice_items: {
        Args: { p_invoice_id: string }
        Returns: {
          descricao: string
          id: string
          invoice_card: string | null
          invoice_installment_current: number | null
          invoice_installment_total: number | null
          invoice_personal_value: string | null
          invoice_responsibility: string | null
          invoice_source: string | null
          tipo: string
          transaction_date: string | null
          valor: string
        }[]
      }
      list_credit_card_invoices: {
        Args: Record<PropertyKey, never>
        Returns: {
          card_id: string
          card_name: string
          closing_date: string | null
          closed_at: string | null
          currency_code: string
          due_date: string | null
          id: string
          item_count: number
          paid_amount: string
          period_end: string
          period_start: string
          remaining_amount: string
          source: string
          total_amount: string
        }[]
      }
      list_credit_card_payments: {
        Args: { p_invoice_id: string }
        Returns: {
          account_id: string
          account_name: string
          amount: string
          created_at: string
          effective_date: string
          id: string
        }[]
      }
      unlink_credit_card_invoice_row: {
        Args: { p_invoice_id: string; p_row_id: string }
        Returns: string
      }
      list_credit_cards: {
        Args: Record<PropertyKey, never>
        Returns: {
          closing_day: number | null
          currency_code: string
          due_day: number | null
          id: string
          is_active: boolean
          last_four: string | null
          name: string
          payment_account_id: string | null
          payment_account_name: string | null
        }[]
      }
      list_unlinked_invoice_rows: {
        Args: { p_limit?: number }
        Returns: {
          descricao: string
          id: string
          invoice_card: string | null
          invoice_installment_current: number | null
          invoice_installment_total: number | null
          invoice_personal_value: string | null
          invoice_responsibility: string | null
          invoice_source: string | null
          tipo: string
          transaction_date: string | null
          valor: string
        }[]
      }
      record_credit_card_payment: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_effective_date: string
          p_idempotency_key: string
          p_invoice_id: string
        }
        Returns: string
      }
      reopen_credit_card_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      save_credit_card: {
        Args: {
          p_closing_day: number | null
          p_currency_code: string
          p_due_day: number | null
          p_id: string | null
          p_last_four: string | null
          p_name: string
          p_payment_account_id: string | null
        }
        Returns: string
      }
      set_credit_card_active: {
        Args: { p_id: string; p_is_active: boolean }
        Returns: string
      }
      cancel_financial_transfer: {
        Args: { p_transfer_id: string }
        Returns: string
      }
      record_benefit_wallet_event: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id: string | null
          p_description: string
          p_effective_date: string
          p_event_type: string
          p_idempotency_key: string
          p_month_check_row_id: string | null
        }
        Returns: string
      }
      list_benefit_wallet_events: {
        Args: { p_account_id: string | null; p_from_date: string; p_to_date: string }
        Returns: {
          account_id: string
          amount: string
          budget_description: string | null
          category_id: string | null
          category_name: string | null
          created_at: string
          description: string
          effective_date: string
          event_type: string
          month_check_row_id: string | null
          movement_id: string
        }[]
      }
      list_unlinked_benefit_budget_rows: {
        Args: Record<PropertyKey, never>
        Returns: { descricao: string; id: string; transaction_date: string; valor: string }[]
      }
      unlink_benefit_budget_row: {
        Args: { p_movement_id: string }
        Returns: string
      }
      create_financial_movement: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id?: string | null
          p_description: string
          p_effective_date: string
          p_movement_type: string
        }
        Returns: string
      }
      create_financial_transfer: {
        Args: {
          p_amount_text: string
          p_description: string
          p_effective_date: string
          p_from_account_id: string
          p_to_account_id: string
        }
        Returns: string
      }
      delete_financial_movement: {
        Args: { p_id: string }
        Returns: undefined
      }
      financial_account_balances: {
        Args: { p_as_of_date: string }
        Returns: {
          account_id: string
          calculated_balance: string | null
          currency_code: string
          is_active: boolean
          opening_balance: string | null
          opening_balance_date: string | null
          recorded_net_activity: string
        }[]
      }
      import_invoice_rows: {
        Args: {
          p_acknowledge?: boolean
          p_card: string
          p_dry_run?: boolean
          p_rows: Json
          p_source: string
        }
        Returns: Json
      }
      list_financial_movement_categories: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; name: string }[]
      }
      list_financial_movements: {
        Args: { p_account_id?: string | null; p_from_date: string; p_to_date: string }
        Returns: {
          account_id: string
          account_name: string
          amount: string
          category_id: string | null
          category_name: string | null
          created_at: string
          description: string
          effective_date: string
          id: string
          movement_type: string
          related_account_name: string | null
          transfer_id: string | null
          transfer_status: string | null
        }[]
      }
      update_financial_movement: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id?: string | null
          p_description: string
          p_effective_date: string
          p_id: string
          p_movement_type: string
        }
        Returns: string
      }
    };
  };
};

// The existing authenticated client's public schema carries the same fetch/auth.
// This explicit contract changes types only: no client creation or connection change.
export function financialSchema(client: SupabaseClient<LiveDatabase>) {
  return client.schema("public") as unknown as ReturnType<SupabaseClient<FinancialDatabase>["schema"]>;
}
