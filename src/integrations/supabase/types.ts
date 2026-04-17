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
      friend_requests: {
        Row: {
          created_at: string
          from_user: string
          id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          to_user: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          to_user: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          friend_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_invites: {
        Row: {
          created_at: string
          from_user: string
          id: string
          match_id: string
          mode: Database["public"]["Enums"]["match_mode"]
          status: Database["public"]["Enums"]["invite_status"]
          to_user: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          match_id: string
          mode: Database["public"]["Enums"]["match_mode"]
          status?: Database["public"]["Enums"]["invite_status"]
          to_user: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          match_id?: string
          mode?: Database["public"]["Enums"]["match_mode"]
          status?: Database["public"]["Enums"]["invite_status"]
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_invites_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invites_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invites_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          bot_name: string | null
          color: Database["public"]["Enums"]["player_color_enum"]
          is_bot: boolean
          joined_at: string
          match_id: string
          ready: boolean
          team: number
          user_id: string | null
        }
        Insert: {
          bot_name?: string | null
          color: Database["public"]["Enums"]["player_color_enum"]
          is_bot?: boolean
          joined_at?: string
          match_id: string
          ready?: boolean
          team?: number
          user_id?: string | null
        }
        Update: {
          bot_name?: string | null
          color?: Database["public"]["Enums"]["player_color_enum"]
          is_bot?: boolean
          joined_at?: string
          match_id?: string
          ready?: boolean
          team?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          host_id: string
          id: string
          mode: Database["public"]["Enums"]["match_mode"]
          state: Json | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          mode: Database["public"]["Enums"]["match_mode"]
          state?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          mode?: Database["public"]["Enums"]["match_mode"]
          state?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string | null
          id: string
          losses: number
          updated_at: string
          username: string
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string | null
          id: string
          losses?: number
          updated_at?: string
          username: string
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string | null
          id?: string
          losses?: number
          updated_at?: string
          username?: string
          wins?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_match_participant: {
        Args: { _match_id: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      friend_request_status: "pending" | "accepted" | "declined"
      invite_status: "pending" | "accepted" | "declined" | "cancelled"
      match_mode: "bot" | "1v1" | "2v2" | "1v2" | "custom" | "random"
      match_status: "waiting" | "active" | "finished" | "cancelled"
      player_color_enum: "red" | "blue" | "green" | "yellow"
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
      friend_request_status: ["pending", "accepted", "declined"],
      invite_status: ["pending", "accepted", "declined", "cancelled"],
      match_mode: ["bot", "1v1", "2v2", "1v2", "custom", "random"],
      match_status: ["waiting", "active", "finished", "cancelled"],
      player_color_enum: ["red", "blue", "green", "yellow"],
    },
  },
} as const
