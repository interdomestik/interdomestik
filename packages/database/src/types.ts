export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account: {
        Row: {
          accessToken: string | null
          accessTokenExpiresAt: string | null
          accountId: string
          createdAt: string
          id: string
          idToken: string | null
          password: string | null
          providerId: string
          refreshToken: string | null
          refreshTokenExpiresAt: string | null
          scope: string | null
          updatedAt: string
          userId: string
        }
        Insert: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          accountId: string
          createdAt: string
          id: string
          idToken?: string | null
          password?: string | null
          providerId: string
          refreshToken?: string | null
          refreshTokenExpiresAt?: string | null
          scope?: string | null
          updatedAt: string
          userId: string
        }
        Update: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          accountId?: string
          createdAt?: string
          id?: string
          idToken?: string | null
          password?: string | null
          providerId?: string
          refreshToken?: string | null
          refreshTokenExpiresAt?: string | null
          scope?: string | null
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_userId_user_id_fk"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      claim: {
        Row: {
          amount: number | null
          category: string
          companyName: string
          createdAt: string | null
          currency: string | null
          description: string | null
          id: string
          status: Database["public"]["Enums"]["status"] | null
          title: string
          updatedAt: string | null
          userId: string
        }
        Insert: {
          amount?: number | null
          category: string
          companyName: string
          createdAt?: string | null
          currency?: string | null
          description?: string | null
          id: string
          status?: Database["public"]["Enums"]["status"] | null
          title: string
          updatedAt?: string | null
          userId: string
        }
        Update: {
          amount?: number | null
          category?: string
          companyName?: string
          createdAt?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["status"] | null
          title?: string
          updatedAt?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_userId_user_id_fk"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_documents: {
        Row: {
          bucket: string
          category: Database["public"]["Enums"]["document_category"]
          claim_id: string
          classification: string
          created_at: string | null
          file_path: string
          file_size: number
          file_type: string
          id: string
          name: string
          uploaded_by: string
        }
        Insert: {
          bucket?: string
          category?: Database["public"]["Enums"]["document_category"]
          claim_id: string
          classification?: string
          created_at?: string | null
          file_path: string
          file_size: number
          file_type: string
          id: string
          name: string
          uploaded_by: string
        }
        Update: {
          bucket?: string
          category?: Database["public"]["Enums"]["document_category"]
          claim_id?: string
          classification?: string
          created_at?: string | null
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          name?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_documents_claim_id_claim_id_fk"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claim"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_documents_uploaded_by_user_id_fk"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          category: string
          createdAt: string | null
          id: string
          name: string
          phone: string
          status: string | null
          updatedAt: string | null
        }
        Insert: {
          category: string
          createdAt?: string | null
          id: string
          name: string
          phone: string
          status?: string | null
          updatedAt?: string | null
        }
        Update: {
          category?: string
          createdAt?: string | null
          id?: string
          name?: string
          phone?: string
          status?: string | null
          updatedAt?: string | null
        }
        Relationships: []
      }
      session: {
        Row: {
          createdAt: string
          expiresAt: string
          id: string
          ipAddress: string | null
          token: string
          updatedAt: string
          userAgent: string | null
          userId: string
        }
        Insert: {
          createdAt: string
          expiresAt: string
          id: string
          ipAddress?: string | null
          token: string
          updatedAt: string
          userAgent?: string | null
          userId: string
        }
        Update: {
          createdAt?: string
          expiresAt?: string
          id?: string
          ipAddress?: string | null
          token?: string
          updatedAt?: string
          userAgent?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_userId_user_id_fk"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          claims_used_this_period: number | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          claims_used_this_period?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          claims_used_this_period?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          createdAt: string
          email: string
          emailVerified: boolean
          id: string
          image: string | null
          name: string
          role: string
          updatedAt: string
        }
        Insert: {
          createdAt: string
          email: string
          emailVerified: boolean
          id: string
          image?: string | null
          name: string
          role?: string
          updatedAt: string
        }
        Update: {
          createdAt?: string
          email?: string
          emailVerified?: boolean
          id?: string
          image?: string | null
          name?: string
          role?: string
          updatedAt?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          locale: string
          onboarding_completed: boolean | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          locale?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          locale?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      verification: {
        Row: {
          createdAt: string | null
          expiresAt: string
          id: string
          identifier: string
          updatedAt: string | null
          value: string
        }
        Insert: {
          createdAt?: string | null
          expiresAt: string
          id: string
          identifier: string
          updatedAt?: string | null
          value: string
        }
        Update: {
          createdAt?: string | null
          expiresAt?: string
          id?: string
          identifier?: string
          updatedAt?: string | null
          value?: string
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
      document_category:
        | "evidence"
        | "correspondence"
        | "contract"
        | "receipt"
        | "other"
      status:
        | "draft"
        | "submitted"
        | "verification"
        | "evaluation"
        | "negotiation"
        | "court"
        | "resolved"
        | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      document_category: [
        "evidence",
        "correspondence",
        "contract",
        "receipt",
        "other",
      ],
      status: [
        "draft",
        "submitted",
        "verification",
        "evaluation",
        "negotiation",
        "court",
        "resolved",
        "rejected",
      ],
    },
  },
} as const

