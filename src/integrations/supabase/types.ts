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
      candidate_blockers: {
        Row: {
          candidate_id: string
          detail: string | null
          id: string
          is_risk: boolean
          theme: string
        }
        Insert: {
          candidate_id: string
          detail?: string | null
          id?: string
          is_risk?: boolean
          theme: string
        }
        Update: {
          candidate_id?: string
          detail?: string | null
          id?: string
          is_risk?: boolean
          theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_blockers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_motivations: {
        Row: {
          candidate_id: string
          id: string
          motivation_text: string
          rank: number
        }
        Insert: {
          candidate_id: string
          id?: string
          motivation_text: string
          rank: number
        }
        Update: {
          candidate_id?: string
          id?: string
          motivation_text?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "candidate_motivations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_roles: {
        Row: {
          achievement_notes: string | null
          candidate_id: string
          company_name: string
          end_date: string | null
          id: string
          is_current: boolean
          reason_for_leaving_raw: string | null
          start_date: string | null
          title: string | null
        }
        Insert: {
          achievement_notes?: string | null
          candidate_id: string
          company_name: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          reason_for_leaving_raw?: string | null
          start_date?: string | null
          title?: string | null
        }
        Update: {
          achievement_notes?: string | null
          candidate_id?: string
          company_name?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          reason_for_leaving_raw?: string | null
          start_date?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_roles_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          active_passive: string | null
          age: number | null
          base_is_priority: boolean
          base_minimum: number | null
          bonus_preference: string | null
          created_at: string
          current_base: number | null
          current_bonus: number | null
          current_company: string | null
          current_title: string | null
          current_total: number | null
          cv_url: string | null
          english_level: string | null
          equity_open: boolean | null
          expected_total_max: number | null
          expected_total_min: number | null
          full_name: string
          full_name_japanese: string | null
          id: string
          japanese_level: string | null
          notes_closing: string | null
          notes_internal: string | null
          notes_personality: string | null
          notes_pitch: string | null
          notes_presentation: string | null
          notice_period_months: number | null
          other_languages: string | null
          presentation_notes: string | null
          recruiter_id: string
          updated_at: string
          urgency_to_move: string | null
        }
        Insert: {
          active_passive?: string | null
          age?: number | null
          base_is_priority?: boolean
          base_minimum?: number | null
          bonus_preference?: string | null
          created_at?: string
          current_base?: number | null
          current_bonus?: number | null
          current_company?: string | null
          current_title?: string | null
          current_total?: number | null
          cv_url?: string | null
          english_level?: string | null
          equity_open?: boolean | null
          expected_total_max?: number | null
          expected_total_min?: number | null
          full_name: string
          full_name_japanese?: string | null
          id?: string
          japanese_level?: string | null
          notes_closing?: string | null
          notes_internal?: string | null
          notes_personality?: string | null
          notes_pitch?: string | null
          notes_presentation?: string | null
          notice_period_months?: number | null
          other_languages?: string | null
          presentation_notes?: string | null
          recruiter_id: string
          updated_at?: string
          urgency_to_move?: string | null
        }
        Update: {
          active_passive?: string | null
          age?: number | null
          base_is_priority?: boolean
          base_minimum?: number | null
          bonus_preference?: string | null
          created_at?: string
          current_base?: number | null
          current_bonus?: number | null
          current_company?: string | null
          current_title?: string | null
          current_total?: number | null
          cv_url?: string | null
          english_level?: string | null
          equity_open?: boolean | null
          expected_total_max?: number | null
          expected_total_min?: number | null
          full_name?: string
          full_name_japanese?: string | null
          id?: string
          japanese_level?: string | null
          notes_closing?: string | null
          notes_internal?: string | null
          notes_personality?: string | null
          notes_pitch?: string | null
          notes_presentation?: string | null
          notice_period_months?: number | null
          other_languages?: string | null
          presentation_notes?: string | null
          recruiter_id?: string
          updated_at?: string
          urgency_to_move?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          bypass_hr_warning: boolean | null
          client_id: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          notes: string | null
          phone: string | null
          recruiter_id: string | null
          relationship_score: number | null
          role: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          bypass_hr_warning?: boolean | null
          client_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          recruiter_id?: string | null
          relationship_score?: number | null
          role?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          bypass_hr_warning?: boolean | null
          client_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          recruiter_id?: string | null
          relationship_score?: number | null
          role?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_package_intelligence: {
        Row: {
          base_pct_of_total: number | null
          bonus_type: string | null
          client_id: string
          confirmed_stretch: number | null
          has_rsu: boolean | null
          id: string
          last_bonus_payout_pct: number | null
          last_updated: string
          rsu_notes: string | null
        }
        Insert: {
          base_pct_of_total?: number | null
          bonus_type?: string | null
          client_id: string
          confirmed_stretch?: number | null
          has_rsu?: boolean | null
          id?: string
          last_bonus_payout_pct?: number | null
          last_updated?: string
          rsu_notes?: string | null
        }
        Update: {
          base_pct_of_total?: number | null
          bonus_type?: string | null
          client_id?: string
          confirmed_stretch?: number | null
          has_rsu?: boolean | null
          id?: string
          last_bonus_payout_pct?: number | null
          last_updated?: string
          rsu_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_package_intelligence_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_name: string
          created_at: string
          fee_pct: number | null
          hiring_manager_name: string | null
          hiring_manager_notes: string | null
          id: string
          is_active: boolean | null
          japan_role_in_group: string | null
          japan_team_japanese_pct: number | null
          japan_team_size: number | null
          kk_entity: string | null
          logo_url: string | null
          recruiter_id: string
          started_at: string | null
          strategy_notes: string | null
          years_in_japan: number | null
        }
        Insert: {
          company_name: string
          created_at?: string
          fee_pct?: number | null
          hiring_manager_name?: string | null
          hiring_manager_notes?: string | null
          id?: string
          is_active?: boolean | null
          japan_role_in_group?: string | null
          japan_team_japanese_pct?: number | null
          japan_team_size?: number | null
          kk_entity?: string | null
          logo_url?: string | null
          recruiter_id: string
          started_at?: string | null
          strategy_notes?: string | null
          years_in_japan?: number | null
        }
        Update: {
          company_name?: string
          created_at?: string
          fee_pct?: number | null
          hiring_manager_name?: string | null
          hiring_manager_notes?: string | null
          id?: string
          is_active?: boolean | null
          japan_role_in_group?: string | null
          japan_team_japanese_pct?: number | null
          japan_team_size?: number | null
          kk_entity?: string | null
          logo_url?: string | null
          recruiter_id?: string
          started_at?: string | null
          strategy_notes?: string | null
          years_in_japan?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
        ]
      }
      competing_interviews: {
        Row: {
          candidate_id: string
          company_name: string
          disclosed_at: string | null
          id: string
          source: string | null
          stage: string | null
        }
        Insert: {
          candidate_id: string
          company_name: string
          disclosed_at?: string | null
          id?: string
          source?: string | null
          stage?: string | null
        }
        Update: {
          candidate_id?: string
          company_name?: string
          disclosed_at?: string | null
          id?: string
          source?: string | null
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competing_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          candidate_id: string | null
          client_id: string | null
          full_notes: string | null
          id: string
          interacted_at: string
          interaction_type: string
          process_id: string | null
          recruiter_id: string
          summary: string | null
        }
        Insert: {
          candidate_id?: string | null
          client_id?: string | null
          full_notes?: string | null
          id?: string
          interacted_at?: string
          interaction_type: string
          process_id?: string | null
          recruiter_id: string
          summary?: string | null
        }
        Update: {
          candidate_id?: string | null
          client_id?: string | null
          full_notes?: string | null
          id?: string
          interacted_at?: string
          interaction_type?: string
          process_id?: string | null
          recruiter_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          ai_snapshot: string | null
          candidate_id: string
          coverage_type: string
          created_at: string
          id: string
          owner_recruiter_id: string
          requisition_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          ai_snapshot?: string | null
          candidate_id: string
          coverage_type: string
          created_at?: string
          id?: string
          owner_recruiter_id: string
          requisition_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          ai_snapshot?: string | null
          candidate_id?: string
          coverage_type?: string
          created_at?: string
          id?: string
          owner_recruiter_id?: string
          requisition_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_owner_recruiter_id_fkey"
            columns: ["owner_recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiters: {
        Row: {
          agency_name: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          agency_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          agency_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      requisitions: {
        Row: {
          age_max: number | null
          age_min: number | null
          client_id: string
          created_at: string
          english_level_required: string | null
          flexibility_notes: string | null
          has_skills_test: boolean | null
          hiring_manager_id: string | null
          hm_can_meet_in_person: boolean | null
          hm_communication_style: string | null
          hm_priority_beyond_jd: string | null
          hm_rejection_patterns: string | null
          id: string
          ideal_candidate_notes: string | null
          industry_must_haves: string | null
          internal_candidate: boolean | null
          interview_rounds: number | null
          interview_structure: Json | null
          is_backfill: boolean | null
          is_open: boolean
          japanese_level_required: string | null
          open_to_foreign_candidates: boolean | null
          other_agencies: boolean | null
          other_agency_names: string | null
          recruiter_id: string
          salary_max: number | null
          salary_min: number | null
          salary_stretch: number | null
          skills_test_notes: string | null
          strategic_context: string | null
          target_start_date: string | null
          title: string
          urgency: string | null
          why_role_opened: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          client_id: string
          created_at?: string
          english_level_required?: string | null
          flexibility_notes?: string | null
          has_skills_test?: boolean | null
          hiring_manager_id?: string | null
          hm_can_meet_in_person?: boolean | null
          hm_communication_style?: string | null
          hm_priority_beyond_jd?: string | null
          hm_rejection_patterns?: string | null
          id?: string
          ideal_candidate_notes?: string | null
          industry_must_haves?: string | null
          internal_candidate?: boolean | null
          interview_rounds?: number | null
          interview_structure?: Json | null
          is_backfill?: boolean | null
          is_open?: boolean
          japanese_level_required?: string | null
          open_to_foreign_candidates?: boolean | null
          other_agencies?: boolean | null
          other_agency_names?: string | null
          recruiter_id: string
          salary_max?: number | null
          salary_min?: number | null
          salary_stretch?: number | null
          skills_test_notes?: string | null
          strategic_context?: string | null
          target_start_date?: string | null
          title: string
          urgency?: string | null
          why_role_opened?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          client_id?: string
          created_at?: string
          english_level_required?: string | null
          flexibility_notes?: string | null
          has_skills_test?: boolean | null
          hiring_manager_id?: string | null
          hm_can_meet_in_person?: boolean | null
          hm_communication_style?: string | null
          hm_priority_beyond_jd?: string | null
          hm_rejection_patterns?: string | null
          id?: string
          ideal_candidate_notes?: string | null
          industry_must_haves?: string | null
          internal_candidate?: boolean | null
          interview_rounds?: number | null
          interview_structure?: Json | null
          is_backfill?: boolean | null
          is_open?: boolean
          japanese_level_required?: string | null
          open_to_foreign_candidates?: boolean | null
          other_agencies?: boolean | null
          other_agency_names?: string | null
          recruiter_id?: string
          salary_max?: number | null
          salary_min?: number | null
          salary_stretch?: number | null
          skills_test_notes?: string | null
          strategic_context?: string | null
          target_start_date?: string | null
          title?: string
          urgency?: string | null
          why_role_opened?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
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

// ─── custom app types (preserved across regenerations) ───────────────────────

export type ContactRole =
  | "hiring_manager"
  | "hr_gatekeeper"
  | "ta_coordinator"
  | "executive"
  | "other";

export type ProcessStage =
  | "Specs Sent"
  | "Buy-In"
  | "CV Sent"
  | `CCM${number}`
  | "Offer"
  | "Placed"
  | "Closed lost";

export type JapaneseLevel =
  | "Native"
  | "Business"
  | "Conversational"
  | "Basic"
  | "None";
