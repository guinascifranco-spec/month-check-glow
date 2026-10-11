export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aportes: {
        Row: {
          ativo_id: string
          created_at: string
          data: string
          id: string
          is_retroativo: boolean
          quantidade: number
          taxas: number
          updated_at: string
          user_id: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          ativo_id: string
          created_at?: string
          data: string
          id?: string
          is_retroativo?: boolean
          quantidade?: number
          taxas?: number
          updated_at?: string
          user_id: string
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          ativo_id?: string
          created_at?: string
          data?: string
          id?: string
          is_retroativo?: boolean
          quantidade?: number
          taxas?: number
          updated_at?: string
          user_id?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "aportes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos: {
        Row: {
          corretora: string | null
          created_at: string
          currency_code: string
          current_value_date: string | null
          current_value_known: boolean
          id: string
          nome: string
          rentabilidade_mensal_pct: number
          saldo_atual: number
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          corretora?: string | null
          created_at?: string
          currency_code?: string
          current_value_date?: string | null
          current_value_known?: boolean
          id?: string
          nome: string
          rentabilidade_mensal_pct?: number
          saldo_atual?: number
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          corretora?: string | null
          created_at?: string
          currency_code?: string
          current_value_date?: string | null
          current_value_known?: boolean
          id?: string
          nome?: string
          rentabilidade_mensal_pct?: number
          saldo_atual?: number
          tipo?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "benefit_wallet_events_budget_row_owner_fk"
            columns: ["month_check_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "month_check_rows"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "benefit_wallet_events_movement_owner_fk"
            columns: ["movement_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_movements"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          keyword: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          keyword: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          keyword?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          category_id: string | null
          created_at: string
          descricao: string
          expense_class: string
          id: string
          month: number
          position: number
          quitado: boolean
          source_month_check_row_id: string | null
          tipo: string
          updated_at: string
          user_id: string
          valor: number
          year: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          descricao?: string
          expense_class?: string
          id?: string
          month: number
          position?: number
          quitado?: boolean
          source_month_check_row_id?: string | null
          tipo: string
          updated_at?: string
          user_id: string
          valor?: number
          year: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          descricao?: string
          expense_class?: string
          id?: string
          month?: number
          position?: number
          quitado?: boolean
          source_month_check_row_id?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "credit_card_invoice_items_invoice_owner_fk"
            columns: ["invoice_id", "user_id"]
            isOneToOne: false
            referencedRelation: "credit_card_invoices"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "credit_card_invoice_items_row_owner_fk"
            columns: ["month_check_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "month_check_rows"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "credit_card_invoices_card_owner_fk"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "credit_card_payments_account_owner_fk"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "credit_card_payments_invoice_owner_fk"
            columns: ["invoice_id", "user_id"]
            isOneToOne: false
            referencedRelation: "credit_card_invoices"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "credit_cards_payment_account_owner_fk"
            columns: ["payment_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color_key: string
          created_at: string
          id: string
          monthly_budget: number | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_key?: string
          created_at?: string
          id?: string
          monthly_budget?: number | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_key?: string
          created_at?: string
          id?: string
          monthly_budget?: number | null
          name?: string
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
          created_at: string
          credit_card_payment_id: string | null
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
          created_at?: string
          credit_card_payment_id?: string | null
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
          created_at?: string
          credit_card_payment_id?: string | null
          description?: string
          effective_date?: string
          id?: string
          movement_type?: string
          transfer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_movements_account_owner_fk"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "financial_movements_card_payment_owner_fk"
            columns: ["credit_card_payment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "credit_card_payments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "financial_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_movements_transfer_owner_fk"
            columns: ["transfer_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_transfers"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "financial_transfers_from_owner_fk"
            columns: ["from_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "financial_transfers_to_owner_fk"
            columns: ["to_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      installment_settings: {
        Row: {
          created_at: string
          monthly_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          monthly_limit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          monthly_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          created_at: string
          first_date: string
          id: string
          installment_value: number
          kind: string
          name: string
          position: number
          total_installments: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_date: string
          id?: string
          installment_value?: number
          kind?: string
          name?: string
          position?: number
          total_installments?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_date?: string
          id?: string
          installment_value?: number
          kind?: string
          name?: string
          position?: number
          total_installments?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_cash_operations: {
        Row: {
          amount: number
          aporte_id: string | null
          asset_id: string
          created_at: string
          currency_code: string
          description: string
          effective_date: string
          financial_movement_id: string | null
          id: string
          idempotency_key: string
          operation_type: string
          provento_id: string | null
          request_payload: Json
          user_id: string
        }
        Insert: {
          amount: number
          aporte_id?: string | null
          asset_id: string
          created_at?: string
          currency_code: string
          description: string
          effective_date: string
          financial_movement_id?: string | null
          id?: string
          idempotency_key: string
          operation_type: string
          provento_id?: string | null
          request_payload: Json
          user_id: string
        }
        Update: {
          amount?: number
          aporte_id?: string | null
          asset_id?: string
          created_at?: string
          currency_code?: string
          description?: string
          effective_date?: string
          financial_movement_id?: string | null
          id?: string
          idempotency_key?: string
          operation_type?: string
          provento_id?: string | null
          request_payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_cash_operations_aporte_owner_fk"
            columns: ["aporte_id", "user_id"]
            isOneToOne: false
            referencedRelation: "aportes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "investment_cash_operations_asset_owner_fk"
            columns: ["asset_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "investment_cash_operations_movement_owner_fk"
            columns: ["financial_movement_id", "user_id"]
            isOneToOne: false
            referencedRelation: "financial_movements"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "investment_cash_operations_provento_owner_fk"
            columns: ["provento_id", "user_id"]
            isOneToOne: false
            referencedRelation: "proventos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      investments: {
        Row: {
          balance: number
          category: string
          created_at: string
          id: string
          monthly_return_pct: number
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          category?: string
          created_at?: string
          id?: string
          monthly_return_pct?: number
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          category?: string
          created_at?: string
          id?: string
          monthly_return_pct?: number
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_ai_access_state: {
        Row: {
          id: boolean
          message: string
          status: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          message: string
          status: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          message?: string
          status?: number
          updated_at?: string
        }
        Relationships: []
      }
      month_check_rows: {
        Row: {
          category_id: string | null
          created_at: string
          descricao: string
          expense_class: string
          id: string
          invoice_card: string | null
          invoice_installment_current: number | null
          invoice_installment_total: number | null
          invoice_line: number | null
          invoice_payment: boolean
          invoice_personal_value: number | null
          invoice_responsibility: string | null
          invoice_source: string | null
          month: number
          position: number
          quitado: boolean
          tipo: string
          transaction_date: string | null
          updated_at: string
          user_id: string
          valor: number
          year: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          descricao?: string
          expense_class?: string
          id?: string
          invoice_card?: string | null
          invoice_installment_current?: number | null
          invoice_installment_total?: number | null
          invoice_line?: number | null
          invoice_payment?: boolean
          invoice_personal_value?: number | null
          invoice_responsibility?: string | null
          invoice_source?: string | null
          month: number
          position?: number
          quitado?: boolean
          tipo: string
          transaction_date?: string | null
          updated_at?: string
          user_id: string
          valor?: number
          year: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          descricao?: string
          expense_class?: string
          id?: string
          invoice_card?: string | null
          invoice_installment_current?: number | null
          invoice_installment_total?: number | null
          invoice_line?: number | null
          invoice_payment?: boolean
          invoice_personal_value?: number | null
          invoice_responsibility?: string | null
          invoice_source?: string | null
          month?: number
          position?: number
          quitado?: boolean
          tipo?: string
          transaction_date?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "month_check_rows_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      proventos: {
        Row: {
          aporte_reinvestimento_id: string | null
          ativo_id: string
          created_at: string
          data_recebimento: string
          id: string
          status: Database["public"]["Enums"]["provento_status"]
          tipo: Database["public"]["Enums"]["provento_type"]
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          aporte_reinvestimento_id?: string | null
          ativo_id: string
          created_at?: string
          data_recebimento: string
          id?: string
          status?: Database["public"]["Enums"]["provento_status"]
          tipo: Database["public"]["Enums"]["provento_type"]
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          aporte_reinvestimento_id?: string | null
          ativo_id?: string
          created_at?: string
          data_recebimento?: string
          id?: string
          status?: Database["public"]["Enums"]["provento_status"]
          tipo?: Database["public"]["Enums"]["provento_type"]
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "proventos_aporte_reinvestimento_id_fkey"
            columns: ["aporte_reinvestimento_id"]
            isOneToOne: false
            referencedRelation: "aportes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proventos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      associate_credit_card_invoice_row: {
        Args: { p_invoice_id: string; p_row_id: string }
        Returns: string
      }
      cancel_financial_transfer: {
        Args: { p_transfer_id: string }
        Returns: string
      }
      close_credit_card_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      create_credit_card_invoice: {
        Args: {
          p_card_id: string
          p_closing_date: string
          p_due_date: string
          p_period_end: string
          p_period_start: string
          p_source?: string
          p_total_text: string
        }
        Returns: string
      }
      create_financial_movement: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id?: string
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
      delete_financial_movement: { Args: { p_id: string }; Returns: undefined }
      financial_account_balances: {
        Args: { p_as_of_date: string }
        Returns: {
          account_id: string
          calculated_balance: string
          currency_code: string
          is_active: boolean
          opening_balance: string
          opening_balance_date: string
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
      list_benefit_wallet_events: {
        Args: { p_account_id: string; p_from_date: string; p_to_date: string }
        Returns: {
          account_id: string
          amount: string
          budget_description: string
          category_id: string
          category_name: string
          created_at: string
          description: string
          effective_date: string
          event_type: string
          month_check_row_id: string
          movement_id: string
        }[]
      }
      list_credit_card_invoice_items: {
        Args: { p_invoice_id: string }
        Returns: {
          descricao: string
          id: string
          invoice_card: string
          invoice_installment_current: number
          invoice_installment_total: number
          invoice_personal_value: string
          invoice_responsibility: string
          invoice_source: string
          tipo: string
          transaction_date: string
          valor: string
        }[]
      }
      list_credit_card_invoices: {
        Args: never
        Returns: {
          card_id: string
          card_name: string
          closed_at: string
          closing_date: string
          currency_code: string
          due_date: string
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
      list_credit_cards: {
        Args: never
        Returns: {
          closing_day: number
          currency_code: string
          due_day: number
          id: string
          is_active: boolean
          last_four: string
          name: string
          payment_account_id: string
          payment_account_name: string
        }[]
      }
      list_financial_movement_categories: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      list_financial_movements: {
        Args: { p_account_id?: string; p_from_date: string; p_to_date: string }
        Returns: {
          account_id: string
          account_name: string
          amount: string
          category_id: string
          category_name: string
          created_at: string
          description: string
          effective_date: string
          id: string
          movement_type: string
          related_account_name: string
          transfer_id: string
          transfer_status: string
        }[]
      }
      list_unlinked_benefit_budget_rows: {
        Args: never
        Returns: {
          descricao: string
          id: string
          transaction_date: string
          valor: string
        }[]
      }
      list_unlinked_invoice_rows: {
        Args: { p_limit?: number }
        Returns: {
          descricao: string
          id: string
          invoice_card: string
          invoice_installment_current: number
          invoice_installment_total: number
          invoice_personal_value: string
          invoice_responsibility: string
          invoice_source: string
          tipo: string
          transaction_date: string
          valor: string
        }[]
      }
      record_benefit_wallet_event: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id: string
          p_description: string
          p_effective_date: string
          p_event_type: string
          p_idempotency_key: string
          p_month_check_row_id: string
        }
        Returns: string
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
      record_investment_contribution: {
        Args: {
          p_account_id: string
          p_asset_id: string
          p_description: string
          p_effective_date: string
          p_fees_text: string
          p_idempotency_key: string
          p_provento_id?: string
          p_quantity_text: string
          p_unit_price_text: string
        }
        Returns: string
      }
      record_investment_dividend_receipt: {
        Args: {
          p_account_id: string
          p_asset_id: string
          p_idempotency_key: string
          p_provento_id: string
        }
        Returns: string
      }
      record_investment_redemption: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_asset_id: string
          p_description: string
          p_effective_date: string
          p_idempotency_key: string
        }
        Returns: string
      }
      reopen_credit_card_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      save_credit_card: {
        Args: {
          p_closing_day: number
          p_currency_code: string
          p_due_day: number
          p_id: string
          p_last_four: string
          p_name: string
          p_payment_account_id: string
        }
        Returns: string
      }
      set_credit_card_active: {
        Args: { p_id: string; p_is_active: boolean }
        Returns: string
      }
      unlink_benefit_budget_row: {
        Args: { p_movement_id: string }
        Returns: string
      }
      unlink_credit_card_invoice_row: {
        Args: { p_invoice_id: string; p_row_id: string }
        Returns: string
      }
      update_financial_movement: {
        Args: {
          p_account_id: string
          p_amount_text: string
          p_category_id?: string
          p_description: string
          p_effective_date: string
          p_id: string
          p_movement_type: string
        }
        Returns: string
      }
    }
    Enums: {
      asset_type: "acao" | "fii" | "renda_fixa" | "cripto"
      provento_status: "a_reinvestir" | "reinvestido"
      provento_type: "dividendo" | "jcp" | "rendimento" | "cupom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_type: ["acao", "fii", "renda_fixa", "cripto"],
      provento_status: ["a_reinvestir", "reinvestido"],
      provento_type: ["dividendo", "jcp", "rendimento", "cupom"],
    },
  },
} as const
