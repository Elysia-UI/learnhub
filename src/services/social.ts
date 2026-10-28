import type { User } from '../data/types';

export interface Relationship {
  following: boolean;
  followsYou: boolean;
  isFriend: boolean;
}

export interface SocialSummary extends Relationship {
  followingCount: number;
  followersCount: number;
  friendsCount: number;
}

export interface ConnectionUser extends User {
  relationship: Relationship;
}

export type ConnectionType = 'following' | 'followers' | 'friends';
