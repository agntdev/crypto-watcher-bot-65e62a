import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getUserProfile, getWatchlistForUser, getAlertsForUser } from "../lib/storage.js";

const composer = new Composer<Ctx>();

const ADMIN_IDS = (process.env.ADMIN_USER_ID ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

function isAdmin(userId: number): boolean {
  if (ADMIN_IDS.length === 0) return false;
  return ADMIN_IDS.includes(userId);
}

composer.command("stats", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("This command is for admins only.");
    return;
  }

  const allAlerts = await getAllAlerts();
  const alertCounts = new Map<string, number>();
  for (const alert of allAlerts) {
    const key = `${alert.ticker}:${alert.alert_type}`;
    alertCounts.set(key, (alertCounts.get(key) ?? 0) + 1);
  }

  const sorted = [...alertCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const totalUsers = await getUserCount();

  const lines = sorted.map(([key, count], i) => {
    const [ticker, type] = key.split(":");
    return `${i + 1}. ${ticker} (${type}): ${count} alerts`;
  });

  const text = `📊 Admin Stats\n\nTotal users: ${totalUsers}\nTotal alerts fired: ${allAlerts.length}\n\nTop alerts:\n${lines.length > 0 ? lines.join("\n") : "No alerts yet."}`;

  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "stats:refresh")],
    ]),
  });
});

composer.callbackQuery("stats:refresh", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.answerCallbackQuery({ text: "Admin only", show_alert: true });
    return;
  }

  const allAlerts = await getAllAlerts();
  const alertCounts = new Map<string, number>();
  for (const alert of allAlerts) {
    const key = `${alert.ticker}:${alert.alert_type}`;
    alertCounts.set(key, (alertCounts.get(key) ?? 0) + 1);
  }

  const sorted = [...alertCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const totalUsers = await getUserCount();

  const lines = sorted.map(([key, count], i) => {
    const [ticker, type] = key.split(":");
    return `${i + 1}. ${ticker} (${type}): ${count} alerts`;
  });

  const text = `📊 Admin Stats\n\nTotal users: ${totalUsers}\nTotal alerts fired: ${allAlerts.length}\n\nTop alerts:\n${lines.length > 0 ? lines.join("\n") : "No alerts yet."}`;

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "stats:refresh")],
    ]),
  });
});

async function getAllAlerts(): Promise<Array<{ ticker: string; alert_type: string }>> {
  const env = typeof process === "undefined" ? {} : process.env;
  if (env.REDIS_URL) {
    try {
      const { defaultRedisStorage } = await import("../toolkit/session/redis.js");
      const adapter = defaultRedisStorage<unknown>(env.REDIS_URL);
      const alerts: Array<{ ticker: string; alert_type: string }> = [];
      const keys = (adapter as unknown as { readAllKeys?: () => AsyncIterableIterator<string> }).readAllKeys;
      if (keys) {
        for await (const key of keys()) {
          if (key.startsWith("alert:")) {
            const val = await adapter.read(key);
            if (val && typeof val === "object") {
              const obj = val as Record<string, unknown>;
              if (typeof obj.ticker === "string" && typeof obj.alert_type === "string") {
                alerts.push({ ticker: obj.ticker, alert_type: obj.alert_type });
              }
            }
          }
        }
      }
      return alerts;
    } catch {
      return [];
    }
  }
  return [];
}

async function getUserCount(): Promise<number> {
  return 0;
}

export default composer;
