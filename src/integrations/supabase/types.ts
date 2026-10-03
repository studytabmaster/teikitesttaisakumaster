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
      app_state: {
        Row: {
          key: string
          last_run_at: string
        }
        Insert: {
          key: string
          last_run_at?: string
        }
        Update: {
          key?: string
          last_run_at?: string
        }
        Relationships: []
      }
      banned_ips: {
        Row: {
          created_at: string
          created_by: string | null
          ip: string
          reason: string
          until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ip: string
          reason?: string
          until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ip?: string
          reason?: string
          until?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          created_at: string
          from_user: string
          id: string
          kind: string
          payload: Json | null
          to_user: string
          video: boolean
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          kind: string
          payload?: Json | null
          to_user: string
          video?: boolean
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          kind?: string
          payload?: Json | null
          to_user?: string
          video?: boolean
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      group_join_requests: {
        Row: {
          created_at: string
          group_id: string
          id: string
          message: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          message?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          message?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          image_url: string | null
          media_type: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          group_id: string
          id?: string
          image_url?: string | null
          media_type?: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          image_url?: string | null
          media_type?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      group_reads: {
        Row: {
          created_at: string
          group_id: string
          id: string
          last_read_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          last_read_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          last_read_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_reads_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string
          id: string
          is_adult: boolean
          is_open: boolean
          name: string
          owner_id: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_adult?: boolean
          is_open?: boolean
          name?: string
          owner_id: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_adult?: boolean
          is_open?: boolean
          name?: string
          owner_id?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          media_type: string
          read_at: string | null
          receiver_id: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          media_type?: string
          read_at?: string | null
          receiver_id: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          media_type?: string
          read_at?: string | null
          receiver_id?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adult_verified_at: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          friend_code: string
          id: string
          status_message: string
          updated_at: string
          username: string | null
        }
        Insert: {
          adult_verified_at?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string
          friend_code: string
          id: string
          status_message?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          adult_verified_at?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string
          friend_code?: string
          id?: string
          status_message?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          context: string
          created_at: string
          detail: string
          group_id: string | null
          id: string
          reason: string
          reported_code: string | null
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          context?: string
          created_at?: string
          detail?: string
          group_id?: string | null
          id?: string
          reason: string
          reported_code?: string | null
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          context?: string
          created_at?: string
          detail?: string
          group_id?: string | null
          id?: string
          reason?: string
          reported_code?: string | null
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string
          until: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason?: string
          until?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string
          until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ips: {
        Row: {
          ip: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          ip: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          ip?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_mutes: {
        Row: {
          reason: string
          strikes: number
          until: string
          updated_at: string
          user_id: string
        }
        Insert: {
          reason?: string
          strikes?: number
          until: string
          updated_at?: string
          user_id: string
        }
        Update: {
          reason?: string
          strikes?: number
          until?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      accept_friend_request: {
        Args: { _request_id: string }
        Returns: {
          adult_verified_at: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          friend_code: string
          id: string
          status_message: string
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_friend_by_code: {
        Args: { _code: string }
        Returns: {
          adult_verified_at: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          friend_code: string
          id: string
          status_message: string
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_strike: {
        Args: { _reason: string; _uid: string }
        Returns: undefined
      }
      approve_join_request: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      ban_user_and_ip: {
        Args: { _days?: number; _reason?: string; _target_user_id: string }
        Returns: string
      }
      cancel_friend_request: { Args: { _request_id: string }; Returns: boolean }
      cleanup_old_data: { Args: never; Returns: undefined }
      confirm_adult: { Args: { _birth_date: string }; Returns: boolean }
      generate_friend_code: { Args: never; Returns: string }
      get_client_ip: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_adult_user: { Args: { _user_id: string }; Returns: boolean }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      is_blocked_pair: { Args: { _a: string; _b: string }; Returns: boolean }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_ip_banned: { Args: { _ip: string }; Returns: boolean }
      join_open_group: { Args: { _group_id: string }; Returns: undefined }
      open_group_member_count: { Args: { _group_id: string }; Returns: number }
      open_group_member_counts: {
        Args: { _group_ids: string[] }
        Returns: {
          group_id: string
          member_count: number
        }[]
      }
      reject_friend_request: { Args: { _request_id: string }; Returns: boolean }
      send_friend_request_by_code: {
        Args: { _code: string }
        Returns: {
          adult_verified_at: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          friend_code: string
          id: string
          status_message: string
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_friend_request_by_id: {
        Args: { _target_id: string }
        Returns: {
          adult_verified_at: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          friend_code: string
          id: string
          status_message: string
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unmute_user: { Args: { _uid: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
