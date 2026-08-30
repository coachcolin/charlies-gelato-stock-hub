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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      flavours: {
        Row: {
          active: boolean
          category: string
          created_at: string
          desired_low: number
          desired_mid: number
          desired_peak: number
          id: string
          image_url: string | null
          name: string
          priority: boolean
          stock_qty: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          desired_low?: number
          desired_mid?: number
          desired_peak?: number
          id?: string
          image_url?: string | null
          name: string
          priority?: boolean
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          desired_low?: number
          desired_mid?: number
          desired_peak?: number
          id?: string
          image_url?: string | null
          name?: string
          priority?: boolean
          stock_qty?: number
          updated_at?: string
        }
        Relationships: []
      }
      freezers: {
        Row: {
          capacity_trays: number
          created_at: string
          current_trays: number
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          capacity_trays?: number
          created_at?: string
          current_trays?: number
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          capacity_trays?: number
          created_at?: string
          current_trays?: number
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      production_report_items: {
        Row: {
          created_at: string
          done: boolean
          flavour_id: string | null
          flavour_name: string
          id: string
          position: number
          produced_qty: number | null
          reason: string | null
          report_id: string
          suggested_qty: number
        }
        Insert: {
          created_at?: string
          done?: boolean
          flavour_id?: string | null
          flavour_name: string
          id?: string
          position?: number
          produced_qty?: number | null
          reason?: string | null
          report_id: string
          suggested_qty?: number
        }
        Update: {
          created_at?: string
          done?: boolean
          flavour_id?: string | null
          flavour_name?: string
          id?: string
          position?: number
          produced_qty?: number | null
          reason?: string | null
          report_id?: string
          suggested_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_report_items_flavour_id_fkey"
            columns: ["flavour_id"]
            isOneToOne: false
            referencedRelation: "flavours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "production_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      production_reports: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          season: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          season?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          season?: string
          status?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          flavour_id: string | null
          flavour_name: string
          id: string
          kind: string
          note: string | null
          order_id: string | null
          qty: number
          session_id: string | null
        }
        Insert: {
          created_at?: string
          flavour_id?: string | null
          flavour_name: string
          id?: string
          kind: string
          note?: string | null
          order_id?: string | null
          qty: number
          session_id?: string | null
        }
        Update: {
          created_at?: string
          flavour_id?: string | null
          flavour_name?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          qty?: number
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_flavour_id_fkey"
            columns: ["flavour_id"]
            isOneToOne: false
            referencedRelation: "flavours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_order_items: {
        Row: {
          created_at: string
          flavour_id: string | null
          flavour_name: string
          id: string
          order_id: string
          qty: number
        }
        Insert: {
          created_at?: string
          flavour_id?: string | null
          flavour_name: string
          id?: string
          order_id: string
          qty?: number
        }
        Update: {
          created_at?: string
          flavour_id?: string | null
          flavour_name?: string
          id?: string
          order_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_items_flavour_id_fkey"
            columns: ["flavour_id"]
            isOneToOne: false
            referencedRelation: "flavours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_future: boolean
          reference: string | null
          send_date: string | null
          status: string
          updated_at: string
          wholesaler: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_future?: boolean
          reference?: string | null
          send_date?: string | null
          status?: string
          updated_at?: string
          wholesaler: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_future?: boolean
          reference?: string | null
          send_date?: string | null
          status?: string
          updated_at?: string
          wholesaler?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_stock_movements: {
        Args: {
          _kind: string
          _movements: Json
          _note?: string
          _order_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
