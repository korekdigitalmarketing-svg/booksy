// Generated from the live schema (originally via the Supabase MCP
// `generate_typescript_types` tool against project inwpgzbgeczlxmbiurkq;
// the schema is identical on the current project, myldwjqjkolscitcfuvp —
// this file is schema-derived, not project-specific). Do not hand-edit —
// regenerate after every migration instead, so this file never drifts
// from supabase/migrations/.
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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      availability_rules: {
        Row: {
          end_time: string
          id: string
          owner_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          owner_id: string
          start_time: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          owner_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          access_token: string
          amount_cents: number
          blocked_from: string
          blocked_period: unknown
          blocked_to: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          ends_at: string
          event_type_id: string
          hold_expires_at: string | null
          id: string
          invitee_email: string
          invitee_locale: string
          invitee_name: string
          invitee_notes: string | null
          invitee_phone: string | null
          invitee_timezone: string
          owner_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          access_token?: string
          amount_cents?: number
          blocked_from: string
          blocked_period?: unknown
          blocked_to: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          ends_at: string
          event_type_id: string
          hold_expires_at?: string | null
          id?: string
          invitee_email: string
          invitee_locale: string
          invitee_name: string
          invitee_notes?: string | null
          invitee_phone?: string | null
          invitee_timezone: string
          owner_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          access_token?: string
          amount_cents?: number
          blocked_from?: string
          blocked_period?: unknown
          blocked_to?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          ends_at?: string
          event_type_id?: string
          hold_expires_at?: string | null
          id?: string
          invitee_email?: string
          invitee_locale?: string
          invitee_name?: string
          invitee_notes?: string | null
          invitee_phone?: string | null
          invitee_timezone?: string
          owner_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      date_overrides: {
        Row: {
          end_time: string | null
          id: string
          is_closed: boolean
          owner_id: string
          start_time: string | null
          the_date: string
        }
        Insert: {
          end_time?: string | null
          id?: string
          is_closed?: boolean
          owner_id: string
          start_time?: string | null
          the_date: string
        }
        Update: {
          end_time?: string | null
          id?: string
          is_closed?: boolean
          owner_id?: string
          start_time?: string | null
          the_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_overrides_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          buffer_after_min: number
          buffer_before_min: number
          created_at: string
          currency: string
          description: Json
          duration_min: number
          id: string
          is_active: boolean
          location_kind: Database["public"]["Enums"]["location_type"]
          location_value: string | null
          max_days_ahead: number
          max_per_day: number | null
          min_notice_min: number
          owner_id: string
          price_cents: number
          requires_payment: boolean | null
          slot_increment_min: number
          slug: string
          title: Json
        }
        Insert: {
          buffer_after_min?: number
          buffer_before_min?: number
          created_at?: string
          currency?: string
          description?: Json
          duration_min: number
          id?: string
          is_active?: boolean
          location_kind?: Database["public"]["Enums"]["location_type"]
          location_value?: string | null
          max_days_ahead?: number
          max_per_day?: number | null
          min_notice_min?: number
          owner_id: string
          price_cents?: number
          requires_payment?: boolean | null
          slot_increment_min?: number
          slug: string
          title: Json
        }
        Update: {
          buffer_after_min?: number
          buffer_before_min?: number
          created_at?: string
          currency?: string
          description?: Json
          duration_min?: number
          id?: string
          is_active?: boolean
          location_kind?: Database["public"]["Enums"]["location_type"]
          location_value?: string | null
          max_days_ahead?: number
          max_per_day?: number | null
          min_notice_min?: number
          owner_id?: string
          price_cents?: number
          requires_payment?: boolean | null
          slot_increment_min?: number
          slug?: string
          title?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_types_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          booking_id: string
          id: string
          kind: string
          provider_id: string | null
          sent_at: string
        }
        Insert: {
          booking_id: string
          id?: string
          kind: string
          provider_id?: string | null
          sent_at?: string
        }
        Update: {
          booking_id?: string
          id?: string
          kind?: string
          provider_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          event_id: string
          processed_at: string
        }
        Insert: {
          event_id: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brand_color: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          locale: string
          slug: string
          timezone: string
        }
        Insert: {
          avatar_url?: string | null
          brand_color?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          locale?: string
          slug: string
          timezone?: string
        }
        Update: {
          avatar_url?: string | null
          brand_color?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          locale?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      booking_status:
        | "pending_payment"
        | "confirmed"
        | "cancelled_by_host"
        | "cancelled_by_client"
        | "expired"
        | "no_show"
      location_type: "video" | "phone" | "in_person" | "custom"
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
    Enums: {
      booking_status: [
        "pending_payment",
        "confirmed",
        "cancelled_by_host",
        "cancelled_by_client",
        "expired",
        "no_show",
      ],
      location_type: ["video", "phone", "in_person", "custom"],
    },
  },
} as const
