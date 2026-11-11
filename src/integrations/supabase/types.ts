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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          app_url: string | null
          created_at: string
          first_campaign_approved_at: string | null
          owner_id: string
          signature: string
          timezone: string
          updated_at: string
        }
        Insert: {
          app_url?: string | null
          created_at?: string
          first_campaign_approved_at?: string | null
          owner_id: string
          signature?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          app_url?: string | null
          created_at?: string
          first_campaign_approved_at?: string | null
          owner_id?: string
          signature?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_leads: {
        Row: {
          campaign_id: string
          claimed_at: string | null
          created_at: string
          error: string | null
          gmail_thread_id: string | null
          id: string
          lead_id: string
          owner_id: string
          sending_account_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id: string
          owner_id?: string
          sending_account_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id?: string
          owner_id?: string
          sending_account_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          account_ids: string[]
          approved_at: string | null
          batch_size: number
          body: string
          completed_at: string | null
          created_at: string
          daily_limit: number
          id: string
          name: string
          owner_id: string
          started_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_ids?: string[]
          approved_at?: string | null
          batch_size?: number
          body?: string
          completed_at?: string | null
          created_at?: string
          daily_limit?: number
          id?: string
          name: string
          owner_id?: string
          started_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          account_ids?: string[]
          approved_at?: string | null
          batch_size?: number
          body?: string
          completed_at?: string | null
          created_at?: string
          daily_limit?: number
          id?: string
          name?: string
          owner_id?: string
          started_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string
          campaign_id: string | null
          campaign_lead_id: string | null
          created_at: string
          direction: string
          error: string | null
          from_email: string
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          is_test: boolean
          lead_id: string | null
          owner_id: string
          sending_account_id: string | null
          sent_at: string | null
          status: string
          step: number
          subject: string
          to_email: string
        }
        Insert: {
          body?: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_email?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          owner_id?: string
          sending_account_id?: string | null
          sent_at?: string | null
          status?: string
          step?: number
          subject?: string
          to_email: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_email?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          owner_id?: string
          sending_account_id?: string | null
          sent_at?: string | null
          status?: string
          step?: number
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          custom_fields: Json
          designation: string
          email: string
          first_name: string
          id: string
          industry: string
          last_contacted_at: string | null
          last_name: string
          owner_id: string
          source: string
          status: string
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          company?: string
          created_at?: string
          custom_fields?: Json
          designation?: string
          email: string
          first_name?: string
          id?: string
          industry?: string
          last_contacted_at?: string | null
          last_name?: string
          owner_id?: string
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          custom_fields?: Json
          designation?: string
          email?: string
          first_name?: string
          id?: string
          industry?: string
          last_contacted_at?: string | null
          last_name?: string
          owner_id?: string
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      sending_accounts: {
        Row: {
          created_at: string
          daily_limit: number
          email: string
          from_name: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          owner_id: string
          secret_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          email: string
          from_name?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          owner_id?: string
          secret_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          email?: string
          from_name?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          owner_id?: string
          secret_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          note: string
          owner_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          note?: string
          owner_id?: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          note?: string
          owner_id?: string
          reason?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_campaign_stats: {
        Args: never
        Returns: {
          campaign_id: string
          failed: number
          queued: number
          sending: number
          sent: number
          skipped: number
          total: number
        }[]
      }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_sent_counts_since: {
        Args: { _since: string }
        Returns: {
          campaign_id: string
          n: number
          sending_account_id: string
        }[]
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
    Enums: {},
  },
} as const
