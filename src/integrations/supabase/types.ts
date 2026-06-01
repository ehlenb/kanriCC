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
      ai_context_log: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          recruiter_id: string
          tokens_used: number | null
          triggered_by_interaction_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          recruiter_id: string
          tokens_used?: number | null
          triggered_by_interaction_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          recruiter_id?: string
          tokens_used?: number | null
          triggered_by_interaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_context_log_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
        ]
      }
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
      candidate_lists: {
        Row: {
          candidate_ids: string[]
          created_at: string
          created_by: string
          id: string
          name: string
          source: string
          team_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          candidate_ids?: string[]
          created_at?: string
          created_by: string
          id?: string
          name: string
          source?: string
          team_id?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          candidate_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          source?: string
          team_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_lists_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_motivations: {
        Row: {
          candidate_id: string
          id: string
          motivation_text: string
          motivation_type: string | null
          rank: number
        }
        Insert: {
          candidate_id: string
          id?: string
          motivation_text: string
          motivation_type?: string | null
          rank: number
        }
        Update: {
          candidate_id?: string
          id?: string
          motivation_text?: string
          motivation_type?: string | null
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
          additional_languages: string | null
          age: number | null
          ai_context: string | null
          ai_context_updated_at: string | null
          availability_date: string | null
          base_is_priority: boolean
          base_minimum: number | null
          bonus_preference: string | null
          candidate_status: string
          coin_icon_dismissed: boolean
          created_at: string
          current_base: number | null
          current_bonus: number | null
          current_company: string | null
          current_title: string | null
          current_total: number | null
          cv_url: string | null
          email: string | null
          english_level: string | null
          equity_open: boolean | null
          expected_total_max: number | null
          expected_total_min: number | null
          full_name: string
          full_name_japanese: string | null
          id: string
          japanese_level: string | null
          last_interaction_at: string | null
          linkedin_url: string | null
          notes_closing: string | null
          notes_internal: string | null
          notes_personality: string | null
          notes_pitch: string | null
          notes_presentation: string | null
          notice_period_months: number | null
          other_languages: string | null
          phone: string | null
          placed_at: string | null
          placement_guarantee_until: string | null
          presentation_notes: string | null
          recruiter_id: string
          registration_form_url: string | null
          source: string
          status_source: string
          team_id: string
          updated_at: string
          urgency_to_move: string | null
        }
        Insert: {
          active_passive?: string | null
          additional_languages?: string | null
          age?: number | null
          ai_context?: string | null
          ai_context_updated_at?: string | null
          availability_date?: string | null
          base_is_priority?: boolean
          base_minimum?: number | null
          bonus_preference?: string | null
          candidate_status?: string
          coin_icon_dismissed?: boolean
          created_at?: string
          current_base?: number | null
          current_bonus?: number | null
          current_company?: string | null
          current_title?: string | null
          current_total?: number | null
          cv_url?: string | null
          email?: string | null
          english_level?: string | null
          equity_open?: boolean | null
          expected_total_max?: number | null
          expected_total_min?: number | null
          full_name: string
          full_name_japanese?: string | null
          id?: string
          japanese_level?: string | null
          last_interaction_at?: string | null
          linkedin_url?: string | null
          notes_closing?: string | null
          notes_internal?: string | null
          notes_personality?: string | null
          notes_pitch?: string | null
          notes_presentation?: string | null
          notice_period_months?: number | null
          other_languages?: string | null
          phone?: string | null
          placed_at?: string | null
          placement_guarantee_until?: string | null
          presentation_notes?: string | null
          recruiter_id: string
          registration_form_url?: string | null
          source?: string
          status_source?: string
          team_id?: string
          updated_at?: string
          urgency_to_move?: string | null
        }
        Update: {
          active_passive?: string | null
          additional_languages?: string | null
          age?: number | null
          ai_context?: string | null
          ai_context_updated_at?: string | null
          availability_date?: string | null
          base_is_priority?: boolean
          base_minimum?: number | null
          bonus_preference?: string | null
          candidate_status?: string
          coin_icon_dismissed?: boolean
          created_at?: string
          current_base?: number | null
          current_bonus?: number | null
          current_company?: string | null
          current_title?: string | null
          current_total?: number | null
          cv_url?: string | null
          email?: string | null
          english_level?: string | null
          equity_open?: boolean | null
          expected_total_max?: number | null
          expected_total_min?: number | null
          full_name?: string
          full_name_japanese?: string | null
          id?: string
          japanese_level?: string | null
          last_interaction_at?: string | null
          linkedin_url?: string | null
          notes_closing?: string | null
          notes_internal?: string | null
          notes_personality?: string | null
          notes_pitch?: string | null
          notes_presentation?: string | null
          notice_period_months?: number | null
          other_languages?: string | null
          phone?: string | null
          placed_at?: string | null
          placement_guarantee_until?: string | null
          presentation_notes?: string | null
          recruiter_id?: string
          registration_form_url?: string | null
          source?: string
          status_source?: string
          team_id?: string
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
          {
            foreignKeyName: "candidates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          linkedin_url: string | null
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
          linkedin_url?: string | null
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
          linkedin_url?: string | null
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
          ai_context: string | null
          ai_context_updated_at: string | null
          company_name: string
          contract_signed: boolean
          contract_url: string | null
          created_at: string
          employee_japanese_pct: number | null
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
          status: string
          strategy_notes: string | null
          team_id: string
          years_in_japan: number | null
        }
        Insert: {
          ai_context?: string | null
          ai_context_updated_at?: string | null
          company_name: string
          contract_signed?: boolean
          contract_url?: string | null
          created_at?: string
          employee_japanese_pct?: number | null
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
          status?: string
          strategy_notes?: string | null
          team_id?: string
          years_in_japan?: number | null
        }
        Update: {
          ai_context?: string | null
          ai_context_updated_at?: string | null
          company_name?: string
          contract_signed?: boolean
          contract_url?: string | null
          created_at?: string
          employee_japanese_pct?: number | null
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
          status?: string
          strategy_notes?: string | null
          team_id?: string
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
          {
            foreignKeyName: "clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          is_active: boolean
          source: string | null
          stage: string | null
        }
        Insert: {
          candidate_id: string
          company_name: string
          disclosed_at?: string | null
          id?: string
          is_active?: boolean
          source?: string | null
          stage?: string | null
        }
        Update: {
          candidate_id?: string
          company_name?: string
          disclosed_at?: string | null
          id?: string
          is_active?: boolean
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
          direction: string | null
          full_notes: string | null
          id: string
          interacted_at: string
          interaction_type: string
          process_id: string | null
          recruiter_id: string
          requisition_id: string | null
          summary: string | null
          team_id: string | null
          transcript_raw: string | null
          triggers_context_refresh: boolean
        }
        Insert: {
          candidate_id?: string | null
          client_id?: string | null
          direction?: string | null
          full_notes?: string | null
          id?: string
          interacted_at?: string
          interaction_type: string
          process_id?: string | null
          recruiter_id: string
          requisition_id?: string | null
          summary?: string | null
          team_id?: string | null
          transcript_raw?: string | null
          triggers_context_refresh?: boolean
        }
        Update: {
          candidate_id?: string | null
          client_id?: string | null
          direction?: string | null
          full_notes?: string | null
          id?: string
          interacted_at?: string
          interaction_type?: string
          process_id?: string | null
          recruiter_id?: string
          requisition_id?: string | null
          summary?: string | null
          team_id?: string | null
          transcript_raw?: string | null
          triggers_context_refresh?: boolean
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
          {
            foreignKeyName: "interactions_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          ai_snapshot: string | null
          ai_snapshot_updated_at: string | null
          buy_in_confirmed_at: string | null
          candidate_id: string
          ccm_feedback_at: string | null
          ccm_feedback_notes: string | null
          ccm_outcome: string | null
          closed_reason: string | null
          coverage_type: string
          created_at: string
          cv_sent_at: string | null
          id: string
          last_activity_at: string | null
          offer_amount: number | null
          offer_date: string | null
          owner_recruiter_id: string
          placed_date: string | null
          requisition_id: string
          stage: string
          team_id: string
          updated_at: string
        }
        Insert: {
          ai_snapshot?: string | null
          ai_snapshot_updated_at?: string | null
          buy_in_confirmed_at?: string | null
          candidate_id: string
          ccm_feedback_at?: string | null
          ccm_feedback_notes?: string | null
          ccm_outcome?: string | null
          closed_reason?: string | null
          coverage_type: string
          created_at?: string
          cv_sent_at?: string | null
          id?: string
          last_activity_at?: string | null
          offer_amount?: number | null
          offer_date?: string | null
          owner_recruiter_id: string
          placed_date?: string | null
          requisition_id: string
          stage: string
          team_id?: string
          updated_at?: string
        }
        Update: {
          ai_snapshot?: string | null
          ai_snapshot_updated_at?: string | null
          buy_in_confirmed_at?: string | null
          candidate_id?: string
          ccm_feedback_at?: string | null
          ccm_feedback_notes?: string | null
          ccm_outcome?: string | null
          closed_reason?: string | null
          coverage_type?: string
          created_at?: string
          cv_sent_at?: string | null
          id?: string
          last_activity_at?: string | null
          offer_amount?: number | null
          offer_date?: string | null
          owner_recruiter_id?: string
          placed_date?: string | null
          requisition_id?: string
          stage?: string
          team_id?: string
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
          {
            foreignKeyName: "processes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          team_id: string
        }
        Insert: {
          agency_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          team_id: string
        }
        Update: {
          agency_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_conditions: {
        Row: {
          condition_text: string
          condition_type: string
          created_at: string
          id: string
          priority_rank: number
          recruiter_id: string
          requisition_id: string
          source: string
        }
        Insert: {
          condition_text: string
          condition_type: string
          created_at?: string
          id?: string
          priority_rank?: number
          recruiter_id: string
          requisition_id: string
          source: string
        }
        Update: {
          condition_text?: string
          condition_type?: string
          created_at?: string
          id?: string
          priority_rank?: number
          recruiter_id?: string
          requisition_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_conditions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "recruiters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_conditions_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          age_max: number | null
          age_min: number | null
          ai_context: string | null
          ai_context_updated_at: string | null
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
          interview_notes: string | null
          interview_rounds: number | null
          interview_steps: number | null
          interview_structure: Json | null
          is_backfill: boolean | null
          is_open: boolean
          japanese_level_required: string | null
          jd_text: string | null
          jd_url: string | null
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
          team_id: string
          title: string
          urgency: string | null
          why_role_opened: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          ai_context?: string | null
          ai_context_updated_at?: string | null
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
          interview_notes?: string | null
          interview_rounds?: number | null
          interview_steps?: number | null
          interview_structure?: Json | null
          is_backfill?: boolean | null
          is_open?: boolean
          japanese_level_required?: string | null
          jd_text?: string | null
          jd_url?: string | null
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
          team_id?: string
          title: string
          urgency?: string | null
          why_role_opened?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          ai_context?: string | null
          ai_context_updated_at?: string | null
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
          interview_notes?: string | null
          interview_rounds?: number | null
          interview_steps?: number | null
          interview_structure?: Json | null
          is_backfill?: boolean | null
          is_open?: boolean
          japanese_level_required?: string | null
          jd_text?: string | null
          jd_url?: string | null
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
          team_id?: string
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
          {
            foreignKeyName: "requisitions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_team_id: { Args: never; Returns: string }
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
  | "hiring_manager" | "hr_gatekeeper" | "ta_coordinator" | "executive" | "other";

export type ProcessStage =
  | "Specs Sent" | "Buy-In" | "CV Sent" | `CCM${number}` | "Offer" | "Placed" | "Closed lost";

export type JapaneseLevel =
  | "Native" | "Fluent" | "High Business" | "Business" | "Low Business"
  | "High Conversational" | "Conversational" | "Low Conversational" | "Basic" | "None";

export type CandidateStatus = "active" | "passive" | "placed";

export type Urgency = "standard" | "urgent" | "backburner";

export type MotivationType =
  | "salary" | "career_progression" | "international_environment"
  | "wlb" | "stability" | "brand" | "remote" | "leadership" | "other";

// Submission package types (absorbed from CVFlow)
export interface SnapshotContent {
  name: string;
  title?: string | null;
  company?: string | null;
  age?: string | null;
  currentComp?: string | null;
  targetComp?: string | null;
}

export interface ProfileContent {
  snapshot: SnapshotContent;
  executiveSummary: string;
  careerMotivation: string;
  alignment: string[];
  compensation: string;
  closing: string;
}

export interface SubmissionPackage {
  email: { subject: string; body: string };
  englishContent: ProfileContent;
  japaneseContent: ProfileContent;
}
