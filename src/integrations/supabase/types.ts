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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      blocked_slots: {
        Row: {
          court_id: string
          created_at: string
          date: string
          end_time: string
          id: string
          reason: string | null
          start_time: string
        }
        Insert: {
          court_id: string
          created_at?: string
          date: string
          end_time: string
          id?: string
          reason?: string | null
          start_time: string
        }
        Update: {
          court_id?: string
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          reason?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          court_id: string
          created_at: string
          end_time: string
          id: string
          notes: string | null
          payment_intent_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_date: string
          court_id: string
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          start_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_date?: string
          court_id?: string
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          address: string
          amenities: string[] | null
          base_price: number
          city: string
          closing_time: string | null
          created_at: string
          description: string | null
          id: string
          images: string[] | null
          is_active: boolean
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          opening_time: string | null
          owner_id: string
          slug: string
          sport_type: string
          state: string
          status: Database["public"]["Enums"]["court_status"]
          updated_at: string
          zip_code: string
        }
        Insert: {
          address: string
          amenities?: string[] | null
          base_price: number
          city: string
          closing_time?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          name: string
          opening_time?: string | null
          owner_id: string
          slug: string
          sport_type: string
          state: string
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
          zip_code: string
        }
        Update: {
          address?: string
          amenities?: string[] | null
          base_price?: number
          city?: string
          closing_time?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          opening_time?: string | null
          owner_id?: string
          slug?: string
          sport_type?: string
          state?: string
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          court_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          court_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          court_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_active: boolean
          name: string
          price_multiplier: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_active?: boolean
          name: string
          price_multiplier?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_active?: boolean
          name?: string
          price_multiplier?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          related_court_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          related_court_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_court_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_court_id_fkey"
            columns: ["related_court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          court_id: string
          created_at: string
          days_of_week: number[] | null
          end_time: string | null
          fixed_price: number | null
          id: string
          is_active: boolean
          price_multiplier: number
          rule_type: string
          start_time: string | null
        }
        Insert: {
          court_id: string
          created_at?: string
          days_of_week?: number[] | null
          end_time?: string | null
          fixed_price?: number | null
          id?: string
          is_active?: boolean
          price_multiplier?: number
          rule_type: string
          start_time?: string | null
        }
        Update: {
          court_id?: string
          created_at?: string
          days_of_week?: number[] | null
          end_time?: string | null
          fixed_price?: number | null
          id?: string
          is_active?: boolean
          price_multiplier?: number
          rule_type?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          court_id: string
          created_at: string
          id: string
          images: string[] | null
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          court_id: string
          created_at?: string
          id?: string
          images?: string[] | null
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          court_id?: string
          created_at?: string
          id?: string
          images?: string[] | null
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_locks: {
        Row: {
          booking_date: string
          court_id: string
          created_at: string
          end_time: string
          expires_at: string
          id: string
          locked_at: string
          start_time: string
          user_id: string
        }
        Insert: {
          booking_date: string
          court_id: string
          created_at?: string
          end_time: string
          expires_at?: string
          id?: string
          locked_at?: string
          start_time: string
          user_id: string
        }
        Update: {
          booking_date?: string
          court_id?: string
          created_at?: string
          end_time?: string
          expires_at?: string
          id?: string
          locked_at?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_locks_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_slot_locks: { Args: never; Returns: undefined }
      generate_court_slug: {
        Args: { court_id: string; court_name: string }
        Returns: string
      }
      get_court_booking_count: { Args: { court_uuid: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "court_owner" | "customer"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      court_status: "pending" | "approved" | "rejected"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
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
      app_role: ["admin", "court_owner", "customer"],
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      court_status: ["pending", "approved", "rejected"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
    },
  },
} as const
