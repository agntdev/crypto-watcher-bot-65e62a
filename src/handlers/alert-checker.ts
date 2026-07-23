import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getWatchlistForUser, getUserProfile, saveWatchlistItem, addAlert } from "../lib/storage.js";
import type { AlertRecord } from "../lib/storage.js";
import { fetchPrices, formatPrice, formatPercentChange } from "../lib/coingecko.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("alerts:check_now", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Checking prices…" });
  const userId = ctx.from?.id;
  if (!userId) return;
  await checkAlertsForUser(userId, ctx.api);
  await ctx.editMessageText("Price check complete. Alerts sent if thresholds were hit.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Main menu", "menu:main")]]),
  });
});

export function now(): number {
  return Date.now();
}

export async function checkAlertsForUser(userId: number, api: { sendMessage: (chatId: number, text: string, opts?: Record<string, unknown>) => Promise<unknown> }): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) return;

  const currentHour = new Date(now()).getUTCHours();
  const tzOffset = getTimezoneOffset(profile.timezone);
  const localHour = (currentHour + Math.floor(tzOffset) + 24) % 24;

  if (localHour >= profile.quiet_hours_start || localHour < profile.quiet_hours_end) return;

  const items = await getWatchlistForUser(userId);
  const activeItems = items.filter(
    (item) => item.enabled_flag && item.price_threshold_type !== "none",
  );
  if (activeItems.length === 0) return;

  const coinIds = activeItems.map((i) => i.coingecko_id);
  let prices: Record<string, { current_price: number; price_change_percentage_24h: number }>;
  try {
    prices = await fetchPrices(coinIds);
  } catch {
    return;
  }

  const currentTime = now();

  for (const item of activeItems) {
    const priceData = prices[item.coingecko_id];
    if (!priceData) continue;

    const currentPrice = priceData.current_price;
    const timeSinceLastAlert = currentTime - item.last_alert_time;
    if (timeSinceLastAlert < profile.alert_cooldown_length * 1000) continue;

    let triggered = false;
    let alertType = "";

    if (item.price_threshold_type === "above" && item.target_price && currentPrice >= item.target_price) {
      triggered = true;
      alertType = "threshold";
    } else if (item.price_threshold_type === "below" && item.target_price && currentPrice <= item.target_price) {
      triggered = true;
      alertType = "threshold";
    } else if (item.price_threshold_type === "percent" && item.percent_alert_value && item.last_alert_price) {
      const pctChange = Math.abs(((currentPrice - item.last_alert_price) / item.last_alert_price) * 100);
      if (pctChange >= item.percent_alert_value) {
        triggered = true;
        alertType = "percent";
      }
    }

    if (triggered) {
      const oldPrice = item.last_alert_price ?? currentPrice;
      const pctChange = oldPrice > 0 ? ((currentPrice - oldPrice) / oldPrice) * 100 : 0;

      let message: string;
      if (alertType === "threshold") {
        const direction = item.price_threshold_type === "above" ? "risen above" : "dropped below";
        message = `🔔 ${item.friendly_name} (${item.ticker}) has ${direction} ${formatPrice(item.target_price!)}!\n\nCurrent price: ${formatPrice(currentPrice)} ${formatPercentChange(priceData.price_change_percentage_24h)}`;
      } else {
        message = `🔔 ${item.friendly_name} (${item.ticker}) moved ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%!\n\nPrevious: ${formatPrice(oldPrice)}\nCurrent: ${formatPrice(currentPrice)} ${formatPercentChange(priceData.price_change_percentage_24h)}`;
      }

      try {
        await api.sendMessage(userId, message);
      } catch {
        // User may have blocked the bot — skip silently
      }

      const alertRecord: AlertRecord = {
        id: `alert:${userId}:${currentTime}`,
        user_id: userId,
        ticker: item.ticker,
        coingecko_id: item.coingecko_id,
        alert_type: alertType,
        old_price: oldPrice,
        new_price: currentPrice,
        percent_change: pctChange,
        timestamp: currentTime,
      };
      await addAlert(userId, alertRecord);

      item.last_alert_time = currentTime;
      item.last_alert_price = currentPrice;
      await saveWatchlistItem(item);
    }
  }
}

function getTimezoneOffset(tz: string): number {
  const offsets: Record<string, number> = {
    "UTC": 0,
    "America/New_York": -5,
    "America/Chicago": -6,
    "America/Los_Angeles": -8,
    "Europe/London": 0,
    "Europe/Berlin": 1,
    "Europe/Moscow": 3,
    "Asia/Kolkata": 5.5,
    "Asia/Singapore": 8,
    "Asia/Tokyo": 9,
    "Australia/Sydney": 11,
  };
  return offsets[tz] ?? 0;
}

export default composer;
