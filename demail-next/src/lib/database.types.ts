// Hand-written to match supabase/migrations. Regenerate with `supabase gen types typescript` when a database is available.
export type ReplyIntent = "interested" | "meeting" | "question" | "not_interested" | "unsubscribe" | "out_of_office" | "referral" | "other";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          is_agency: boolean;
          agency_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          is_agency?: boolean;
          agency_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          is_agency?: boolean;
          agency_id?: string | null;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: Database['public']['Enums']['member_role'];
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: Database['public']['Enums']['member_role'];
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: Database['public']['Enums']['member_role'];
          created_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database['public']['Enums']['member_role'];
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: Database['public']['Enums']['member_role'];
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database['public']['Enums']['member_role'];
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          company: string | null;
          phone: string | null;
          custom_fields: Json;
          subscribed: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          phone?: string | null;
          custom_fields?: Json;
          subscribed?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          phone?: string | null;
          custom_fields?: Json;
          subscribed?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      contact_labels: {
        Row: {
          contact_id: string;
          label_id: string;
          organization_id: string;
        };
        Insert: {
          contact_id: string;
          label_id: string;
          organization_id: string;
        };
        Update: {
          contact_id?: string;
          label_id?: string;
          organization_id?: string;
        };
        Relationships: [];
      };
      mailboxes: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          from_name: string;
          reply_to: string | null;
          provider: 'resend' | 'google' | 'microsoft';
          status: Database['public']['Enums']['mailbox_status'];
          daily_limit: number;
          min_gap_seconds: number;
          signature_plain: string | null;
          signature_html: string | null;
          timezone: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          last_synced_at: string | null;
          last_error: string | null;
          provider_account_id: string | null;
          warmup_enabled: boolean;
          warmup_started_at: string | null;
          warmup_disabled_at: string | null;
          warmup_start: string;
          warmup_end: string;
          warmup_filter_tag_enabled: boolean;
          warmup_filter_tag: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          from_name?: string;
          reply_to?: string | null;
          provider?: 'resend' | 'google' | 'microsoft';
          status?: Database['public']['Enums']['mailbox_status'];
          daily_limit?: number;
          min_gap_seconds?: number;
          signature_plain?: string | null;
          signature_html?: string | null;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          last_synced_at?: string | null;
          last_error?: string | null;
          provider_account_id?: string | null;
          warmup_enabled?: boolean;
          warmup_started_at?: string | null;
          warmup_disabled_at?: string | null;
          warmup_start?: string;
          warmup_end?: string;
          warmup_filter_tag_enabled?: boolean;
          warmup_filter_tag?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          from_name?: string;
          reply_to?: string | null;
          provider?: 'resend' | 'google' | 'microsoft';
          status?: Database['public']['Enums']['mailbox_status'];
          daily_limit?: number;
          min_gap_seconds?: number;
          signature_plain?: string | null;
          signature_html?: string | null;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          last_synced_at?: string | null;
          last_error?: string | null;
          provider_account_id?: string | null;
          warmup_enabled?: boolean;
          warmup_started_at?: string | null;
          warmup_disabled_at?: string | null;
          warmup_start?: string;
          warmup_end?: string;
          warmup_filter_tag_enabled?: boolean;
          warmup_filter_tag?: string | null;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          status: Database['public']['Enums']['campaign_status'];
          stop_on_reply: boolean;
          daily_limit: number | null;
          timezone: string;
          send_days: number;
          send_start: string;
          send_end: string;
          unsubscribe_header: boolean;
          track_opens: boolean;
          track_clicks: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          status?: Database['public']['Enums']['campaign_status'];
          stop_on_reply?: boolean;
          daily_limit?: number | null;
          timezone?: string;
          send_days?: number;
          send_start?: string;
          send_end?: string;
          unsubscribe_header?: boolean;
          track_opens?: boolean;
          track_clicks?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          status?: Database['public']['Enums']['campaign_status'];
          stop_on_reply?: boolean;
          daily_limit?: number | null;
          timezone?: string;
          send_days?: number;
          send_start?: string;
          send_end?: string;
          unsubscribe_header?: boolean;
          track_opens?: boolean;
          track_clicks?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_steps: {
        Row: {
          id: string;
          campaign_id: string;
          organization_id: string;
          position: number;
          type: Database['public']['Enums']['step_type'];
          name: string | null;
          subject: string | null;
          body_plain: string | null;
          body_html: string | null;
          wait_seconds: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          organization_id: string;
          position: number;
          type: Database['public']['Enums']['step_type'];
          name?: string | null;
          subject?: string | null;
          body_plain?: string | null;
          body_html?: string | null;
          wait_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          organization_id?: string;
          position?: number;
          type?: Database['public']['Enums']['step_type'];
          name?: string | null;
          subject?: string | null;
          body_plain?: string | null;
          body_html?: string | null;
          wait_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_step_variants: {
        Row: {
          id: string;
          organization_id: string;
          step_id: string;
          label: string;
          subject: string;
          body_plain: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          step_id: string;
          label: string;
          subject: string;
          body_plain: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          step_id?: string;
          label?: string;
          subject?: string;
          body_plain?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_mailboxes: {
        Row: {
          campaign_id: string;
          mailbox_id: string;
          organization_id: string;
        };
        Insert: {
          campaign_id: string;
          mailbox_id: string;
          organization_id: string;
        };
        Update: {
          campaign_id?: string;
          mailbox_id?: string;
          organization_id?: string;
        };
        Relationships: [];
      };
      campaign_contacts: {
        Row: {
          id: string;
          campaign_id: string;
          contact_id: string;
          organization_id: string;
          status: Database['public']['Enums']['enrollment_status'];
          current_step: number;
          next_send_at: string | null;
          last_sent_at: string | null;
          mailbox_id: string | null;
          attempts: number;
          error: string | null;
          stopped_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          contact_id: string;
          organization_id: string;
          status?: Database['public']['Enums']['enrollment_status'];
          current_step?: number;
          next_send_at?: string | null;
          last_sent_at?: string | null;
          mailbox_id?: string | null;
          attempts?: number;
          error?: string | null;
          stopped_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          contact_id?: string;
          organization_id?: string;
          status?: Database['public']['Enums']['enrollment_status'];
          current_step?: number;
          next_send_at?: string | null;
          last_sent_at?: string | null;
          mailbox_id?: string | null;
          attempts?: number;
          error?: string | null;
          stopped_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          contact_id: string;
          step_id: string | null;
          mailbox_id: string | null;
          status: Database['public']['Enums']['message_status'];
          resend_id: string | null;
          idempotency_key: string;
          subject: string | null;
          error: string | null;
          sent_at: string | null;
          provider_message_id: string | null;
          provider_thread_id: string | null;
          rfc_message_id: string | null;
          variant_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          campaign_id: string;
          contact_id: string;
          step_id?: string | null;
          mailbox_id?: string | null;
          status?: Database['public']['Enums']['message_status'];
          resend_id?: string | null;
          idempotency_key: string;
          subject?: string | null;
          error?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          rfc_message_id?: string | null;
          variant_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          campaign_id?: string;
          contact_id?: string;
          step_id?: string | null;
          mailbox_id?: string | null;
          status?: Database['public']['Enums']['message_status'];
          resend_id?: string | null;
          idempotency_key?: string;
          subject?: string | null;
          error?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          rfc_message_id?: string | null;
          variant_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      suppressed_recipients: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          reason: string | null;
          source: string;
          campaign_id: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          reason?: string | null;
          source?: string;
          campaign_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          reason?: string | null;
          source?: string;
          campaign_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      mailbox_credentials: {
        Row: {
          mailbox_id: string;
          organization_id: string;
          ciphertext: string;
          key_version: number;
          version: number;
          scopes: string | null;
          expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          mailbox_id: string;
          organization_id: string;
          ciphertext: string;
          key_version?: number;
          version?: number;
          scopes?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          mailbox_id?: string;
          organization_id?: string;
          ciphertext?: string;
          key_version?: number;
          version?: number;
          scopes?: string | null;
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mailbox_sync_state: {
        Row: {
          mailbox_id: string;
          organization_id: string;
          cursor: string | null;
          next_sync_at: string;
          last_synced_at: string | null;
          consecutive_errors: number;
          hot: boolean;
        };
        Insert: {
          mailbox_id: string;
          organization_id: string;
          cursor?: string | null;
          next_sync_at?: string;
          last_synced_at?: string | null;
          consecutive_errors?: number;
          hot?: boolean;
        };
        Update: {
          mailbox_id?: string;
          organization_id?: string;
          cursor?: string | null;
          next_sync_at?: string;
          last_synced_at?: string | null;
          consecutive_errors?: number;
          hot?: boolean;
        };
        Relationships: [];
      };
      threads: {
        Row: {
          id: string;
          organization_id: string;
          mailbox_id: string;
          provider_thread_id: string;
          subject: string | null;
          contact_id: string | null;
          campaign_id: string | null;
          snippet: string | null;
          last_message_at: string;
          is_unread: boolean;
          status: 'open' | 'archived';
          intent: ReplyIntent | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          mailbox_id: string;
          provider_thread_id: string;
          subject?: string | null;
          contact_id?: string | null;
          campaign_id?: string | null;
          snippet?: string | null;
          last_message_at: string;
          is_unread?: boolean;
          status?: 'open' | 'archived';
          intent?: ReplyIntent | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          mailbox_id?: string;
          provider_thread_id?: string;
          subject?: string | null;
          contact_id?: string | null;
          campaign_id?: string | null;
          snippet?: string | null;
          last_message_at?: string;
          is_unread?: boolean;
          status?: 'open' | 'archived';
          intent?: ReplyIntent | null;
          created_at?: string;
        };
        Relationships: [];
      };
      thread_messages: {
        Row: {
          id: string;
          organization_id: string;
          thread_id: string;
          direction: 'in' | 'out';
          kind: 'reply' | 'auto_reply' | 'bounce' | 'sent';
          provider_message_id: string;
          rfc_message_id: string | null;
          in_reply_to: string | null;
          from_email: string | null;
          from_name: string | null;
          to_emails: string[];
          subject: string | null;
          body_text: string | null;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          thread_id: string;
          direction: 'in' | 'out';
          kind: 'reply' | 'auto_reply' | 'bounce' | 'sent';
          provider_message_id: string;
          rfc_message_id?: string | null;
          in_reply_to?: string | null;
          from_email?: string | null;
          from_name?: string | null;
          to_emails?: string[];
          subject?: string | null;
          body_text?: string | null;
          sent_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          thread_id?: string;
          direction?: 'in' | 'out';
          kind?: 'reply' | 'auto_reply' | 'bounce' | 'sent';
          provider_message_id?: string;
          rfc_message_id?: string | null;
          in_reply_to?: string | null;
          from_email?: string | null;
          from_name?: string | null;
          to_emails?: string[];
          subject?: string | null;
          body_text?: string | null;
          sent_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tracking_events: {
        Row: {
          id: string;
          organization_id: string;
          message_id: string;
          contact_id: string | null;
          campaign_id: string | null;
          mailbox_id: string | null;
          type: 'open' | 'click';
          url: string | null;
          counted: boolean;
          filter_reason: 'bot' | 'prefetch' | 'privacy_proxy' | 'too_early' | 'own_read' | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          message_id: string;
          contact_id?: string | null;
          campaign_id?: string | null;
          mailbox_id?: string | null;
          type: 'open' | 'click';
          url?: string | null;
          counted: boolean;
          filter_reason?: 'bot' | 'prefetch' | 'privacy_proxy' | 'too_early' | 'own_read' | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          message_id?: string;
          contact_id?: string | null;
          campaign_id?: string | null;
          mailbox_id?: string | null;
          type?: 'open' | 'click';
          url?: string | null;
          counted?: boolean;
          filter_reason?: 'bot' | 'prefetch' | 'privacy_proxy' | 'too_early' | 'own_read' | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      delivery_events: {
        Row: {
          id: string;
          organization_id: string;
          mailbox_id: string | null;
          message_id: string | null;
          contact_id: string | null;
          campaign_id: string | null;
          type: 'bounce' | 'complaint';
          source: 'sync' | 'resend';
          detail: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          mailbox_id?: string | null;
          message_id?: string | null;
          contact_id?: string | null;
          campaign_id?: string | null;
          type: 'bounce' | 'complaint';
          source: 'sync' | 'resend';
          detail?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          mailbox_id?: string | null;
          message_id?: string | null;
          contact_id?: string | null;
          campaign_id?: string | null;
          type?: 'bounce' | 'complaint';
          source?: 'sync' | 'resend';
          detail?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      warmup_threads: {
        Row: {
          id: string;
          organization_id: string;
          library_key: string;
          initiator_mailbox_id: string;
          partner_mailbox_id: string;
          turns_total: number;
          turns_sent: number;
          status: 'open' | 'closed';
          created_at: string;
          last_turn_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          library_key: string;
          initiator_mailbox_id: string;
          partner_mailbox_id: string;
          turns_total: number;
          turns_sent?: number;
          status?: 'open' | 'closed';
          created_at?: string;
          last_turn_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          library_key?: string;
          initiator_mailbox_id?: string;
          partner_mailbox_id?: string;
          turns_total?: number;
          turns_sent?: number;
          status?: 'open' | 'closed';
          created_at?: string;
          last_turn_at?: string | null;
        };
        Relationships: [];
      };
      warmup_messages: {
        Row: {
          id: string;
          organization_id: string;
          thread_id: string;
          turn: number;
          sender_mailbox_id: string;
          recipient_mailbox_id: string;
          rfc_message_id: string | null;
          provider_message_id: string | null;
          provider_thread_id: string | null;
          recipient_provider_message_id: string | null;
          recipient_provider_thread_id: string | null;
          subject: string;
          sent_at: string;
          placement: 'inbox' | 'spam' | 'other' | 'missing' | null;
          placement_checked_at: string | null;
          check_attempts: number;
          rescued: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          thread_id: string;
          turn: number;
          sender_mailbox_id: string;
          recipient_mailbox_id: string;
          rfc_message_id?: string | null;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          recipient_provider_message_id?: string | null;
          recipient_provider_thread_id?: string | null;
          subject: string;
          sent_at?: string;
          placement?: 'inbox' | 'spam' | 'other' | 'missing' | null;
          placement_checked_at?: string | null;
          check_attempts?: number;
          rescued?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          thread_id?: string;
          turn?: number;
          sender_mailbox_id?: string;
          recipient_mailbox_id?: string;
          rfc_message_id?: string | null;
          provider_message_id?: string | null;
          provider_thread_id?: string | null;
          recipient_provider_message_id?: string | null;
          recipient_provider_thread_id?: string | null;
          subject?: string;
          sent_at?: string;
          placement?: 'inbox' | 'spam' | 'other' | 'missing' | null;
          placement_checked_at?: string | null;
          check_attempts?: number;
          rescued?: boolean;
        };
        Relationships: [];
      };
      warmup_jobs: {
        Row: {
          id: string;
          organization_id: string;
          mailbox_id: string;
          kind: 'start' | 'check' | 'reply';
          thread_id: string | null;
          message_id: string | null;
          plan_day: string | null;
          slot: number | null;
          run_at: string;
          status: 'pending' | 'done' | 'failed' | 'skipped';
          attempts: number;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          mailbox_id: string;
          kind: 'start' | 'check' | 'reply';
          thread_id?: string | null;
          message_id?: string | null;
          plan_day?: string | null;
          slot?: number | null;
          run_at: string;
          status?: 'pending' | 'done' | 'failed' | 'skipped';
          attempts?: number;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          mailbox_id?: string;
          kind?: 'start' | 'check' | 'reply';
          thread_id?: string | null;
          message_id?: string | null;
          plan_day?: string | null;
          slot?: number | null;
          run_at?: string;
          status?: 'pending' | 'done' | 'failed' | 'skipped';
          attempts?: number;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      mailbox_health: {
        Row: {
          mailbox_id: string;
          organization_id: string;
          band: 'healthy' | 'watch' | 'throttled' | 'paused';
          sent_7d: number;
          bounces_7d: number;
          complaints_7d: number;
          bounce_rate: number;
          complaint_rate: number;
          spam_rate: number | null;
          reason: string | null;
          band_changed_at: string;
          updated_at: string;
        };
        Insert: {
          mailbox_id: string;
          organization_id: string;
          band?: 'healthy' | 'watch' | 'throttled' | 'paused';
          sent_7d?: number;
          bounces_7d?: number;
          complaints_7d?: number;
          bounce_rate?: number;
          complaint_rate?: number;
          spam_rate?: number | null;
          reason?: string | null;
          band_changed_at?: string;
          updated_at?: string;
        };
        Update: {
          mailbox_id?: string;
          organization_id?: string;
          band?: 'healthy' | 'watch' | 'throttled' | 'paused';
          sent_7d?: number;
          bounces_7d?: number;
          complaints_7d?: number;
          bounce_rate?: number;
          complaint_rate?: number;
          spam_rate?: number | null;
          reason?: string | null;
          band_changed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mailbox_health_events: {
        Row: {
          id: string;
          organization_id: string;
          mailbox_id: string;
          from_band: 'healthy' | 'watch' | 'throttled' | 'paused';
          to_band: 'healthy' | 'watch' | 'throttled' | 'paused';
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          mailbox_id: string;
          from_band: 'healthy' | 'watch' | 'throttled' | 'paused';
          to_band: 'healthy' | 'watch' | 'throttled' | 'paused';
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          mailbox_id?: string;
          from_band?: 'healthy' | 'watch' | 'throttled' | 'paused';
          to_band?: 'healthy' | 'watch' | 'throttled' | 'paused';
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sending_domains: {
        Row: {
          id: string;
          organization_id: string;
          domain: string;
          provider_hint: 'google' | 'microsoft' | 'resend' | 'other';
          dkim_selector: string | null;
          spf_status: 'pass' | 'missing' | 'fail' | 'unknown';
          dkim_status: 'pass' | 'missing' | 'fail' | 'unknown';
          dmarc_status: 'pass' | 'missing' | 'fail' | 'unknown';
          spf_record: string | null;
          dmarc_record: string | null;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          domain: string;
          provider_hint?: 'google' | 'microsoft' | 'resend' | 'other';
          dkim_selector?: string | null;
          spf_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          dkim_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          dmarc_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          spf_record?: string | null;
          dmarc_record?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          domain?: string;
          provider_hint?: 'google' | 'microsoft' | 'resend' | 'other';
          dkim_selector?: string | null;
          spf_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          dkim_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          dmarc_status?: 'pass' | 'missing' | 'fail' | 'unknown';
          spf_record?: string | null;
          dmarc_record?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          organization_id: string;
          enabled: boolean;
          base_url: string | null;
          model: string | null;
          daily_call_limit: number;
          classify_replies: boolean;
          classify_enabled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          enabled?: boolean;
          base_url?: string | null;
          model?: string | null;
          daily_call_limit?: number;
          classify_replies?: boolean;
          classify_enabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          enabled?: boolean;
          base_url?: string | null;
          model?: string | null;
          daily_call_limit?: number;
          classify_replies?: boolean;
          classify_enabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_credentials: {
        Row: {
          organization_id: string;
          ciphertext: string;
          key_hint: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          ciphertext: string;
          key_hint: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          ciphertext?: string;
          key_hint?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          organization_id: string;
          day: string;
          source: "workspace" | "instance" | "agency";
          calls: number;
          prompt_tokens: number;
          completion_tokens: number;
        };
        Insert: {
          organization_id: string;
          day: string;
          source: "workspace" | "instance" | "agency";
          calls?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        };
        Update: {
          organization_id?: string;
          day?: string;
          source?: "workspace" | "instance" | "agency";
          calls?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        };
        Relationships: [];
      };
      ai_drafts: {
        Row: {
          id: string;
          organization_id: string;
          kind: "step" | "reply";
          campaign_id: string | null;
          thread_id: string | null;
          brief: string | null;
          subject: string | null;
          body: string;
          status: "draft" | "used" | "sent" | "discarded";
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          kind: "step" | "reply";
          campaign_id?: string | null;
          thread_id?: string | null;
          brief?: string | null;
          subject?: string | null;
          body: string;
          status?: "draft" | "used" | "sent" | "discarded";
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          kind?: "step" | "reply";
          campaign_id?: string | null;
          thread_id?: string | null;
          brief?: string | null;
          subject?: string | null;
          body?: string;
          status?: "draft" | "used" | "sent" | "discarded";
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reply_intents: {
        Row: {
          thread_message_id: string;
          organization_id: string;
          thread_id: string;
          status: "running" | "done" | "failed";
          intent: ReplyIntent | null;
          summary: string | null;
          attempts: number;
          lease_until: string | null;
          next_attempt_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          thread_message_id: string;
          organization_id: string;
          thread_id: string;
          status?: "running" | "done" | "failed";
          intent?: ReplyIntent | null;
          summary?: string | null;
          attempts?: number;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          thread_message_id?: string;
          organization_id?: string;
          thread_id?: string;
          status?: "running" | "done" | "failed";
          intent?: ReplyIntent | null;
          summary?: string | null;
          attempts?: number;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_connections: {
        Row: {
          organization_id: string;
          provider: "hubspot";
          enabled: boolean;
          pull_contacts: boolean;
          push_replies: boolean;
          label_id: string | null;
          portal_id: string | null;
          pull_cursor: number | null;
          push_cursor: string;
          next_sync_at: string;
          lease_until: string | null;
          last_synced_at: string | null;
          last_error: string | null;
          consecutive_errors: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          provider: "hubspot";
          enabled?: boolean;
          pull_contacts?: boolean;
          push_replies?: boolean;
          label_id?: string | null;
          portal_id?: string | null;
          pull_cursor?: number | null;
          push_cursor?: string;
          next_sync_at?: string;
          lease_until?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          provider?: "hubspot";
          enabled?: boolean;
          pull_contacts?: boolean;
          push_replies?: boolean;
          label_id?: string | null;
          portal_id?: string | null;
          pull_cursor?: number | null;
          push_cursor?: string;
          next_sync_at?: string;
          lease_until?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_credentials: {
        Row: {
          organization_id: string;
          provider: "hubspot";
          ciphertext: string;
          key_hint: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          provider: "hubspot";
          ciphertext: string;
          key_hint: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          provider?: "hubspot";
          ciphertext?: string;
          key_hint?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_contact_links: {
        Row: {
          organization_id: string;
          provider: "hubspot";
          contact_id: string;
          external_id: string;
          synced_at: string;
        };
        Insert: {
          organization_id: string;
          provider: "hubspot";
          contact_id: string;
          external_id: string;
          synced_at?: string;
        };
        Update: {
          organization_id?: string;
          provider?: "hubspot";
          contact_id?: string;
          external_id?: string;
          synced_at?: string;
        };
        Relationships: [];
      };
      org_branding: {
        Row: {
          organization_id: string;
          brand_name: string;
          logo_url: string | null;
          support_url: string | null;
          privacy_url: string | null;
          terms_url: string | null;
          accent_color: string;
          hide_powered_by: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          brand_name: string;
          logo_url?: string | null;
          support_url?: string | null;
          privacy_url?: string | null;
          terms_url?: string | null;
          accent_color?: string;
          hide_powered_by?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          brand_name?: string;
          logo_url?: string | null;
          support_url?: string | null;
          privacy_url?: string | null;
          terms_url?: string | null;
          accent_color?: string;
          hide_powered_by?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agency_attach_invites: {
        Row: {
          id: string;
          organization_id: string;
          token_hash: string;
          created_by: string | null;
          expires_at: string;
          accepted_org: string | null;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          token_hash: string;
          created_by?: string | null;
          expires_at: string;
          accepted_org?: string | null;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          token_hash?: string;
          created_by?: string | null;
          expires_at?: string;
          accepted_org?: string | null;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agency_pools: {
        Row: {
          organization_id: string;
          monthly_send_pool: number | null;
          monthly_ai_pool: number | null;
          share_ai_key: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          monthly_send_pool?: number | null;
          monthly_ai_pool?: number | null;
          share_ai_key?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          monthly_send_pool?: number | null;
          monthly_ai_pool?: number | null;
          share_ai_key?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agency_client_caps: {
        Row: {
          organization_id: string;
          agency_id: string;
          monthly_send_cap: number | null;
          monthly_ai_cap: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          agency_id: string;
          monthly_send_cap?: number | null;
          monthly_ai_cap?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          agency_id?: string;
          monthly_send_cap?: number | null;
          monthly_ai_cap?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_push_skips: {
        Row: {
          organization_id: string;
          provider: "hubspot";
          message_id: string;
          skipped_at: string;
          attempts: number;
          retry_requested: boolean;
        };
        Insert: {
          organization_id: string;
          provider: "hubspot";
          message_id: string;
          skipped_at?: string;
          attempts?: number;
          retry_requested?: boolean;
        };
        Update: {
          organization_id?: string;
          provider?: "hubspot";
          message_id?: string;
          skipped_at?: string;
          attempts?: number;
          retry_requested?: boolean;
        };
        Relationships: [];
      };
      forms: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          published: boolean;
          title: string;
          intro: string;
          submit_label: string;
          success_message: string;
          consent_text: string | null;
          fields: Json;
          accent_color: string;
          layout: "card" | "plain";
          label_id: string | null;
          campaign_id: string | null;
          daily_limit: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug?: string;
          published?: boolean;
          title?: string;
          intro?: string;
          submit_label?: string;
          success_message?: string;
          consent_text?: string | null;
          fields?: Json;
          accent_color?: string;
          layout?: "card" | "plain";
          label_id?: string | null;
          campaign_id?: string | null;
          daily_limit?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          slug?: string;
          published?: boolean;
          title?: string;
          intro?: string;
          submit_label?: string;
          success_message?: string;
          consent_text?: string | null;
          fields?: Json;
          accent_color?: string;
          layout?: "card" | "plain";
          label_id?: string | null;
          campaign_id?: string | null;
          daily_limit?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      form_submissions: {
        Row: {
          id: string;
          organization_id: string;
          form_id: string;
          contact_id: string;
          answers: Json;
          consented: boolean;
          enrolled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          form_id: string;
          contact_id: string;
          answers: Json;
          consented?: boolean;
          enrolled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          form_id?: string;
          contact_id?: string;
          answers?: Json;
          consented?: boolean;
          enrolled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      form_rate_buckets: {
        Row: {
          organization_id: string;
          form_id: string;
          bucket: string;
          window_start: string;
          hits: number;
        };
        Insert: {
          organization_id: string;
          form_id: string;
          bucket: string;
          window_start: string;
          hits?: number;
        };
        Update: {
          organization_id?: string;
          form_id?: string;
          bucket?: string;
          window_start?: string;
          hits?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { token: string }; Returns: string };
      claim_due_enrollments: {
        Args: { batch: number };
        Returns: Database["public"]["Tables"]["campaign_contacts"]["Row"][];
      };
      claim_due_mailbox_syncs: {
        Args: { batch: number; p_org?: string | null };
        Returns: Database["public"]["Tables"]["mailbox_sync_state"]["Row"][];
      };
      stop_enrollments_on_reply: { Args: { p_org: string; p_contact: string; p_campaign?: string | null }; Returns: number };
      refresh_sync_hotness: { Args: Record<string, never>; Returns: undefined };
      record_tracking_event: {
        Args: { p_message: string; p_type: string; p_url: string | null; p_counted: boolean; p_reason: string | null; p_ua: string | null };
        Returns: boolean;
      };
      campaign_engagement: {
        Args: { p_campaign: string };
        Returns: { sent: number; opened: number; clicked: number; replied: number; bounced: number }[];
      };
      campaign_message_stats: {
        Args: { p_campaign: string };
        Returns: {
          step_id: string | null;
          variant_id: string | null;
          mailbox_id: string | null;
          sent: number;
          opened: number;
          clicked: number;
          replied: number;
          bounced: number;
        }[];
      };
      campaign_blocked_enrollments: {
        Args: { p_campaign: string };
        Returns: { contact_id: string; email: string; reason: string; total: number }[];
      };
      campaign_missing_merge_fields: {
        Args: { p_campaign: string; p_fields: string[] };
        Returns: { contact_id: string; email: string; missing: string[]; total: number }[];
      };
      refresh_mailbox_health: { Args: Record<string, never>; Returns: number };
      claim_due_warmup_jobs: {
        Args: { batch: number };
        Returns: Database["public"]["Tables"]["warmup_jobs"]["Row"][];
      };
      plan_warmup_jobs: { Args: { p_now?: string }; Returns: number };
      purge_old_events: { Args: Record<string, never>; Returns: number };
      count_sent_today: { Args: { p_mailbox: string }; Returns: number };
      create_invitation: {
        Args: { org: string; invitee_email: string; invitee_role: Database["public"]["Enums"]["member_role"] };
        Returns: string;
      };
      create_organization: { Args: { org_name: string }; Returns: string };
      enroll_contacts: { Args: { p_campaign: string; p_contact_ids: string[] }; Returns: number };
      has_org_role: {
        Args: { org: string; roles: Database["public"]["Enums"]["member_role"][] };
        Returns: boolean;
      };
      is_org_member: { Args: { org: string }; Returns: boolean };
      is_display_name: { Args: { p: string }; Returns: boolean };
      reserve_ai_call: {
        Args: { p_org: string; p_source: "workspace" | "instance" | "agency"; p_instance_limit: number };
        Returns: boolean;
      };
      record_ai_tokens: {
        Args: { p_org: string; p_source: "workspace" | "instance" | "agency"; p_prompt: number; p_completion: number };
        Returns: undefined;
      };
      claim_reply_classifications: {
        Args: { batch: number };
        Returns: Database["public"]["Tables"]["reply_intents"]["Row"][];
      };
      claim_due_crm_syncs: {
        Args: { batch: number; p_org?: string };
        Returns: Database["public"]["Tables"]["crm_connections"]["Row"][];
      };
      submit_form: {
        Args: { p_form: string; p_bucket: string; p_contact: Json; p_answers: Json; p_consented: boolean };
        Returns: string;
      };
      my_workspaces: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          role: Database["public"]["Enums"]["member_role"];
          is_agency: boolean;
          agency_id: string | null;
          via_agency: boolean;
        }[];
      };
      set_agency_mode: { Args: { p_org: string; p_on: boolean }; Returns: undefined };
      create_client_workspace: { Args: { p_agency: string; p_name: string }; Returns: string };
      detach_client_workspace: { Args: { p_client: string }; Returns: undefined };
      agency_clients: {
        Args: { p_agency: string };
        Returns: {
          id: string;
          name: string;
          created_at: string;
          contacts: number;
          active_campaigns: number;
          sent_7d: number;
          unread_threads: number;
          direct_owners: number;
        }[];
      };
      workspace_agency: { Args: { p_org: string }; Returns: { agency_id: string; agency_name: string }[] };
      workspace_branding: { Args: { p_org: string }; Returns: Database["public"]["Tables"]["org_branding"]["Row"][] };
      create_agency_attach_invite: { Args: { p_agency: string }; Returns: string };
      agency_attach_preview: { Args: { p_token: string }; Returns: { agency_id: string; agency_name: string; expires_at: string }[] };
      accept_agency_attach: { Args: { p_token: string; p_org: string }; Returns: string };
      send_pool_state: { Args: { p_org: string }; Returns: { agency_id: string; pool_left: number | null; cap_left: number | null }[] };
      workspace_pool_usage: {
        Args: { p_org: string };
        Returns: {
          agency_id: string;
          monthly_send_cap: number | null;
          sent_this_month: number;
          send_pool_reached: boolean;
          monthly_ai_cap: number | null;
          ai_calls_this_month: number;
          ai_pool_reached: boolean;
          agency_key_available: boolean;
        }[];
      };
      agency_pool_usage: {
        Args: { p_agency: string };
        Returns: { organization_id: string; sent_this_month: number; ai_calls_this_month: number }[];
      };
    };
    Enums: {
      member_role: "owner" | "admin" | "member";
      mailbox_status: "active" | "paused" | "disconnected";
      campaign_status: "draft" | "active" | "paused" | "completed";
      step_type: "email" | "wait";
      enrollment_status: "active" | "completed" | "stopped" | "failed";
      message_status: "queued" | "sent" | "failed" | "skipped";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
