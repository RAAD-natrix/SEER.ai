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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          case_id: string | null
          completed_at: string | null
          error: string | null
          frozen_state: Json | null
          id: string
          input_ids: Json | null
          model: string | null
          output: Json | null
          owner_id: string
          path_id: string | null
          prompt_version: string
          retrieved_method_ids: string[]
          stage: string
          started_at: string
          status: string
          usage: Json | null
        }
        Insert: {
          case_id?: string | null
          completed_at?: string | null
          error?: string | null
          frozen_state?: Json | null
          id?: string
          input_ids?: Json | null
          model?: string | null
          output?: Json | null
          owner_id?: string
          path_id?: string | null
          prompt_version: string
          retrieved_method_ids?: string[]
          stage: string
          started_at?: string
          status?: string
          usage?: Json | null
        }
        Update: {
          case_id?: string | null
          completed_at?: string | null
          error?: string | null
          frozen_state?: Json | null
          id?: string
          input_ids?: Json | null
          model?: string | null
          output?: Json | null
          owner_id?: string
          path_id?: string | null
          prompt_version?: string
          retrieved_method_ids?: string[]
          stage?: string
          started_at?: string
          status?: string
          usage?: Json | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          allow_signup: boolean
          app_version: string
          id: number
          prompt_version: string
          updated_at: string
        }
        Insert: {
          allow_signup?: boolean
          app_version?: string
          id?: number
          prompt_version?: string
          updated_at?: string
        }
        Update: {
          allow_signup?: boolean
          app_version?: string
          id?: number
          prompt_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          created_at: string
          detail: Json | null
          entity: string | null
          entity_id: string | null
          event: string
          id: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          entity?: string | null
          entity_id?: string | null
          event: string
          id?: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          entity?: string | null
          entity_id?: string | null
          event?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      brief_versions: {
        Row: {
          answers: Json
          case_id: string
          created_at: string
          fields: Json
          id: string
          owner_id: string
          raw_brief: string
          triage: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          answers?: Json
          case_id: string
          created_at?: string
          fields?: Json
          id?: string
          owner_id?: string
          raw_brief?: string
          triage?: Json | null
          updated_at?: string
          version: number
        }
        Update: {
          answers?: Json
          case_id?: string
          created_at?: string
          fields?: Json
          id?: string
          owner_id?: string
          raw_brief?: string
          triage?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brief_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          active_path_id: string | null
          client: string | null
          created_at: string
          deleted_at: string | null
          engagement_mode: string
          fields: Json
          id: string
          owner_id: string
          stage: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          active_path_id?: string | null
          client?: string | null
          created_at?: string
          deleted_at?: string | null
          engagement_mode?: string
          fields?: Json
          id?: string
          owner_id?: string
          stage?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          active_path_id?: string | null
          client?: string | null
          created_at?: string
          deleted_at?: string | null
          engagement_mode?: string
          fields?: Json
          id?: string
          owner_id?: string
          stage?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          best_additional_evidence: string | null
          case_id: string
          claim: string
          confidence: string | null
          created_at: string
          falsifier: string | null
          id: string
          owner_id: string
          path_ids: string[]
          permitted_wording: string
          updated_at: string
        }
        Insert: {
          best_additional_evidence?: string | null
          case_id: string
          claim: string
          confidence?: string | null
          created_at?: string
          falsifier?: string | null
          id?: string
          owner_id?: string
          path_ids?: string[]
          permitted_wording?: string
          updated_at?: string
        }
        Update: {
          best_additional_evidence?: string | null
          case_id?: string
          claim?: string
          confidence?: string | null
          created_at?: string
          falsifier?: string | null
          id?: string
          owner_id?: string
          path_ids?: string[]
          permitted_wording?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          case_id: string
          claim_ids: string[]
          classification: string
          created_at: string
          direction: string
          id: string
          independence: number
          limitation: string | null
          owner_id: string
          path_ids: string[]
          period: string | null
          reliability: number
          source_id: string | null
          source_label: string | null
          source_type: string | null
          statement: string
          strength: number
          updated_at: string
        }
        Insert: {
          case_id: string
          claim_ids?: string[]
          classification?: string
          created_at?: string
          direction?: string
          id?: string
          independence?: number
          limitation?: string | null
          owner_id?: string
          path_ids?: string[]
          period?: string | null
          reliability?: number
          source_id?: string | null
          source_label?: string | null
          source_type?: string | null
          statement: string
          strength?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          claim_ids?: string[]
          classification?: string
          created_at?: string
          direction?: string
          id?: string
          independence?: number
          limitation?: string | null
          owner_id?: string
          path_ids?: string[]
          period?: string | null
          reliability?: number
          source_id?: string | null
          source_label?: string | null
          source_type?: string | null
          statement?: string
          strength?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          assumptions: string | null
          baseline: string | null
          case_id: string
          conditions: string | null
          created_at: string
          expected_result: string
          horizon: string | null
          id: string
          metric: string | null
          owner_id: string
          population: string | null
          unit: string | null
        }
        Insert: {
          assumptions?: string | null
          baseline?: string | null
          case_id: string
          conditions?: string | null
          created_at?: string
          expected_result: string
          horizon?: string | null
          id?: string
          metric?: string | null
          owner_id?: string
          population?: string | null
          unit?: string | null
        }
        Update: {
          assumptions?: string | null
          baseline?: string | null
          case_id?: string
          conditions?: string | null
          created_at?: string
          expected_result?: string
          horizon?: string | null
          id?: string
          metric?: string | null
          owner_id?: string
          population?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_events: {
        Row: {
          case_id: string | null
          confirmed: boolean
          context: string | null
          created_at: string
          event_type: string
          id: string
          method_rule_id: string | null
          owner_id: string
          owner_response: string | null
          previous_proposition: string | null
          reason: string | null
          revised_proposition: string | null
          scope: string
          source_id: string | null
        }
        Insert: {
          case_id?: string | null
          confirmed?: boolean
          context?: string | null
          created_at?: string
          event_type: string
          id?: string
          method_rule_id?: string | null
          owner_id?: string
          owner_response?: string | null
          previous_proposition?: string | null
          reason?: string | null
          revised_proposition?: string | null
          scope?: string
          source_id?: string | null
        }
        Update: {
          case_id?: string | null
          confirmed?: boolean
          context?: string | null
          created_at?: string
          event_type?: string
          id?: string
          method_rule_id?: string | null
          owner_id?: string
          owner_response?: string | null
          previous_proposition?: string | null
          reason?: string | null
          revised_proposition?: string | null
          scope?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_method_rule_id_fkey"
            columns: ["method_rule_id"]
            isOneToOne: false
            referencedRelation: "method_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      method_rules: {
        Row: {
          case_id: string | null
          confidentiality_scope: string
          contamination: Json | null
          counterexamples: string | null
          created_at: string
          do_not_use_when: string | null
          falsifier: string | null
          id: string
          mechanism: string | null
          memory_class: string
          name: string
          owner_id: string
          prerequisites: string | null
          problem_type: string | null
          required_evidence: string | null
          source_ids: string[]
          status: string
          superseded_by: string | null
          tags: string[]
          updated_at: string
          use_when: string | null
          version: number
          why_useful: string | null
        }
        Insert: {
          case_id?: string | null
          confidentiality_scope?: string
          contamination?: Json | null
          counterexamples?: string | null
          created_at?: string
          do_not_use_when?: string | null
          falsifier?: string | null
          id?: string
          mechanism?: string | null
          memory_class?: string
          name: string
          owner_id?: string
          prerequisites?: string | null
          problem_type?: string | null
          required_evidence?: string | null
          source_ids?: string[]
          status?: string
          superseded_by?: string | null
          tags?: string[]
          updated_at?: string
          use_when?: string | null
          version?: number
          why_useful?: string | null
        }
        Update: {
          case_id?: string | null
          confidentiality_scope?: string
          contamination?: Json | null
          counterexamples?: string | null
          created_at?: string
          do_not_use_when?: string | null
          falsifier?: string | null
          id?: string
          mechanism?: string | null
          memory_class?: string
          name?: string
          owner_id?: string
          prerequisites?: string | null
          problem_type?: string | null
          required_evidence?: string | null
          source_ids?: string[]
          status?: string
          superseded_by?: string | null
          tags?: string[]
          updated_at?: string
          use_when?: string | null
          version?: number
          why_useful?: string | null
        }
        Relationships: []
      }
      openmind_items: {
        Row: {
          case_id: string | null
          content: string
          created_at: string
          id: string
          kind: string
          method_rule_id: string | null
          owner_id: string
          parent_id: string | null
          reusable: boolean
          source_id: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          case_id?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          method_rule_id?: string | null
          owner_id?: string
          parent_id?: string | null
          reusable?: boolean
          source_id?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          case_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          method_rule_id?: string | null
          owner_id?: string
          parent_id?: string | null
          reusable?: boolean
          source_id?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "openmind_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "openmind_items_method_rule_id_fkey"
            columns: ["method_rule_id"]
            isOneToOne: false
            referencedRelation: "method_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "openmind_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "openmind_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "openmind_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          assumptions: string | null
          case_id: string
          created_at: string
          description: string | null
          hard_constraint_fail: boolean
          id: string
          label: string
          owner_id: string
          scores: Json
          switching_conditions: string | null
          updated_at: string
        }
        Insert: {
          assumptions?: string | null
          case_id: string
          created_at?: string
          description?: string | null
          hard_constraint_fail?: boolean
          id?: string
          label: string
          owner_id?: string
          scores?: Json
          switching_conditions?: string | null
          updated_at?: string
        }
        Update: {
          assumptions?: string | null
          case_id?: string
          created_at?: string
          description?: string | null
          hard_constraint_fail?: boolean
          id?: string
          label?: string
          owner_id?: string
          scores?: Json
          switching_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "options_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_records: {
        Row: {
          actual_result: string
          adoption: string | null
          attribution_limits: string | null
          case_id: string
          created_at: string
          evidence: string | null
          external_changes: string | null
          fidelity: string | null
          forecast_id: string | null
          id: string
          owner_changed: string | null
          owner_id: string
          retain: string | null
          seer_understood: string | null
          seer_wrong: string | null
          usefulness: number | null
        }
        Insert: {
          actual_result: string
          adoption?: string | null
          attribution_limits?: string | null
          case_id: string
          created_at?: string
          evidence?: string | null
          external_changes?: string | null
          fidelity?: string | null
          forecast_id?: string | null
          id?: string
          owner_changed?: string | null
          owner_id?: string
          retain?: string | null
          seer_understood?: string | null
          seer_wrong?: string | null
          usefulness?: number | null
        }
        Update: {
          actual_result?: string
          adoption?: string | null
          attribution_limits?: string | null
          case_id?: string
          created_at?: string
          evidence?: string | null
          external_changes?: string | null
          fidelity?: string | null
          forecast_id?: string | null
          id?: string
          owner_changed?: string | null
          owner_id?: string
          retain?: string | null
          seer_understood?: string | null
          seer_wrong?: string | null
          usefulness?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_records_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      output_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          output_id: string
          owner_id: string
          status: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          output_id: string
          owner_id?: string
          status: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          output_id?: string
          owner_id?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "output_versions_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: false
            referencedRelation: "outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          approved_at: string | null
          case_id: string
          content: string
          created_at: string
          id: string
          owner_id: string
          qa: Json | null
          readiness: Json | null
          redteam: Json | null
          status: string
          template_key: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          case_id: string
          content?: string
          created_at?: string
          id?: string
          owner_id?: string
          qa?: Json | null
          readiness?: Json | null
          redteam?: Json | null
          status?: string
          template_key: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          owner_id?: string
          qa?: Json | null
          readiness?: Json | null
          redteam?: Json | null
          status?: string
          template_key?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outputs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      path_versions: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          path_id: string
          reason: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          path_id: string
          reason?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          path_id?: string
          reason?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "path_versions_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "thought_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          language: string
          onboarded: boolean
          settings: Json
          updated_at: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          language?: string
          onboarded?: boolean
          settings?: Json
          updated_at?: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          onboarded?: boolean
          settings?: Json
          updated_at?: string
          workspace_name?: string | null
        }
        Relationships: []
      }
      risks: {
        Row: {
          case_id: string
          consequence: string | null
          control: string | null
          created_at: string
          id: string
          likelihood: string | null
          owner_id: string
          path_id: string | null
          risk: string
          risk_owner: string | null
          severity: string
          trigger_condition: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          consequence?: string | null
          control?: string | null
          created_at?: string
          id?: string
          likelihood?: string | null
          owner_id?: string
          path_id?: string | null
          risk: string
          risk_owner?: string | null
          severity?: string
          trigger_condition?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          consequence?: string | null
          control?: string | null
          created_at?: string
          id?: string
          likelihood?: string | null
          owner_id?: string
          path_id?: string | null
          risk?: string
          risk_owner?: string | null
          severity?: string
          trigger_condition?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_messages: {
        Row: {
          actions: Json
          ai_run_id: string | null
          basis: Json | null
          case_id: string
          content: string
          created_at: string
          id: string
          kind: string
          owner_id: string
          path_id: string
          prior_learning: Json | null
          role: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          ai_run_id?: string | null
          basis?: Json | null
          case_id: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          path_id: string
          prior_learning?: Json | null
          role: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          ai_run_id?: string | null
          basis?: Json | null
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          path_id?: string
          prior_learning?: Json | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_messages_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "thought_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          owner_id: string
          scope: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          owner_id?: string
          scope: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          owner_id?: string
          scope?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          area: string
          case_id: string | null
          classification: string | null
          confidentiality: string
          coverage: Json
          created_at: string
          deleted_at: string | null
          delta: Json | null
          extracted_text: string | null
          file_hash: string | null
          filename: string | null
          id: string
          mime: string | null
          owner_id: string
          path_ids: string[]
          reliability_notes: string | null
          review: Json | null
          routing: string | null
          size_bytes: number | null
          source_date: string | null
          source_type: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          warnings: string[]
        }
        Insert: {
          area: string
          case_id?: string | null
          classification?: string | null
          confidentiality?: string
          coverage?: Json
          created_at?: string
          deleted_at?: string | null
          delta?: Json | null
          extracted_text?: string | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          owner_id?: string
          path_ids?: string[]
          reliability_notes?: string | null
          review?: Json | null
          routing?: string | null
          size_bytes?: number | null
          source_date?: string | null
          source_type?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          area?: string
          case_id?: string | null
          classification?: string | null
          confidentiality?: string
          coverage?: Json
          created_at?: string
          deleted_at?: string | null
          delta?: Json | null
          extracted_text?: string | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          owner_id?: string
          path_ids?: string[]
          reliability_notes?: string | null
          review?: Json | null
          routing?: string | null
          size_bytes?: number | null
          source_date?: string | null
          source_type?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholders: {
        Row: {
          alignment: string | null
          case_id: string
          created_at: string
          gain: string | null
          id: string
          influence: string | null
          info_gap: string | null
          likely_response: string | null
          loss: string | null
          name: string
          owner_id: string
          required_response: string | null
          resistance: string | null
          updated_at: string
        }
        Insert: {
          alignment?: string | null
          case_id: string
          created_at?: string
          gain?: string | null
          id?: string
          influence?: string | null
          info_gap?: string | null
          likely_response?: string | null
          loss?: string | null
          name: string
          owner_id?: string
          required_response?: string | null
          resistance?: string | null
          updated_at?: string
        }
        Update: {
          alignment?: string | null
          case_id?: string
          created_at?: string
          gain?: string | null
          id?: string
          influence?: string | null
          info_gap?: string | null
          likely_response?: string | null
          loss?: string | null
          name?: string
          owner_id?: string
          required_response?: string | null
          resistance?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_state_versions: {
        Row: {
          ai_run_id: string | null
          case_id: string
          created_at: string
          id: string
          owner_id: string
          reason: string | null
          state: Json
          version: number
        }
        Insert: {
          ai_run_id?: string | null
          case_id: string
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          state: Json
          version: number
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          state?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategic_state_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      thought_paths: {
        Row: {
          case_id: string
          closed_at: string | null
          conclusion: Json | null
          created_at: string
          detail: Json
          id: string
          merged_from: string[]
          owner_id: string
          parent_ids: string[]
          reopened_at: string | null
          status: string
          thesis: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          case_id: string
          closed_at?: string | null
          conclusion?: Json | null
          created_at?: string
          detail?: Json
          id?: string
          merged_from?: string[]
          owner_id?: string
          parent_ids?: string[]
          reopened_at?: string | null
          status?: string
          thesis?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          case_id?: string
          closed_at?: string | null
          conclusion?: Json | null
          created_at?: string
          detail?: Json
          id?: string
          merged_from?: string[]
          owner_id?: string
          parent_ids?: string[]
          reopened_at?: string | null
          status?: string
          thesis?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "thought_paths_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      seed_method_starters: { Args: { _uid: string }; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "collaborator" | "viewer"
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
      app_role: ["owner", "collaborator", "viewer"],
    },
  },
} as const
