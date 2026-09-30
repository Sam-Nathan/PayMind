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
      ai_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          model: string | null
          payload: Json
          result_ref: string | null
          space_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          model?: string | null
          payload: Json
          result_ref?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          user_id?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          model?: string | null
          payload?: Json
          result_ref?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposals_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      anomalies: {
        Row: {
          created_at: string
          expense_id: string | null
          id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_id?: string | null
          id?: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          expense_id?: string | null
          id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomalies_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_flags: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          item_id: string | null
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          type: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          item_id?: string | null
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          type: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          item_id?: string | null
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_flags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_flags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "expense_items"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category_id: string | null
          created_at: string
          ends_on: string | null
          id: string
          limit_minor: number
          name: string | null
          owner_id: string | null
          period: Database["public"]["Enums"]["budget_period"]
          scope: Database["public"]["Enums"]["budget_scope"]
          space_id: string | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          limit_minor: number
          name?: string | null
          owner_id?: string | null
          period?: Database["public"]["Enums"]["budget_period"]
          scope: Database["public"]["Enums"]["budget_scope"]
          space_id?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          limit_minor?: number
          name?: string | null
          owner_id?: string | null
          period?: Database["public"]["Enums"]["budget_period"]
          scope?: Database["public"]["Enums"]["budget_scope"]
          space_id?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      captured_txns: {
        Row: {
          amount_minor: number
          created_at: string
          dedupe_hash: string
          expense_id: string | null
          id: string
          occurred_at: string
          parsed: Json
          payee: string | null
          raw: string | null
          source: Database["public"]["Enums"]["capture_source"]
          status: Database["public"]["Enums"]["capture_status"]
          suggested_category_id: string | null
          updated_at: string
          user_id: string
          vpa: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          dedupe_hash: string
          expense_id?: string | null
          id?: string
          occurred_at: string
          parsed?: Json
          payee?: string | null
          raw?: string | null
          source: Database["public"]["Enums"]["capture_source"]
          status?: Database["public"]["Enums"]["capture_status"]
          suggested_category_id?: string | null
          updated_at?: string
          user_id?: string
          vpa?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          dedupe_hash?: string
          expense_id?: string | null
          id?: string
          occurred_at?: string
          parsed?: Json
          payee?: string | null
          raw?: string | null
          source?: Database["public"]["Enums"]["capture_source"]
          status?: Database["public"]["Enums"]["capture_status"]
          suggested_category_id?: string | null
          updated_at?: string
          user_id?: string
          vpa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captured_txns_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captured_txns_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          owner_id: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          owner_id?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          user_id?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          user_id?: string
        }
        Relationships: []
      }
      expense_items: {
        Row: {
          amount_minor: number
          category_id: string | null
          created_at: string
          expense_id: string
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          position: number
          qty: number
          unit_price_minor: number | null
        }
        Insert: {
          amount_minor: number
          category_id?: string | null
          created_at?: string
          expense_id: string
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          name: string
          position?: number
          qty?: number
          unit_price_minor?: number | null
        }
        Update: {
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          expense_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          name?: string
          position?: number
          qty?: number
          unit_price_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_notes: {
        Row: {
          created_at: string
          expense_id: string
          note: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          note: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          note?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_notes_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          expense_id: string
          member_id: string
          owed_minor: number
          space_id: string
        }
        Insert: {
          expense_id: string
          member_id: string
          owed_minor: number
          space_id: string
        }
        Update: {
          expense_id?: string
          member_id?: string
          owed_minor?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_fkey"
            columns: ["expense_id", "space_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "expense_shares_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "expense_shares_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
        ]
      }
      expenses: {
        Row: {
          captured_txn_id: string | null
          category_id: string | null
          created_at: string
          currency: string
          id: string
          merchant_id: string | null
          occurred_at: string
          owner_id: string | null
          paid_by_member: string | null
          paid_via: Database["public"]["Enums"]["payment_via"] | null
          proposal_id: string | null
          receipt_path: string | null
          recurring_series_id: string | null
          source: Database["public"]["Enums"]["expense_source"]
          space_id: string | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string | null
          total_minor: number
          updated_at: string
          visibility: Database["public"]["Enums"]["expense_visibility"]
        }
        Insert: {
          captured_txn_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_id?: string | null
          occurred_at?: string
          owner_id?: string | null
          paid_by_member?: string | null
          paid_via?: Database["public"]["Enums"]["payment_via"] | null
          proposal_id?: string | null
          receipt_path?: string | null
          recurring_series_id?: string | null
          source?: Database["public"]["Enums"]["expense_source"]
          space_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string | null
          total_minor: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["expense_visibility"]
        }
        Update: {
          captured_txn_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_id?: string | null
          occurred_at?: string
          owner_id?: string | null
          paid_by_member?: string | null
          paid_via?: Database["public"]["Enums"]["payment_via"] | null
          proposal_id?: string | null
          receipt_path?: string | null
          recurring_series_id?: string | null
          source?: Database["public"]["Enums"]["expense_source"]
          space_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string | null
          total_minor?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["expense_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "expenses_captured_txn_id_fkey"
            columns: ["captured_txn_id"]
            isOneToOne: false
            referencedRelation: "captured_txns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_member_fkey"
            columns: ["space_id", "paid_by_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "expenses_paid_by_member_fkey"
            columns: ["space_id", "paid_by_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
          {
            foreignKeyName: "expenses_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_series_id_fkey"
            columns: ["recurring_series_id"]
            isOneToOne: false
            referencedRelation: "recurring_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount_minor: number
          contributed_at: string
          created_at: string
          goal_id: string
          id: string
          member_id: string | null
          note: string | null
          user_id: string | null
        }
        Insert: {
          amount_minor: number
          contributed_at?: string
          created_at?: string
          goal_id: string
          id?: string
          member_id?: string | null
          note?: string | null
          user_id?: string | null
        }
        Update: {
          amount_minor?: number
          contributed_at?: string
          created_at?: string
          goal_id?: string
          id?: string
          member_id?: string | null
          note?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "goal_contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          owner_id: string | null
          space_id: string | null
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string | null
          target_minor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          owner_id?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          target_minor: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          target_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      item_shares: {
        Row: {
          amount_minor: number
          expense_id: string
          item_id: string
          member_id: string
          pct: number | null
          space_id: string
          units: number | null
        }
        Insert: {
          amount_minor: number
          expense_id: string
          item_id: string
          member_id: string
          pct?: number | null
          space_id: string
          units?: number | null
        }
        Update: {
          amount_minor?: number
          expense_id?: string
          item_id?: string
          member_id?: string
          pct?: number | null
          space_id?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_shares_expense_fkey"
            columns: ["expense_id", "space_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "item_shares_item_fkey"
            columns: ["item_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expense_items"
            referencedColumns: ["id", "expense_id"]
          },
          {
            foreignKeyName: "item_shares_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "item_shares_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
        ]
      }
      learned_rules: {
        Row: {
          action: Json
          created_at: string
          hits: number
          id: string
          kind: Database["public"]["Enums"]["learned_rule_kind"]
          last_applied_at: string | null
          match: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          action: Json
          created_at?: string
          hits?: number
          id?: string
          kind: Database["public"]["Enums"]["learned_rule_kind"]
          last_applied_at?: string | null
          match: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          action?: Json
          created_at?: string
          hits?: number
          id?: string
          kind?: Database["public"]["Enums"]["learned_rule_kind"]
          last_applied_at?: string | null
          match?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_aliases: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          owner_id: string | null
          raw_text: string
          vpa: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          owner_id?: string | null
          raw_text: string
          vpa?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          owner_id?: string | null
          raw_text?: string
          vpa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_aliases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          canonical_name: string
          category_id: string | null
          created_at: string
          id: string
          owner_id: string | null
        }
        Insert: {
          canonical_name: string
          category_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
        }
        Update: {
          canonical_name?: string
          category_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          budget_alerts: boolean
          money_nudges: boolean
          nudge_category_ids: string[]
          nudge_frequency: Database["public"]["Enums"]["nudge_frequency"]
          settlement_reminders: boolean
          unusual_activity: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_alerts?: boolean
          money_nudges?: boolean
          nudge_category_ids?: string[]
          nudge_frequency?: Database["public"]["Enums"]["nudge_frequency"]
          settlement_reminders?: boolean
          unusual_activity?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_alerts?: boolean
          money_nudges?: boolean
          nudge_category_ids?: string[]
          nudge_frequency?: Database["public"]["Enums"]["nudge_frequency"]
          settlement_reminders?: boolean
          unusual_activity?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      privacy_settings: {
        Row: {
          aa_balance: boolean
          aa_consent_expires_at: string | null
          ai_enabled: boolean
          capture_notifications: boolean
          ebill_senders: string[]
          ebills: boolean
          keep_receipts: boolean
          learn_from_corrections: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          share_payment_method: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          aa_balance?: boolean
          aa_consent_expires_at?: string | null
          ai_enabled?: boolean
          capture_notifications?: boolean
          ebill_senders?: string[]
          ebills?: boolean
          keep_receipts?: boolean
          learn_from_corrections?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          share_payment_method?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          aa_balance?: boolean
          aa_consent_expires_at?: string | null
          ai_enabled?: boolean
          capture_notifications?: boolean
          ebill_senders?: string[]
          ebills?: boolean
          keep_receipts?: boolean
          learn_from_corrections?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          share_payment_method?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          locale: string
          name: string | null
          phone: string | null
          updated_at: string
          upi_vpa: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id: string
          locale?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          upi_vpa?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          locale?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          upi_vpa?: string | null
        }
        Relationships: []
      }
      recurring_series: {
        Row: {
          amount_varies: boolean
          cadence: Database["public"]["Enums"]["recurring_cadence"]
          category_id: string | null
          created_at: string
          expected_minor: number | null
          flags: Json
          id: string
          installments_paid: number
          installments_total: number | null
          kind: Database["public"]["Enums"]["recurring_kind"]
          last_amount_minor: number | null
          merchant_id: string | null
          name: string
          next_due: string | null
          remind_days_before: number | null
          space_id: string | null
          status: Database["public"]["Enums"]["recurring_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_varies?: boolean
          cadence?: Database["public"]["Enums"]["recurring_cadence"]
          category_id?: string | null
          created_at?: string
          expected_minor?: number | null
          flags?: Json
          id?: string
          installments_paid?: number
          installments_total?: number | null
          kind: Database["public"]["Enums"]["recurring_kind"]
          last_amount_minor?: number | null
          merchant_id?: string | null
          name: string
          next_due?: string | null
          remind_days_before?: number | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_varies?: boolean
          cadence?: Database["public"]["Enums"]["recurring_cadence"]
          category_id?: string | null
          created_at?: string
          expected_minor?: number | null
          flags?: Json
          id?: string
          installments_paid?: number
          installments_total?: number | null
          kind?: Database["public"]["Enums"]["recurring_kind"]
          last_amount_minor?: number | null
          merchant_id?: string | null
          name?: string
          next_due?: string | null
          remind_days_before?: number | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_series_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          amount_minor: number
          created_at: string
          from_user: string
          id: string
          items: Json
          last_sent_at: string | null
          link_token: string
          message: string | null
          next_at: string | null
          note_ref: string | null
          repeat: Database["public"]["Enums"]["reminder_repeat"]
          status: Database["public"]["Enums"]["reminder_status"]
          to_member: string
          tone: Database["public"]["Enums"]["reminder_tone"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          from_user?: string
          id?: string
          items?: Json
          last_sent_at?: string | null
          link_token?: string
          message?: string | null
          next_at?: string | null
          note_ref?: string | null
          repeat?: Database["public"]["Enums"]["reminder_repeat"]
          status?: Database["public"]["Enums"]["reminder_status"]
          to_member: string
          tone?: Database["public"]["Enums"]["reminder_tone"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          from_user?: string
          id?: string
          items?: Json
          last_sent_at?: string | null
          link_token?: string
          message?: string | null
          next_at?: string | null
          note_ref?: string | null
          repeat?: Database["public"]["Enums"]["reminder_repeat"]
          status?: Database["public"]["Enums"]["reminder_status"]
          to_member?: string
          tone?: Database["public"]["Enums"]["reminder_tone"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_to_member_fkey"
            columns: ["to_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "reminders_to_member_fkey"
            columns: ["to_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_methods: {
        Row: {
          created_at: string
          created_by: string | null
          method: Database["public"]["Enums"]["settlement_method"]
          settlement_id: string
          upi_app: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          method: Database["public"]["Enums"]["settlement_method"]
          settlement_id: string
          upi_app?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          method?: Database["public"]["Enums"]["settlement_method"]
          settlement_id?: string
          upi_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_methods_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: true
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_methods_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: true
            referencedRelation: "settlements_with_method"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_minor: number
          completed_at: string | null
          corrected_from_minor: number | null
          created_at: string
          created_by: string | null
          from_member: string
          id: string
          note_ref: string | null
          space_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          to_member: string
          updated_at: string
          utr: string | null
        }
        Insert: {
          amount_minor: number
          completed_at?: string | null
          corrected_from_minor?: number | null
          created_at?: string
          created_by?: string | null
          from_member: string
          id?: string
          note_ref?: string | null
          space_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
          to_member: string
          updated_at?: string
          utr?: string | null
        }
        Update: {
          amount_minor?: number
          completed_at?: string | null
          corrected_from_minor?: number | null
          created_at?: string
          created_by?: string | null
          from_member?: string
          id?: string
          note_ref?: string | null
          space_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          to_member?: string
          updated_at?: string
          utr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_fkey"
            columns: ["space_id", "from_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "settlements_from_fkey"
            columns: ["space_id", "from_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
          {
            foreignKeyName: "settlements_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_fkey"
            columns: ["space_id", "to_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "settlements_to_fkey"
            columns: ["space_id", "to_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
        ]
      }
      space_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          member_id: string
          space_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          member_id: string
          space_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "space_invites_member_fkey"
            columns: ["space_id", "member_id"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
        ]
      }
      space_members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          share_weight: number
          space_id: string
          updated_at: string
          upi_vpa: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          share_weight?: number
          space_id: string
          updated_at?: string
          upi_vpa?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          share_weight?: number
          space_id?: string
          updated_at?: string
          upi_vpa?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          budget_minor: number | null
          created_at: string
          created_by: string | null
          currency: string
          default_split: Json
          ends_on: string | null
          id: string
          name: string
          starts_on: string | null
          status: Database["public"]["Enums"]["space_status"]
          type: Database["public"]["Enums"]["space_type"]
          updated_at: string
        }
        Insert: {
          budget_minor?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_split?: Json
          ends_on?: string | null
          id?: string
          name: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["space_status"]
          type: Database["public"]["Enums"]["space_type"]
          updated_at?: string
        }
        Update: {
          budget_minor?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_split?: Json
          ends_on?: string | null
          id?: string
          name?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["space_status"]
          type?: Database["public"]["Enums"]["space_type"]
          updated_at?: string
        }
        Relationships: []
      }
      split_rules: {
        Row: {
          bill_kind: string
          created_at: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["split_method"]
          name: string | null
          params: Json
          space_id: string
          updated_at: string
        }
        Insert: {
          bill_kind: string
          created_at?: string
          created_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["split_method"]
          name?: string | null
          params?: Json
          space_id: string
          updated_at?: string
        }
        Update: {
          bill_kind?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["split_method"]
          name?: string | null
          params?: Json
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_rules_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      balances: {
        Row: {
          display_name: string | null
          left_at: string | null
          member_id: string | null
          net_minor: number | null
          owed_minor: number | null
          paid_minor: number | null
          settled_in_minor: number | null
          settled_out_minor: number | null
          space_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements_with_method: {
        Row: {
          amount_minor: number | null
          completed_at: string | null
          corrected_from_minor: number | null
          created_at: string | null
          created_by: string | null
          from_member: string | null
          id: string | null
          method: Database["public"]["Enums"]["settlement_method"] | null
          note_ref: string | null
          space_id: string | null
          status: Database["public"]["Enums"]["settlement_status"] | null
          to_member: string | null
          updated_at: string | null
          upi_app: string | null
          utr: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_fkey"
            columns: ["space_id", "from_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "settlements_from_fkey"
            columns: ["space_id", "from_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
          {
            foreignKeyName: "settlements_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_fkey"
            columns: ["space_id", "to_member"]
            isOneToOne: false
            referencedRelation: "balances"
            referencedColumns: ["space_id", "member_id"]
          },
          {
            foreignKeyName: "settlements_to_fkey"
            columns: ["space_id", "to_member"]
            isOneToOne: false
            referencedRelation: "space_members"
            referencedColumns: ["space_id", "id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          amount_minor: number | null
          detail: string | null
          event_type: string | null
          occurred_at: string | null
          ref_id: string | null
          space_id: string | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_space_invite: { Args: { p_code: string }; Returns: Json }
      confirm_captured_txn: {
        Args: {
          p_category_id?: string
          p_id: string
          p_shares?: Json
          p_space_id?: string
        }
        Returns: string
      }
      create_expense: { Args: { p: Json }; Returns: string }
      create_space: {
        Args: {
          p_budget_minor?: number
          p_default_split?: Json
          p_ends_on?: string
          p_members?: Json
          p_name: string
          p_starts_on?: string
          p_type: Database["public"]["Enums"]["space_type"]
        }
        Returns: string
      }
      create_space_invite: {
        Args: { p_member_id: string; p_space_id: string }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_pay_link: { Args: { p_token: string }; Returns: Json }
      preview_space_invite: { Args: { p_code: string }; Returns: Json }
      record_settlement: {
        Args: {
          p_amount_minor: number
          p_from_member: string
          p_method?: Database["public"]["Enums"]["settlement_method"]
          p_note_ref?: string
          p_space_id: string
          p_status?: Database["public"]["Enums"]["settlement_status"]
          p_to_member: string
          p_upi_app?: string
          p_utr?: string
        }
        Returns: string
      }
      register_device: {
        Args: {
          p_app_version?: string
          p_platform: Database["public"]["Enums"]["device_platform"]
          p_token: string
        }
        Returns: string
      }
      update_expense: {
        Args: { p: Json; p_expense_id: string }
        Returns: string
      }
      update_settlement_status: {
        Args: {
          p_amount_minor?: number
          p_id: string
          p_status: Database["public"]["Enums"]["settlement_status"]
          p_utr?: string
        }
        Returns: {
          amount_minor: number
          completed_at: string | null
          corrected_from_minor: number | null
          created_at: string
          created_by: string | null
          from_member: string
          id: string
          note_ref: string | null
          space_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          to_member: string
          updated_at: string
          utr: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      budget_period: "weekly" | "monthly" | "custom"
      budget_scope:
        | "monthly"
        | "weekly"
        | "category"
        | "group"
        | "event"
        | "trip"
      capture_source: "upi_notification" | "sms" | "ebill" | "manual"
      capture_status: "inbox" | "confirmed" | "not_mine"
      device_platform: "android" | "ios" | "web"
      expense_source:
        | "scan"
        | "voice"
        | "text"
        | "upi_alert"
        | "sms"
        | "ebill"
        | "manual"
        | "recurring"
        | "assistant"
      expense_status: "proposed" | "confirmed" | "void"
      expense_visibility: "personal" | "shared"
      goal_status: "active" | "achieved" | "archived"
      item_kind: "item" | "discount" | "service" | "tax" | "tip"
      learned_rule_kind: "category" | "merchant" | "split"
      member_role: "owner" | "member"
      nudge_frequency: "as_it_happens" | "daily" | "weekly"
      payment_via: "upi" | "cash" | "card" | "bank" | "wallet" | "other"
      proposal_status: "pending" | "accepted" | "edited" | "rejected"
      recurring_cadence:
        | "weekly"
        | "monthly"
        | "quarterly"
        | "half_yearly"
        | "yearly"
      recurring_kind: "subscription" | "emi" | "bill" | "other"
      recurring_status: "active" | "paused" | "cancelled" | "ended"
      reminder_repeat: "once" | "every_3_days" | "weekly"
      reminder_status: "active" | "done" | "cancelled"
      reminder_tone: "friendly" | "neutral" | "firm"
      settlement_method: "upi" | "cash" | "bank" | "other"
      settlement_status:
        | "initiated"
        | "pending"
        | "completed"
        | "failed"
        | "confirmed_manual"
        | "corrected"
        | "cancelled"
      space_status: "active" | "settling" | "settled" | "archived"
      space_type:
        | "trip"
        | "event"
        | "couple"
        | "family"
        | "roommates"
        | "friends"
        | "college"
        | "office"
        | "custom"
      split_method:
        | "equal"
        | "ratio"
        | "by_room"
        | "by_usage"
        | "by_item"
        | "fixed"
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
      budget_period: ["weekly", "monthly", "custom"],
      budget_scope: ["monthly", "weekly", "category", "group", "event", "trip"],
      capture_source: ["upi_notification", "sms", "ebill", "manual"],
      capture_status: ["inbox", "confirmed", "not_mine"],
      device_platform: ["android", "ios", "web"],
      expense_source: [
        "scan",
        "voice",
        "text",
        "upi_alert",
        "sms",
        "ebill",
        "manual",
        "recurring",
        "assistant",
      ],
      expense_status: ["proposed", "confirmed", "void"],
      expense_visibility: ["personal", "shared"],
      goal_status: ["active", "achieved", "archived"],
      item_kind: ["item", "discount", "service", "tax", "tip"],
      learned_rule_kind: ["category", "merchant", "split"],
      member_role: ["owner", "member"],
      nudge_frequency: ["as_it_happens", "daily", "weekly"],
      payment_via: ["upi", "cash", "card", "bank", "wallet", "other"],
      proposal_status: ["pending", "accepted", "edited", "rejected"],
      recurring_cadence: [
        "weekly",
        "monthly",
        "quarterly",
        "half_yearly",
        "yearly",
      ],
      recurring_kind: ["subscription", "emi", "bill", "other"],
      recurring_status: ["active", "paused", "cancelled", "ended"],
      reminder_repeat: ["once", "every_3_days", "weekly"],
      reminder_status: ["active", "done", "cancelled"],
      reminder_tone: ["friendly", "neutral", "firm"],
      settlement_method: ["upi", "cash", "bank", "other"],
      settlement_status: [
        "initiated",
        "pending",
        "completed",
        "failed",
        "confirmed_manual",
        "corrected",
        "cancelled",
      ],
      space_status: ["active", "settling", "settled", "archived"],
      space_type: [
        "trip",
        "event",
        "couple",
        "family",
        "roommates",
        "friends",
        "college",
        "office",
        "custom",
      ],
      split_method: [
        "equal",
        "ratio",
        "by_room",
        "by_usage",
        "by_item",
        "fixed",
      ],
    },
  },
} as const
