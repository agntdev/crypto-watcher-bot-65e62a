import type { StorageAdapter } from "grammy";
import { defaultRedisStorage } from "../toolkit/session/redis.js";

export interface UserProfile {
  telegram_id: number;
  timezone: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
  summary_time: string;
  summary_enabled: boolean;
  alert_cooldown_length: number;
  subscription_status: string;
  onboarding_complete: boolean;
}

export interface WatchlistItem {
  id: string;
  user_id: number;
  ticker: string;
  coingecko_id: string;
  friendly_name: string;
  price_threshold_type: string;
  target_price: number | null;
  percent_alert_value: number | null;
  alert_window_minutes: number;
  enabled_flag: boolean;
  last_alert_time: number;
  last_alert_price: number | null;
}

export interface AlertRecord {
  id: string;
  user_id: number;
  ticker: string;
  coingecko_id: string;
  alert_type: string;
  old_price: number;
  new_price: number;
  percent_change: number;
  timestamp: number;
}

function createMemoryAdapter<T>(): StorageAdapter<T> {
  const store = new Map<string, T>();
  return {
    read: async (key: string) => store.get(key),
    write: async (key: string, value: T) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    has: async (key: string) => store.has(key),
  };
}

function resolveAdapter<T>(prefix: string): StorageAdapter<T> {
  const env = typeof process === "undefined" ? {} : process.env;
  if (env.REDIS_URL) return defaultRedisStorage<T>(env.REDIS_URL);
  return createMemoryAdapter<T>();
}

const profileAdapter = resolveAdapter<UserProfile>("prof:");
const watchlistAdapter = resolveAdapter<WatchlistItem>("wl:");
const alertAdapter = resolveAdapter<AlertRecord>("alert:");

export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  return (await profileAdapter.read(String(userId))) ?? null;
}

export async function saveUserProfile(userId: number, profile: UserProfile): Promise<void> {
  await profileAdapter.write(String(userId), profile);
}

export async function getWatchlistItem(itemId: string): Promise<WatchlistItem | null> {
  return (await watchlistAdapter.read(itemId)) ?? null;
}

export async function saveWatchlistItem(item: WatchlistItem): Promise<void> {
  await watchlistAdapter.write(item.id, item);
}

export async function deleteWatchlistItem(itemId: string): Promise<void> {
  await watchlistAdapter.delete(itemId);
}

export async function getWatchlistForUser(userId: number): Promise<WatchlistItem[]> {
  const profile = await getUserProfile(userId);
  if (!profile) return [];
  const ids = (profile as unknown as Record<string, unknown>).watchlist_ids;
  if (!Array.isArray(ids)) return [];
  const items: WatchlistItem[] = [];
  for (const id of ids) {
    const item = await getWatchlistItem(String(id));
    if (item) items.push(item);
  }
  return items;
}

export async function addToWatchlist(userId: number, item: WatchlistItem): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) return;
  const ids = ((profile as unknown as Record<string, unknown>).watchlist_ids ?? []) as string[];
  if (!ids.includes(item.id)) {
    ids.push(item.id);
    (profile as unknown as Record<string, unknown>).watchlist_ids = ids;
  }
  await saveUserProfile(userId, profile);
  await saveWatchlistItem(item);
}

export async function removeFromWatchlist(userId: number, itemId: string): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) return;
  const ids = ((profile as unknown as Record<string, unknown>).watchlist_ids ?? []) as string[];
  (profile as unknown as Record<string, unknown>).watchlist_ids = ids.filter((id) => id !== itemId);
  await saveUserProfile(userId, profile);
  await deleteWatchlistItem(itemId);
}

export async function saveAlertRecord(alert: AlertRecord): Promise<void> {
  await alertAdapter.write(alert.id, alert);
}

export async function getAlertsForUser(userId: number): Promise<AlertRecord[]> {
  const profile = await getUserProfile(userId);
  if (!profile) return [];
  const ids = (profile as unknown as Record<string, unknown>).alert_ids;
  if (!Array.isArray(ids)) return [];
  const alerts: AlertRecord[] = [];
  for (const id of ids) {
    const alert = await alertAdapter.read(String(id));
    if (alert) alerts.push(alert);
  }
  return alerts;
}

export async function addAlert(userId: number, alert: AlertRecord): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) return;
  const ids = ((profile as unknown as Record<string, unknown>).alert_ids ?? []) as string[];
  if (!ids.includes(alert.id)) {
    ids.push(alert.id);
    (profile as unknown as Record<string, unknown>).alert_ids = ids;
  }
  await saveUserProfile(userId, profile);
  await saveAlertRecord(alert);
}

export async function deleteAlert(alertId: string): Promise<void> {
  await alertAdapter.delete(alertId);
}

export function createDefaultProfile(userId: number): UserProfile {
  return {
    telegram_id: userId,
    timezone: "UTC",
    quiet_hours_start: 23,
    quiet_hours_end: 7,
    summary_time: "08:00",
    summary_enabled: false,
    alert_cooldown_length: 3600,
    subscription_status: "active",
    onboarding_complete: false,
  };
}
