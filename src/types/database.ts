
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activities": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"name_normalized": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"name_normalized"?: never
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"name_normalized"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cities": {
                  Row: {
                    "created_at": string,"id": string,"insee_code": string,"location": unknown,"name": string,"name_normalized": string | null,"population": number | null,"postal_codes": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"insee_code": string,"location": unknown,"name": string,"name_normalized"?: never,"population"?: number | null,"postal_codes"?: (string)[]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"insee_code"?: string,"location"?: unknown,"name"?: string,"name_normalized"?: never,"population"?: number | null,"postal_codes"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"id": string,"listing_id": string,"requester_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"listing_id": string,"requester_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"listing_id"?: string,"requester_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_photos": {
                  Row: {
                    "created_at": string,"id": string,"listing_id": string,"position": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"listing_id": string,"position": number,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"listing_id"?: string,"position"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_photos_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "activity_id": string,"city_id": string,"created_at": string,"description": string | null,"experience": string | null,"id": string,"kind": Database["public"]['Enums']["listing_kind"],"owner_id": string | null,"status": Database["public"]['Enums']["listing_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"city_id": string,"created_at"?: string,"description"?: string | null,"experience"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["listing_kind"],"owner_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"updated_at"?: string
                  }
                  Update: {
                    "activity_id"?: string,"city_id"?: string,"created_at"?: string,"description"?: string | null,"experience"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["listing_kind"],"owner_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"loans": {
                  Row: {
                    "borrower_id": string | null,"due_at": string | null,"id": string,"listing_id": string,"returned_at": string | null,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "borrower_id"?: string | null,"due_at"?: string | null,"id"?: string,"listing_id": string,"returned_at"?: string | null,"started_at"?: string
                  }
                  Update: {
                    "borrower_id"?: string | null,"due_at"?: string | null,"id"?: string,"listing_id"?: string,"returned_at"?: string | null,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "loans_borrower_id_fkey"
      columns: ["borrower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"client_id": string | null,"conversation_id": string,"created_at": string,"id": string,"read_at": string | null,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"client_id"?: string | null,"conversation_id": string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"client_id"?: string | null,"conversation_id"?: string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "city_id": string | null,"created_at": string,"display_name": string,"display_name_confirmed": boolean,"display_name_normalized": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city_id"?: string | null,"created_at"?: string,"display_name": string,"display_name_confirmed"?: boolean,"display_name_normalized"?: never,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "city_id"?: string | null,"created_at"?: string,"display_name"?: string,"display_name_confirmed"?: boolean,"display_name_normalized"?: never,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"listing_id": string,"reason": string | null,"reporter_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: string,"listing_id": string,"reason"?: string | null,"reporter_id"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"listing_id"?: string,"reason"?: string | null,"reporter_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "clean_text":
{ Args: { "t": string }; Returns: string
                           },
"create_listing":
{ Args: { "p_activity_id": string,"p_city_id": string,"p_description"?: string,"p_experience"?: string,"p_kind": Database["public"]['Enums']["listing_kind"],"p_photo_paths": (string)[] }; Returns: string
                           },
"get_conversation":
{ Args: { "p_conversation_id": string }; Returns: Database["public"]['CompositeTypes']["conversation_summary"][]
                          SetofOptions: {
        from: "*"
        to: "conversation_summary"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_my_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "city_id": string,"display_name": string,"display_name_confirmed": boolean,"id": string
            }[]
                           },
"get_unread_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"list_my_conversations":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['CompositeTypes']["conversation_summary"][]
                          SetofOptions: {
        from: "*"
        to: "conversation_summary"
        isOneToOne: false
        isSetofReturn: true
      } },
"mark_conversation_read":
{ Args: { "p_conversation_id": string }; Returns: number
                           },
"normalize_place":
{ Args: { "t": string }; Returns: string
                           },
"normalize_text":
{ Args: { "t": string }; Returns: string
                           },
"report_listing":
{ Args: { "p_category": string,"p_details"?: string,"p_listing_id": string }; Returns: undefined
                           },
"return_loan":
{ Args: { "p_loan_id": string }; Returns: undefined
                           },
"search_activities":
{ Args: { "q": string }; Returns: {
              "id": string,"name": string,"similarity": number
            }[]
                           },
"search_cities":
{ Args: { "q": string }; Returns: {
              "id": string,"insee_code": string,"name": string,"postal_codes": (string)[]
            }[]
                           },
"search_listings":
{ Args: { "p_activity_id"?: string,"p_city_id": string,"p_kind"?: Database["public"]['Enums']["listing_kind"],"p_limit"?: number,"p_offset"?: number,"p_radius_km": number }; Returns: {
              "activity_id": string,"activity_name": string,"city_id": string,"city_name": string,"cover_photo_path": string,"created_at": string,"description": string,"distance_km": number,"experience": string,"id": string,"kind": Database["public"]['Enums']["listing_kind"],"owner_display_name": string,"owner_id": string,"postal_codes": (string)[],"status": Database["public"]['Enums']["listing_status"]
            }[]
                           },
"start_conversation":
{ Args: { "p_listing_id": string }; Returns: string
                           },
"start_loan":
{ Args: { "p_conversation_id": string,"p_due_at"?: string }; Returns: string
                           }
          }
          Enums: {
            "listing_kind": "don"|"pret","listing_status": "disponible"|"reservee"|"donnee"|"pretee"|"archivee"
          }
          CompositeTypes: {
            "conversation_summary": {
                        "conversation_id": string | null,"role": string | null,"created_at": string | null,"last_activity_at": string | null,"listing_id": string | null,"activity_name": string | null,"listing_kind": Database["public"]['Enums']["listing_kind"] | null,"listing_status": Database["public"]['Enums']["listing_status"] | null,"cover_photo_path": string | null,"other_user_id": string | null,"other_display_name": string | null,"is_closed": boolean | null,"last_message_excerpt": string | null,"last_message_at": string | null,"last_message_from_me": boolean | null,"unread_count": number | null,"loan_id": string | null,"loan_started_at": string | null,"loan_due_at": string | null
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "listing_kind": ["don", "pret"],"listing_status": ["disponible", "reservee", "donnee", "pretee", "archivee"]
          }
        }
} as const
