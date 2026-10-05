// Gerado via mcp_supabase.generate_typescript_types (projeto "CRM", sfllpogpuqukhjddwiel).
// Não editar à mão — regenerar após qualquer migration truco_*.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      truco_audit_log: {
        Row: {
          action: string;
          created_at: string;
          entity: string;
          entity_id: string | null;
          metadata: Json;
          truco_actor_id: string | null;
          truco_championship_id: string | null;
          truco_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          metadata?: Json;
          truco_actor_id?: string | null;
          truco_championship_id?: string | null;
          truco_id?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          metadata?: Json;
          truco_actor_id?: string | null;
          truco_championship_id?: string | null;
          truco_id?: string;
        };
        Relationships: [];
      };
      truco_bracket_matches: {
        Row: {
          created_at: string;
          label: string;
          match_order: number;
          round: Database["public"]["Enums"]["truco_bracket_round"];
          slot_a_source_id: string | null;
          slot_a_team_id: string | null;
          slot_a_type: Database["public"]["Enums"]["truco_bracket_slot_type"];
          slot_b_source_id: string | null;
          slot_b_team_id: string | null;
          slot_b_type: Database["public"]["Enums"]["truco_bracket_slot_type"];
          truco_championship_id: string;
          truco_id: string;
          truco_match_id: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_bracket_matches"]["Row"]> & {
          label: string;
          round: Database["public"]["Enums"]["truco_bracket_round"];
          slot_a_type: Database["public"]["Enums"]["truco_bracket_slot_type"];
          slot_b_type: Database["public"]["Enums"]["truco_bracket_slot_type"];
          truco_championship_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_bracket_matches"]["Row"]>;
        Relationships: [];
      };
      truco_championships: {
        Row: {
          created_at: string;
          current_phase: string;
          draw_status: Database["public"]["Enums"]["truco_draw_status"];
          edition: number;
          name: string;
          status: Database["public"]["Enums"]["truco_championship_status"];
          truco_id: string;
          updated_at: string;
          year: number;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_championships"]["Row"]> & {
          edition: number;
          name: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["truco_championships"]["Row"]>;
        Relationships: [];
      };
      truco_groups: {
        Row: {
          created_at: string;
          label: string;
          name: string;
          truco_championship_id: string;
          truco_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_groups"]["Row"]> & {
          label: string;
          name: string;
          truco_championship_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_groups"]["Row"]>;
        Relationships: [];
      };
      truco_history: {
        Row: {
          champion_team_id: string | null;
          created_at: string;
          edition: number;
          final_result: string | null;
          name: string;
          notes: string;
          runner_up_team_id: string | null;
          truco_championship_id: string;
          truco_id: string;
          year: number;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_history"]["Row"]> & {
          edition: number;
          name: string;
          truco_championship_id: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["truco_history"]["Row"]>;
        Relationships: [];
      };
      truco_matches: {
        Row: {
          block_number: number | null;
          created_at: string;
          match_order: number;
          queue_position: number | null;
          round: string;
          sets_a: number | null;
          sets_b: number | null;
          stage: Database["public"]["Enums"]["truco_match_stage"];
          status: Database["public"]["Enums"]["truco_match_status"];
          table_number: number | null;
          truco_championship_id: string;
          truco_group_id: string | null;
          truco_id: string;
          truco_team_a_id: string;
          truco_team_b_id: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_matches"]["Row"]> & {
          round: string;
          stage: Database["public"]["Enums"]["truco_match_stage"];
          truco_championship_id: string;
          truco_team_a_id: string;
          truco_team_b_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_matches"]["Row"]>;
        Relationships: [];
      };
      truco_players: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          name: string;
          nickname: string | null;
          truco_id: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_players"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["truco_players"]["Row"]>;
        Relationships: [];
      };
      truco_profiles: {
        Row: {
          created_at: string;
          email: string;
          must_change_password: boolean;
          role: Database["public"]["Enums"]["truco_user_role"];
          truco_id: string;
          truco_player_id: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_profiles"]["Row"]> & {
          email: string;
          truco_id: string;
          truco_player_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_profiles"]["Row"]>;
        Relationships: [];
      };
      truco_standings_overrides: {
        Row: {
          created_at: string;
          criterion: string;
          reason: string | null;
          resolved_position: number;
          resolved_team_id: string;
          tied_team_ids: string[];
          truco_actor_id: string;
          truco_championship_id: string;
          truco_group_id: string;
          truco_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_standings_overrides"]["Row"]> & {
          criterion: string;
          resolved_position: number;
          resolved_team_id: string;
          tied_team_ids: string[];
          truco_actor_id: string;
          truco_championship_id: string;
          truco_group_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_standings_overrides"]["Row"]>;
        Relationships: [];
      };
      truco_team_members: {
        Row: {
          created_at: string;
          position: number;
          truco_id: string;
          truco_player_id: string;
          truco_team_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_team_members"]["Row"]> & {
          position: number;
          truco_player_id: string;
          truco_team_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_team_members"]["Row"]>;
        Relationships: [];
      };
      truco_team_memberships: {
        Row: {
          created_at: string;
          strength: number;
          truco_championship_id: string;
          truco_group_id: string | null;
          truco_id: string;
          truco_player_1_id: string;
          truco_player_2_id: string;
          truco_team_id: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_team_memberships"]["Row"]> & {
          truco_championship_id: string;
          truco_player_1_id: string;
          truco_player_2_id: string;
          truco_team_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_team_memberships"]["Row"]>;
        Relationships: [];
      };
      truco_teams: {
        Row: {
          created_at: string;
          is_placeholder: boolean;
          name: string;
          seeded: boolean;
          status: Database["public"]["Enums"]["truco_team_status"];
          truco_championship_id: string;
          truco_group_id: string | null;
          truco_id: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["truco_teams"]["Row"]> & {
          name: string;
          truco_championship_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["truco_teams"]["Row"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      truco_rpc_champions_ranking: {
        Args: Record<string, never>;
        Returns: {
          losses: number;
          matches_played: number;
          participations: number;
          player_names: string[];
          runner_ups: number;
          team_key: string;
          team_name: string;
          titles: number;
          win_rate_pct: number;
          wins: number;
        }[];
      };
      truco_rpc_is_admin: { Args: { p_uid: string }; Returns: boolean };
      truco_rpc_is_superadmin: { Args: { p_uid: string }; Returns: boolean };
      truco_rpc_resolve_standings_tie: {
        Args: {
          p_championship_id: string;
          p_criterion: string;
          p_group_id: string;
          p_reason: string;
          p_resolved_position: number;
          p_resolved_team_id: string;
          p_tied_team_ids: string[];
        };
        Returns: string;
      };
      truco_rpc_standings: {
        Args: { p_championship_id: string; p_group_id: string };
        Returns: {
          derrotas: number;
          jogos: number;
          override_applied: boolean;
          pontos: number;
          saldo_sets: number;
          team_id: string;
          team_position: number;
          vitorias: number;
        }[];
      };
    };
    Enums: {
      truco_bracket_round: "oitavas" | "quartas" | "semifinal" | "final";
      truco_bracket_slot_type: "direct" | "winner" | "tbd";
      truco_championship_status: "em_andamento" | "encerrado";
      truco_draw_status: "pendente" | "realizado";
      truco_match_stage: "grupos" | "mata-mata";
      truco_match_status: "pendente" | "realizado";
      truco_team_status: "pendente" | "aprovada";
      truco_user_role: "jogador" | "admin" | "superadmin";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
