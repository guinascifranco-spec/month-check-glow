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
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          corretora?: string | null
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          corretora?: string | null
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          name?: string
          position?: number
          total_installments?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      month_check_rows: {
        Row: {
          created_at: string
          descricao: string
          id: string
          month: number
          position: number
          quitado: boolean
          tipo: string
          updated_at: string
          user_id: string
          valor: number
          year: number
        }
        Insert: {
          created_at?: string
          descricao?: string
          id?: string
          month: number
          position?: number
          quitado?: boolean
          tipo: string
          updated_at?: string
          user_id: string
          valor?: number
          year: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          month?: number
          position?: number
          quitado?: boolean
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
          year?: number
        }
        Relationships: []
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
      [_ in never]: never
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
