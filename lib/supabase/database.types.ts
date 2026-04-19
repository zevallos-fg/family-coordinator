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
      api_usage: {
        Row: {
          cost_cents: number | null
          created_at: string
          error_message: string | null
          family_id: string | null
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          response_preview: string | null
          skill_name: string
          user_id: string | null
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          error_message?: string | null
          family_id?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          response_preview?: string | null
          skill_name: string
          user_id?: string | null
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          error_message?: string | null
          family_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          response_preview?: string | null
          skill_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          family_id: string | null
          id: string
          metadata: Json | null
          row_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          family_id?: string | null
          id?: string
          metadata?: Json | null
          row_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          family_id?: string | null
          id?: string
          metadata?: Json | null
          row_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      barcodes: {
        Row: {
          brand: string | null
          created_at: string
          family_id: string
          id: string
          ingredient_id: string | null
          product_name: string | null
          upc: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          family_id: string
          id?: string
          ingredient_id?: string | null
          product_name?: string | null
          upc: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          family_id?: string
          id?: string
          ingredient_id?: string | null
          product_name?: string | null
          upc?: string
        }
        Relationships: [
          {
            foreignKeyName: "barcodes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcodes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          category_id: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string | null
          family_id: string
          id: string
          text: string
          voice_transcription: boolean
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          family_id: string
          id?: string
          text: string
          voice_transcription?: boolean
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          family_id?: string
          id?: string
          text?: string
          voice_transcription?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "captures_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_mileage: {
        Row: {
          caregiver_id: string
          created_at: string
          family_id: string
          id: string
          miles: number
          purpose: string | null
          rate_per_mile_cents: number | null
          reimbursed_at: string | null
          trip_date: string
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          family_id: string
          id?: string
          miles: number
          purpose?: string | null
          rate_per_mile_cents?: number | null
          reimbursed_at?: string | null
          trip_date: string
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          family_id?: string
          id?: string
          miles?: number
          purpose?: string | null
          rate_per_mile_cents?: number | null
          reimbursed_at?: string | null
          trip_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_mileage_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "caregivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_mileage_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_shifts: {
        Row: {
          caregiver_id: string
          created_at: string
          end_at: string
          family_id: string
          id: string
          kid_names: string[] | null
          start_at: string
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          end_at: string
          family_id: string
          id?: string
          kid_names?: string[] | null
          start_at: string
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          end_at?: string
          family_id?: string
          id?: string
          kid_names?: string[] | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_shifts_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "caregivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_shifts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_timesheets: {
        Row: {
          caregiver_id: string
          created_at: string
          end_at: string
          family_id: string
          hourly_rate_cents: number | null
          hours: number | null
          id: string
          notes: string | null
          paid_at: string | null
          start_at: string
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          end_at: string
          family_id: string
          hourly_rate_cents?: number | null
          hours?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          start_at: string
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          end_at?: string
          family_id?: string
          hourly_rate_cents?: number | null
          hours?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_timesheets_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "caregivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caregiver_timesheets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      caregivers: {
        Row: {
          created_at: string
          email: string | null
          family_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          family_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role: string
        }
        Update: {
          created_at?: string
          email?: string | null
          family_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregivers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          family_id: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          urgent: boolean
        }
        Insert: {
          created_at?: string
          family_id: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          urgent?: boolean
        }
        Update: {
          created_at?: string
          family_id?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "categories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      digests: {
        Row: {
          blind_spots: Json | null
          content: string
          created_at: string
          family_id: string
          id: string
          sent_at: string | null
          week_start_date: string
        }
        Insert: {
          blind_spots?: Json | null
          content: string
          created_at?: string
          family_id: string
          id?: string
          sent_at?: string | null
          week_start_date: string
        }
        Update: {
          blind_spots?: Json | null
          content?: string
          created_at?: string
          family_id?: string
          id?: string
          sent_at?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "digests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string | null
          family_id: string
          file_size_bytes: number | null
          file_url: string
          id: string
          indexed_at: string | null
          ocr_text: string | null
          tags: string[] | null
          title: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          family_id: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          indexed_at?: string | null
          ocr_text?: string | null
          tags?: string[] | null
          title: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          family_id?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          indexed_at?: string | null
          ocr_text?: string | null
          tags?: string[] | null
          title?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string | null
          created_at: string
          family_id: string
          id: string
          merchant: string | null
          notes: string | null
          paid_by_user_id: string | null
          purchased_at: string | null
          source_receipt_id: string | null
        }
        Insert: {
          amount_cents: number
          category?: string | null
          created_at?: string
          family_id: string
          id?: string
          merchant?: string | null
          notes?: string | null
          paid_by_user_id?: string | null
          purchased_at?: string | null
          source_receipt_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          family_id?: string
          id?: string
          merchant?: string | null
          notes?: string | null
          paid_by_user_id?: string | null
          purchased_at?: string | null
          source_receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_user_id_fkey"
            columns: ["paid_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          family_id: string
          id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          family_id: string
          id?: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          family_id?: string
          id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          family_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          family_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          family_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          category: string | null
          content: string
          created_at: string
          family_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          family_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          family_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_items: {
        Row: {
          completed_at: string | null
          created_at: string
          family_id: string
          id: string
          in_cart: boolean
          name: string
          quantity: string | null
          source_capture_id: string | null
          store_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          family_id: string
          id?: string
          in_cart?: boolean
          name: string
          quantity?: string | null
          source_capture_id?: string | null
          store_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          family_id?: string
          id?: string
          in_cart?: boolean
          name?: string
          quantity?: string | null
          source_capture_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_source_capture_id_fkey"
            columns: ["source_capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_emails: {
        Row: {
          body: string | null
          family_id: string
          from_address: string
          id: string
          parsed_at: string | null
          parsed_output: Json | null
          received_at: string
          subject: string | null
        }
        Insert: {
          body?: string | null
          family_id: string
          from_address: string
          id?: string
          parsed_at?: string | null
          parsed_output?: Json | null
          received_at?: string
          subject?: string | null
        }
        Update: {
          body?: string | null
          family_id?: string
          from_address?: string
          id?: string
          parsed_at?: string | null
          parsed_output?: Json | null
          received_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_emails_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_forward_addresses: {
        Row: {
          created_at: string
          family_id: string
          forward_address: string
          id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          forward_address: string
          id?: string
        }
        Update: {
          created_at?: string
          family_id?: string
          forward_address?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_forward_addresses_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          aisle: string | null
          canonical_name: string
          created_at: string
          default_unit: string | null
          family_id: string
          id: string
          name: string
        }
        Insert: {
          aisle?: string | null
          canonical_name: string
          created_at?: string
          default_unit?: string | null
          family_id: string
          id?: string
          name: string
        }
        Update: {
          aisle?: string | null
          canonical_name?: string
          created_at?: string
          default_unit?: string | null
          family_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_birthday_events: {
        Row: {
          created_at: string
          family_id: string
          gift_planned: string | null
          host_name: string | null
          id: string
          kid_id: string | null
          notes: string | null
          party_date: string
          rsvp_status: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          gift_planned?: string | null
          host_name?: string | null
          id?: string
          kid_id?: string | null
          notes?: string | null
          party_date: string
          rsvp_status?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          gift_planned?: string | null
          host_name?: string | null
          id?: string
          kid_id?: string | null
          notes?: string | null
          party_date?: string
          rsvp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_birthday_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_birthday_events_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_milestones: {
        Row: {
          created_at: string
          family_id: string
          id: string
          kid_id: string
          logged_at: string
          milestone_type: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          logged_at: string
          milestone_type: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          logged_at?: string
          milestone_type?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_milestones_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_milestones_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          birth_date: string | null
          clothing_size: string | null
          created_at: string
          family_id: string
          food_aversions: string[] | null
          food_favorites: string[] | null
          id: string
          name: string
          notes: string | null
          shoe_size: string | null
        }
        Insert: {
          birth_date?: string | null
          clothing_size?: string | null
          created_at?: string
          family_id: string
          food_aversions?: string[] | null
          food_favorites?: string[] | null
          id?: string
          name: string
          notes?: string | null
          shoe_size?: string | null
        }
        Update: {
          birth_date?: string | null
          clothing_size?: string | null
          created_at?: string
          family_id?: string
          food_aversions?: string[] | null
          food_favorites?: string[] | null
          id?: string
          name?: string
          notes?: string | null
          shoe_size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kids_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          date: string
          id: string
          meal_plan_id: string
          meal_type: string
          notes: string | null
          recipe_id: string | null
        }
        Insert: {
          date: string
          id?: string
          meal_plan_id: string
          meal_type: string
          notes?: string | null
          recipe_id?: string | null
        }
        Update: {
          date?: string
          id?: string
          meal_plan_id?: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          family_id: string
          id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_events: {
        Row: {
          created_at: string
          event_date: string
          event_type: string
          family_id: string
          id: string
          kid_id: string | null
          notes: string | null
          provider: string | null
        }
        Insert: {
          created_at?: string
          event_date: string
          event_type: string
          family_id: string
          id?: string
          kid_id?: string | null
          notes?: string | null
          provider?: string | null
        }
        Update: {
          created_at?: string
          event_date?: string
          event_type?: string
          family_id?: string
          id?: string
          kid_id?: string | null
          notes?: string | null
          provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_events_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          amount: number | null
          created_at: string
          expires_on: string | null
          family_id: string
          id: string
          ingredient_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          expires_on?: string | null
          family_id: string
          id?: string
          ingredient_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          expires_on?: string | null
          family_id?: string
          id?: string
          ingredient_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          amount: number | null
          id: string
          mapped_ingredient_id: string | null
          name: string
          price_cents: number | null
          receipt_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          id?: string
          mapped_ingredient_id?: string | null
          name: string
          price_cents?: number | null
          receipt_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          id?: string
          mapped_ingredient_id?: string | null
          name?: string
          price_cents?: number | null
          receipt_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_mapped_ingredient_id_fkey"
            columns: ["mapped_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          family_id: string
          id: string
          image_url: string
          parsed_at: string | null
          purchased_at: string | null
          store_id: string | null
          total_cents: number | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          family_id: string
          id?: string
          image_url: string
          parsed_at?: string | null
          purchased_at?: string | null
          store_id?: string | null
          total_cents?: number | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          family_id?: string
          id?: string
          image_url?: string
          parsed_at?: string | null
          purchased_at?: string | null
          store_id?: string | null
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          amount: number | null
          ingredient_id: string
          notes: string | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          ingredient_id: string
          notes?: string | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          ingredient_id?: string
          notes?: string | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_time_min: number | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          family_id: string
          id: string
          instructions: string | null
          prep_time_min: number | null
          servings: number | null
          source_url: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          cook_time_min?: number | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          family_id: string
          id?: string
          instructions?: string | null
          prep_time_min?: number | null
          servings?: number | null
          source_url?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          cook_time_min?: number | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          family_id?: string
          id?: string
          instructions?: string | null
          prep_time_min?: number | null
          servings?: number | null
          source_url?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursements: {
        Row: {
          amount_cents: number
          created_at: string
          expense_ids: string[] | null
          family_id: string
          from_user_id: string
          id: string
          settled_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          expense_ids?: string[] | null
          family_id: string
          from_user_id: string
          id?: string
          settled_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          expense_ids?: string[] | null
          family_id?: string
          from_user_id?: string
          id?: string
          settled_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursements_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursements_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursements_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          date: string
          duty_type: string
          family_id: string
          id: string
          notes: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          date: string
          duty_type: string
          family_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          date?: string
          duty_type?: string
          family_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_checklists: {
        Row: {
          completed_at: string | null
          created_at: string
          due_by_date: string | null
          family_id: string
          id: string
          item_text: string
          season: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_by_date?: string | null
          family_id: string
          id?: string
          item_text: string
          season: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_by_date?: string | null
          family_id?: string
          id?: string
          item_text?: string
          season?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_checklists_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_briefs: {
        Row: {
          content: string
          generated_at: string
          id: string
          shift_id: string
        }
        Insert: {
          content: string
          generated_at?: string
          id?: string
          shift_id: string
        }
        Update: {
          content?: string
          generated_at?: string
          id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_briefs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "caregiver_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_recaps: {
        Row: {
          id: string
          shift_id: string
          structured_log: Json | null
          submitted_at: string
          transcription: string | null
          voice_url: string | null
        }
        Insert: {
          id?: string
          shift_id: string
          structured_log?: Json | null
          submitted_at?: string
          transcription?: string | null
          voice_url?: string | null
        }
        Update: {
          id?: string
          shift_id?: string
          structured_log?: Json | null
          submitted_at?: string
          transcription?: string | null
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_recaps_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "caregiver_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          family_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          family_id: string
          id: string
          owner_user_id: string | null
          source_capture_id: string | null
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          family_id: string
          id?: string
          owner_user_id?: string | null
          source_capture_id?: string | null
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          family_id?: string
          id?: string
          owner_user_id?: string | null
          source_capture_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_capture_id_fkey"
            columns: ["source_capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_packing_items: {
        Row: {
          id: string
          item: string
          notes: string | null
          owner_user_id: string | null
          packed: boolean
          trip_id: string
        }
        Insert: {
          id?: string
          item: string
          notes?: string | null
          owner_user_id?: string | null
          packed?: boolean
          trip_id: string
        }
        Update: {
          id?: string
          item?: string
          notes?: string | null
          owner_user_id?: string | null
          packed?: boolean
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_packing_items_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_packing_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination: string
          end_date: string
          family_id: string
          id: string
          notes: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          destination: string
          end_date: string
          family_id: string
          id?: string
          notes?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          destination?: string
          end_date?: string
          family_id?: string
          id?: string
          notes?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      vendor_services: {
        Row: {
          cost_cents: number | null
          created_at: string
          id: string
          notes: string | null
          service_date: string
          vendor_id: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          service_date: string
          vendor_id: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          service_date?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_services_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          category: string | null
          created_at: string
          email: string | null
          family_id: string
          id: string
          last_used_at: string | null
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          website: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          email?: string | null
          family_id: string
          id?: string
          last_used_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          website?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          email?: string | null
          family_id?: string
          id?: string
          last_used_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_accept_invite: { Args: { p_token: string }; Returns: string }
      fn_create_family_and_claim: {
        Args: { p_city?: string; p_name: string; p_timezone?: string }
        Returns: string
      }
      fn_skill_get_monthly_spend: {
        Args: { target_family_id: string }
        Returns: number
      }
      fn_skill_record_usage: {
        Args: {
          p_cost_cents: number
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_skill_name: string
          target_family_id: string
          target_user_id: string
        }
        Returns: string
      }
      fn_skill_update_diagnostics: {
        Args: {
          p_error_message?: string
          p_response_preview?: string
          p_usage_id: string
        }
        Returns: undefined
      }
      fn_user_in_family: {
        Args: { target_family_id: string }
        Returns: boolean
      }
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
