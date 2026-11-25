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
          provider: string;
          status: Database['public']['Enums']['mailbox_status'];
          daily_limit: number;
          min_gap_seconds: number;
          signature_plain: string | null;
          signature_html: string | null;
          timezone: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          from_name?: string;
          reply_to?: string | null;
          provider?: string;
          status?: Database['public']['Enums']['mailbox_status'];
          daily_limit?: number;
          min_gap_seconds?: number;
          signature_plain?: string | null;
          signature_html?: string | null;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          from_name?: string;
          reply_to?: string | null;
          provider?: string;
          status?: Database['public']['Enums']['mailbox_status'];
          daily_limit?: number;
          min_gap_seconds?: number;
          signature_plain?: string | null;
          signature_html?: string | null;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
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
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { token: string }; Returns: string };
      claim_due_enrollments: {
        Args: { batch: number };
        Returns: Database["public"]["Tables"]["campaign_contacts"]["Row"][];
      };
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
