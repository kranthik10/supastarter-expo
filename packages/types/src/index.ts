export type PlanId = 'free' | 'pro' | 'enterprise';
export type MemberRole = 'owner' | 'admin' | 'member';
export type Permission =
  | 'organization.read'
  | 'organization.update'
  | 'organization.delete'
  | 'members.read'
  | 'members.invite'
  | 'members.remove'
  | 'members.update'
  | 'billing.read'
  | 'billing.manage'
  | 'files.write'
  | 'files.delete';

export type User = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: Member[];
};

export type Member = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: MemberRole;
  joinedAt: string;
};

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  seats: number;
  highlight?: boolean;
};