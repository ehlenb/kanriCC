export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type JapaneseLevel =
  | "Native"
  | "Fluent"
  | "High Business"
  | "Business"
  | "Low Business"
  | "High Conversational"
  | "Conversational"
  | "Low Conversational"
  | "Basic";

export type ProcessStage =
  | "Specs Sent"
  | "Buy-In"
  | "CV Sent"
  | `CCM${number}`
  | "Offer"
  | "Placed"
  | "Closed lost";

export type CoverageType = "own" | "colleague" | "external";

export type InteractionType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "cv_submitted"
  | "interview"
  | "risk_flag";

export type ContactRole =
  | "hiring_manager"
  | "hr_gatekeeper"
  | "ta_coordinator"
  | "executive"
  | "other";

export type Database = {
  public: {
    Tables: {
      recruiters: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          agency_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          agency_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          agency_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          recruiter_id: string;
          full_name: string;
          full_name_japanese: string | null;
          age: number | null;
          current_company: string | null;
          current_title: string | null;
          japanese_level: JapaneseLevel | null;
          english_level: JapaneseLevel | null;
          other_languages: string | null;
          active_passive: "Active" | "Passive" | null;
          urgency_to_move: "High" | "Medium" | "Low" | null;
          notice_period_months: number | null;
          current_base: number | null;
          current_bonus: number | null;
          current_total: number | null;
          expected_total_min: number | null;
          expected_total_max: number | null;
          base_is_priority: boolean;
          base_minimum: number | null;
          bonus_preference: string | null;
          equity_open: boolean | null;
          presentation_notes: string | null;
          notes_presentation: string | null;
          notes_personality: string | null;
          notes_pitch: string | null;
          notes_closing: string | null;
          notes_internal: string | null; // AI NEVER reads this field
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recruiter_id: string;
          full_name: string;
          full_name_japanese?: string | null;
          age?: number | null;
          current_company?: string | null;
          current_title?: string | null;
          japanese_level?: JapaneseLevel | null;
          english_level?: JapaneseLevel | null;
          other_languages?: string | null;
          active_passive?: "Active" | "Passive" | null;
          urgency_to_move?: "High" | "Medium" | "Low" | null;
          notice_period_months?: number | null;
          current_base?: number | null;
          current_bonus?: number | null;
          current_total?: number | null;
          expected_total_min?: number | null;
          expected_total_max?: number | null;
          base_is_priority?: boolean;
          base_minimum?: number | null;
          bonus_preference?: string | null;
          equity_open?: boolean | null;
          presentation_notes?: string | null;
          notes_presentation?: string | null;
          notes_personality?: string | null;
          notes_pitch?: string | null;
          notes_closing?: string | null;
          notes_internal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recruiter_id?: string;
          full_name?: string;
          full_name_japanese?: string | null;
          age?: number | null;
          current_company?: string | null;
          current_title?: string | null;
          japanese_level?: JapaneseLevel | null;
          english_level?: JapaneseLevel | null;
          other_languages?: string | null;
          active_passive?: "Active" | "Passive" | null;
          urgency_to_move?: "High" | "Medium" | "Low" | null;
          notice_period_months?: number | null;
          current_base?: number | null;
          current_bonus?: number | null;
          current_total?: number | null;
          expected_total_min?: number | null;
          expected_total_max?: number | null;
          base_is_priority?: boolean;
          base_minimum?: number | null;
          bonus_preference?: string | null;
          equity_open?: boolean | null;
          presentation_notes?: string | null;
          notes_presentation?: string | null;
          notes_personality?: string | null;
          notes_pitch?: string | null;
          notes_closing?: string | null;
          notes_internal?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_recruiter_id_fkey";
            columns: ["recruiter_id"];
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_motivations: {
        Row: {
          id: string;
          candidate_id: string;
          rank: 1 | 2 | 3;
          motivation_text: string;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          rank: 1 | 2 | 3;
          motivation_text: string;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          rank?: 1 | 2 | 3;
          motivation_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_motivations_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_blockers: {
        Row: {
          id: string;
          candidate_id: string;
          is_risk: boolean;
          theme: string;
          detail: string | null;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          is_risk: boolean;
          theme: string;
          detail?: string | null;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          is_risk?: boolean;
          theme?: string;
          detail?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_blockers_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_roles: {
        Row: {
          id: string;
          candidate_id: string;
          company_name: string;
          title: string | null;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          achievement_notes: string | null;
          reason_for_leaving_raw: string | null;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          company_name: string;
          title?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          achievement_notes?: string | null;
          reason_for_leaving_raw?: string | null;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          company_name?: string;
          title?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          achievement_notes?: string | null;
          reason_for_leaving_raw?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_roles_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      competing_interviews: {
        Row: {
          id: string;
          candidate_id: string;
          company_name: string;
          source: string | null;
          stage: string | null;
          disclosed_at: string | null;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          company_name: string;
          source?: string | null;
          stage?: string | null;
          disclosed_at?: string | null;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          company_name?: string;
          source?: string | null;
          stage?: string | null;
          disclosed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competing_interviews_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          recruiter_id: string;
          company_name: string;
          logo_url: string | null;
          is_active: boolean;
          fee_pct: number | null;
          started_at: string | null;
          years_in_japan: number | null;
          japan_team_size: number | null;
          japan_team_japanese_pct: number | null;
          japan_role_in_group: "Core market" | "Growth market" | "Satellite office" | null;
          kk_entity: boolean | null;
          hiring_manager_name: string | null;
          hiring_manager_notes: string | null;
          strategy_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recruiter_id: string;
          company_name: string;
          logo_url?: string | null;
          is_active?: boolean;
          fee_pct?: number | null;
          started_at?: string | null;
          years_in_japan?: number | null;
          japan_team_size?: number | null;
          japan_team_japanese_pct?: number | null;
          japan_role_in_group?: "Core market" | "Growth market" | "Satellite office" | null;
          kk_entity?: boolean | null;
          hiring_manager_name?: string | null;
          hiring_manager_notes?: string | null;
          strategy_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recruiter_id?: string;
          company_name?: string;
          logo_url?: string | null;
          is_active?: boolean;
          fee_pct?: number | null;
          started_at?: string | null;
          years_in_japan?: number | null;
          japan_team_size?: number | null;
          japan_team_japanese_pct?: number | null;
          japan_role_in_group?: "Core market" | "Growth market" | "Satellite office" | null;
          kk_entity?: boolean | null;
          hiring_manager_name?: string | null;
          hiring_manager_notes?: string | null;
          strategy_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_recruiter_id_fkey";
            columns: ["recruiter_id"];
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
        ];
      };
      client_contacts: {
        Row: {
          id: string;
          client_id: string;
          recruiter_id: string;
          name: string;
          role: ContactRole;
          title: string | null;
          notes: string | null;
          relationship_score: number | null;
          bypass_hr_warning: boolean;
          is_primary_contact: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          recruiter_id: string;
          name: string;
          role: ContactRole;
          title?: string | null;
          notes?: string | null;
          relationship_score?: number | null;
          bypass_hr_warning?: boolean;
          is_primary_contact?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          recruiter_id?: string;
          name?: string;
          role?: ContactRole;
          title?: string | null;
          notes?: string | null;
          relationship_score?: number | null;
          bypass_hr_warning?: boolean;
          is_primary_contact?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      requisitions: {
        Row: {
          id: string;
          client_id: string;
          recruiter_id: string;
          title: string;
          salary_min: number | null;
          salary_max: number | null;
          salary_stretch: number | null;
          interview_rounds: number | null;
          is_open: boolean;
          is_backfill: boolean;
          hiring_manager_id: string | null;
          why_role_opened: string | null;
          strategic_context: string | null;
          created_at: string;
          // Section A
          urgency: string | null;
          // Section B
          ideal_candidate_notes: string | null;
          age_min: number | null;
          age_max: number | null;
          japanese_level_required: string | null;
          english_level_required: string | null;
          industry_must_haves: string | null;
          flexibility_notes: string | null;
          // Section C
          interview_structure: Json | null;
          has_skills_test: boolean | null;
          skills_test_notes: string | null;
          hm_can_meet_in_person: boolean | null;
          // Section D
          hm_communication_style: string | null;
          hm_rejection_patterns: string | null;
          hm_priority_beyond_jd: string | null;
          // Section E
          other_agencies: boolean | null;
          other_agency_names: string | null;
          open_to_foreign_candidates: boolean | null;
          internal_candidate: boolean | null;
          target_start_date: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          recruiter_id: string;
          title: string;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_stretch?: number | null;
          interview_rounds?: number | null;
          is_open?: boolean;
          is_backfill?: boolean;
          hiring_manager_id?: string | null;
          why_role_opened?: string | null;
          strategic_context?: string | null;
          created_at?: string;
          urgency?: string | null;
          ideal_candidate_notes?: string | null;
          age_min?: number | null;
          age_max?: number | null;
          japanese_level_required?: string | null;
          english_level_required?: string | null;
          industry_must_haves?: string | null;
          flexibility_notes?: string | null;
          interview_structure?: Json | null;
          has_skills_test?: boolean | null;
          skills_test_notes?: string | null;
          hm_can_meet_in_person?: boolean | null;
          hm_communication_style?: string | null;
          hm_rejection_patterns?: string | null;
          hm_priority_beyond_jd?: string | null;
          other_agencies?: boolean | null;
          other_agency_names?: string | null;
          open_to_foreign_candidates?: boolean | null;
          internal_candidate?: boolean | null;
          target_start_date?: string | null;
        };
        Update: {
          id?: string;
          client_id?: string;
          recruiter_id?: string;
          title?: string;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_stretch?: number | null;
          interview_rounds?: number | null;
          is_open?: boolean;
          is_backfill?: boolean;
          hiring_manager_id?: string | null;
          why_role_opened?: string | null;
          strategic_context?: string | null;
          urgency?: string | null;
          ideal_candidate_notes?: string | null;
          age_min?: number | null;
          age_max?: number | null;
          japanese_level_required?: string | null;
          english_level_required?: string | null;
          industry_must_haves?: string | null;
          flexibility_notes?: string | null;
          interview_structure?: Json | null;
          has_skills_test?: boolean | null;
          skills_test_notes?: string | null;
          hm_can_meet_in_person?: boolean | null;
          hm_communication_style?: string | null;
          hm_rejection_patterns?: string | null;
          hm_priority_beyond_jd?: string | null;
          other_agencies?: boolean | null;
          other_agency_names?: string | null;
          open_to_foreign_candidates?: boolean | null;
          internal_candidate?: boolean | null;
          target_start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requisitions_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      processes: {
        Row: {
          id: string;
          candidate_id: string;
          requisition_id: string;
          owner_recruiter_id: string;
          stage: ProcessStage;
          coverage_type: CoverageType;
          ai_snapshot: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          requisition_id: string;
          owner_recruiter_id: string;
          stage: ProcessStage;
          coverage_type: CoverageType;
          ai_snapshot?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          requisition_id?: string;
          owner_recruiter_id?: string;
          stage?: ProcessStage;
          coverage_type?: CoverageType;
          ai_snapshot?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "processes_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processes_requisition_id_fkey";
            columns: ["requisition_id"];
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      interactions: {
        Row: {
          id: string;
          candidate_id: string | null;
          client_id: string | null;
          process_id: string | null;
          recruiter_id: string;
          interaction_type: InteractionType;
          summary: string | null;
          full_notes: string | null;
          interacted_at: string;
        };
        Insert: {
          id?: string;
          candidate_id?: string | null;
          client_id?: string | null;
          process_id?: string | null;
          recruiter_id: string;
          interaction_type: InteractionType;
          summary?: string | null;
          full_notes?: string | null;
          interacted_at?: string;
        };
        Update: {
          id?: string;
          candidate_id?: string | null;
          client_id?: string | null;
          process_id?: string | null;
          recruiter_id?: string;
          interaction_type?: InteractionType;
          summary?: string | null;
          full_notes?: string | null;
          interacted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interactions_candidate_id_fkey";
            columns: ["candidate_id"];
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      client_package_intelligence: {
        Row: {
          id: string;
          client_id: string;
          base_pct_of_total: number | null;
          bonus_type: string | null;
          last_bonus_payout_pct: number | null;
          has_rsu: boolean | null;
          rsu_notes: string | null;
          confirmed_stretch: number | null;
          last_updated: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          base_pct_of_total?: number | null;
          bonus_type?: string | null;
          last_bonus_payout_pct?: number | null;
          has_rsu?: boolean | null;
          rsu_notes?: string | null;
          confirmed_stretch?: number | null;
          last_updated?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          base_pct_of_total?: number | null;
          bonus_type?: string | null;
          last_bonus_payout_pct?: number | null;
          has_rsu?: boolean | null;
          rsu_notes?: string | null;
          confirmed_stretch?: number | null;
          last_updated?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_package_intelligence_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
