// Hand-written to match supabase/migrations. Regenerate with `supabase gen types typescript` when a database is available.
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
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
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
