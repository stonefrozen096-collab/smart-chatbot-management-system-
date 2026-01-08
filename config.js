/**
 * Centralized Configuration & Constants
 * Smart Chatbot Management System
 * 
 * This file contains all system-wide constants, feature flags,
 * and configuration settings for consistent behavior across
 * frontend and backend.
 */

// API Base URL (dynamic based on environment)
const API_BASE_URL = window.location.origin;

// Feature Flags - Default States
const DEFAULT_FEATURES = {
  shop: true,
  cosmetics: true,
  redeemCodes: true,
  appeals: true,
  dailyRewards: true,
  chat: true,
  petDisplay: true,
  achievements: true
};

// Role-based Access Control
const ROLES = {
  STUDENT: 'student',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  MODERATOR: 'moderator',
  TEACHER: 'teacher'
};

// Role Hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  [ROLES.STUDENT]: 1,
  [ROLES.TEACHER]: 2,
  [ROLES.MODERATOR]: 3,
  [ROLES.ADMIN]: 4,
  [ROLES.SUPER_ADMIN]: 5
};

// Feature Access Map (which roles can access which features)
const FEATURE_ACCESS = {
  shop: [ROLES.STUDENT],
  cosmetics: [ROLES.STUDENT],
  redeemCodes: [ROLES.STUDENT],
  appeals: [ROLES.STUDENT],
  dailyRewards: [ROLES.STUDENT],
  chat: [ROLES.STUDENT, ROLES.TEACHER, ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  petDisplay: [ROLES.STUDENT],
  achievements: [ROLES.STUDENT],
  userManagement: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  systemSettings: [ROLES.SUPER_ADMIN],
  contentModeration: [ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  courseManagement: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN]
};

// UI Messages
const MESSAGES = {
  FEATURE_DISABLED: 'This feature has been disabled by administrators.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to access this feature.',
  ACCOUNT_LOCKED: 'Your account is currently locked. Please contact administration.',
  CHATBOT_LOCKED: 'Chatbot access is currently restricted for your account.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.'
};

// System Limits
const LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_AVATAR_SIZE: 2 * 1024 * 1024, // 2MB
  MAX_MESSAGE_LENGTH: 5000,
  MAX_CHAT_HISTORY: 100,
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  CSRF_REFRESH_INTERVAL: 30 * 60 * 1000 // 30 minutes
};

// HC Shop Prices (Cosmetic tiers)
const TIER_PRICES = {
  rare: 1000,
  legendary: 5000,
  eternal: 15000,
  mythic: 50000,
  transcendent: 150000,
  supreme: 500000,
  ascended: 2000000
};

// Daily Reward Progression
const DAILY_REWARDS = [
  { day: 1, hc: 50, label: 'Day 1' },
  { day: 2, hc: 75, label: 'Day 2' },
  { day: 3, hc: 100, label: 'Day 3' },
  { day: 4, hc: 150, label: 'Day 4' },
  { day: 5, hc: 200, label: 'Day 5' },
  { day: 6, hc: 300, label: 'Day 6' },
  { day: 7, hc: 500, label: 'Day 7 Bonus!' }
];

// Achievement Definitions
const ACHIEVEMENTS = {
  FIRST_CHAT: { id: 'first_chat', name: 'First Question', icon: '💬', hc: 50 },
  CHAT_10: { id: 'chat_10', name: 'Curious Mind', icon: '🧠', hc: 100 },
  CHAT_50: { id: 'chat_50', name: 'Knowledge Seeker', icon: '📚', hc: 250 },
  CHAT_100: { id: 'chat_100', name: 'Scholar', icon: '🎓', hc: 500 },
  DAILY_STREAK_7: { id: 'daily_streak_7', name: 'Week Warrior', icon: '🔥', hc: 300 },
  FIRST_COSMETIC: { id: 'first_cosmetic', name: 'Style Icon', icon: '✨', hc: 100 },
  PROFILE_COMPLETE: { id: 'profile_complete', name: 'All Set', icon: '✅', hc: 200 }
};

// Cosmetic Tier Colors (for UI display)
const TIER_COLORS = {
  rare: '#60a5fa',
  legendary: '#fbbf24',
  eternal: '#a78bfa',
  mythic: '#22d3ee',
  transcendent: '#f472b6',
  supreme: '#fb923c',
  ascended: '#c084fc'
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_BASE_URL,
    DEFAULT_FEATURES,
    ROLES,
    ROLE_HIERARCHY,
    FEATURE_ACCESS,
    MESSAGES,
    LIMITS,
    TIER_PRICES,
    DAILY_REWARDS,
    ACHIEVEMENTS,
    TIER_COLORS
  };
}
