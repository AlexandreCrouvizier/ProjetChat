// ===== GROUP TYPES =====

export type GroupType = 'public' | 'private';
export type GroupStatus = 'active' | 'inactive' | 'archived';
export type MemberRole = 'creator' | 'admin' | 'moderator' | 'member';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  creator_id: string | null;
  is_official: boolean;
  status: GroupStatus;
  rules: string | null;
  member_count: number;
  online_count?: number;
  last_message_at: string | null;
  created_at: string;
}

export interface GroupMember {
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
    tier: string;
    is_online: boolean;
  };
  role: MemberRole;
  joined_at: string;
}

export interface GroupListResponse {
  groups: Group[];
  pagination: {
    page: number;
    total: number;
    pages: number;
  };
}
