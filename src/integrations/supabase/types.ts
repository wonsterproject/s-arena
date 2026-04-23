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
      daily_rewards: {
        Row: {
          last_claim_at: string | null
          streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_claim_at?: string | null
          streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_claim_at?: string | null
          streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      match_chat: {
        Row: {
          created_at: string
          id: string
          kind: string
          match_id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          match_id: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          match_id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
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
          bet_amount: number
          created_at: string
          game_type: Database["public"]["Enums"]["game_type"]
          host_id: string
          id: string
          mode: Database["public"]["Enums"]["match_mode"]
          state: Json | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          bet_amount?: number
          created_at?: string
          game_type?: Database["public"]["Enums"]["game_type"]
          host_id: string
          id?: string
          mode: Database["public"]["Enums"]["match_mode"]
          state?: Json | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          bet_amount?: number
          created_at?: string
          game_type?: Database["public"]["Enums"]["game_type"]
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
      matchmaking_queue: {
        Row: {
          bet_amount: number
          created_at: string
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          mode: Database["public"]["Enums"]["match_mode"]
          user_id: string
        }
        Insert: {
          bet_amount?: number
          created_at?: string
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          mode: Database["public"]["Enums"]["match_mode"]
          user_id: string
        }
        Update: {
          bet_amount?: number
          created_at?: string
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          mode?: Database["public"]["Enums"]["match_mode"]
          user_id?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          coins: number
          created_at: string
          easypaisa_name: string | null
          easypaisa_number: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          pkr_amount: number
          resolved_at: string | null
          resolved_by: string | null
          screenshot_url: string | null
          status: Database["public"]["Enums"]["payment_request_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          coins: number
          created_at?: string
          easypaisa_name?: string | null
          easypaisa_number?: string | null
          id?: string
          kind: Database["public"]["Enums"]["payment_kind"]
          pkr_amount: number
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          user_id: string
        }
        Update: {
          admin_note?: string | null
          coins?: number
          created_at?: string
          easypaisa_name?: string | null
          easypaisa_number?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          pkr_amount?: number
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          easypaisa_name: string
          easypaisa_number: string
          id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          easypaisa_name?: string
          easypaisa_number?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          easypaisa_name?: string
          easypaisa_number?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
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
      shop_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          preview: string | null
          price_coins: number
          rarity: Database["public"]["Enums"]["shop_rarity"]
          slug: string
          type: Database["public"]["Enums"]["shop_item_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          preview?: string | null
          price_coins: number
          rarity?: Database["public"]["Enums"]["shop_rarity"]
          slug: string
          type: Database["public"]["Enums"]["shop_item_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          preview?: string | null
          price_coins?: number
          rarity?: Database["public"]["Enums"]["shop_rarity"]
          slug?: string
          type?: Database["public"]["Enums"]["shop_item_type"]
        }
        Relationships: []
      }
      user_inventory: {
        Row: {
          acquired_at: string
          equipped: boolean
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          equipped?: boolean
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          equipped?: boolean
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_match_invite: { Args: { _invite_id: string }; Returns: string }
      admin_grant_item: {
        Args: { _item_id: string; _user_id: string }
        Returns: undefined
      }
      admin_resolve_payment_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_update_profile: {
        Args: {
          _coins?: number
          _display_name?: string
          _losses?: number
          _user_id: string
          _username?: string
          _wins?: number
        }
        Returns: undefined
      }
      claim_daily_reward: {
        Args: never
        Returns: {
          coins_awarded: number
          new_streak: number
          total_coins: number
        }[]
      }
      create_bot_match: { Args: never; Returns: string }
      create_friend_match:
        | {
            Args: {
              _mode: Database["public"]["Enums"]["match_mode"]
              _opponent: string
            }
            Returns: string
          }
        | {
            Args: {
              _bet?: number
              _mode: Database["public"]["Enums"]["match_mode"]
              _opponent: string
            }
            Returns: string
          }
        | {
            Args: {
              _bet?: number
              _game?: Database["public"]["Enums"]["game_type"]
              _mode: Database["public"]["Enums"]["match_mode"]
              _opponent: string
            }
            Returns: string
          }
      create_game_bot_match: {
        Args: { _game: Database["public"]["Enums"]["game_type"] }
        Returns: string
      }
      create_paid_bot_match: {
        Args: { _bet: number; _game: Database["public"]["Enums"]["game_type"] }
        Returns: string
      }
      finalize_match: {
        Args: { _match_id: string; _winner_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_match_participant: {
        Args: { _match_id: string; _user: string }
        Returns: boolean
      }
      join_or_create_game_match: {
        Args: {
          _bet?: number
          _game: Database["public"]["Enums"]["game_type"]
          _mode: Database["public"]["Enums"]["match_mode"]
        }
        Returns: string
      }
      join_or_create_match: {
        Args: { _mode: Database["public"]["Enums"]["match_mode"] }
        Returns: string
      }
      purchase_shop_item: {
        Args: { _item_id: string }
        Returns: {
          success: boolean
          total_coins: number
        }[]
      }
      request_buy_coins: {
        Args: { _coins: number; _screenshot_url: string }
        Returns: string
      }
      request_withdraw_coins: {
        Args: {
          _coins: number
          _easypaisa_name: string
          _easypaisa_number: string
        }
        Returns: string
      }
      update_payment_settings: {
        Args: { _name: string; _number: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      friend_request_status: "pending" | "accepted" | "declined"
      game_type:
        | "ludo"
        | "chess"
        | "carrom"
        | "pool"
        | "arena"
        | "string_carrom"
      invite_status: "pending" | "accepted" | "declined" | "cancelled"
      match_mode: "bot" | "1v1" | "2v2" | "1v2" | "custom" | "random"
      match_status: "waiting" | "active" | "finished" | "cancelled"
      payment_kind: "buy" | "withdraw"
      payment_request_status: "pending" | "approved" | "rejected"
      player_color_enum: "red" | "blue" | "green" | "yellow"
      shop_item_type:
        | "token_skin"
        | "avatar_frame"
        | "dice_skin"
        | "board_theme"
      shop_rarity: "common" | "rare" | "epic" | "legendary"
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
      app_role: ["admin", "moderator", "user"],
      friend_request_status: ["pending", "accepted", "declined"],
      game_type: ["ludo", "chess", "carrom", "pool", "arena", "string_carrom"],
      invite_status: ["pending", "accepted", "declined", "cancelled"],
      match_mode: ["bot", "1v1", "2v2", "1v2", "custom", "random"],
      match_status: ["waiting", "active", "finished", "cancelled"],
      payment_kind: ["buy", "withdraw"],
      payment_request_status: ["pending", "approved", "rejected"],
      player_color_enum: ["red", "blue", "green", "yellow"],
      shop_item_type: [
        "token_skin",
        "avatar_frame",
        "dice_skin",
        "board_theme",
      ],
      shop_rarity: ["common", "rare", "epic", "legendary"],
    },
  },
} as const
