import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getUserProfile, saveUserProfile, createDefaultProfile } from "../lib/storage.js";

registerMainMenuItem({ label: "💰 Price", data: "price:menu", order: 10 });
registerMainMenuItem({ label: "📋 Watchlist", data: "watchlist:menu", order: 20 });
registerMainMenuItem({ label: "🔔 Alerts", data: "alerts:menu", order: 30 });
registerMainMenuItem({ label: "📊 Summary", data: "summary:menu", order: 40 });

const WELCOME = "👋 Welcome! Tap a button below to get started.";

const TIMEZONES = [
  { label: "🇺🇸 New York (UTC-5)", data: "tz:America/New_York", offset: -5 },
  { label: "🇺🇸 Chicago (UTC-6)", data: "tz:America/Chicago", offset: -6 },
  { label: "🇺🇸 Los Angeles (UTC-8)", data: "tz:America/Los_Angeles", offset: -8 },
  { label: "🇬🇧 London (UTC+0)", data: "tz:Europe/London", offset: 0 },
  { label: "🇩🇪 Berlin (UTC+1)", data: "tz:Europe/Berlin", offset: 1 },
  { label: "🇷🇺 Moscow (UTC+3)", data: "tz:Europe/Moscow", offset: 3 },
  { label: "🇮🇳 Mumbai (UTC+5:30)", data: "tz:Asia/Kolkata", offset: 5.5 },
  { label: "🇸🇬 Singapore (UTC+8)", data: "tz:Asia/Singapore", offset: 8 },
  { label: "🇯🇵 Tokyo (UTC+9)", data: "tz:Asia/Tokyo", offset: 9 },
  { label: "🇦🇺 Sydney (UTC+11)", data: "tz:Australia/Sydney", offset: 11 },
  { label: "🌍 UTC", data: "tz:UTC", offset: 0 },
];

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let profile = await getUserProfile(userId);
  if (!profile) {
    profile = createDefaultProfile(userId);
    await saveUserProfile(userId, profile);
  }

  if (!profile.onboarding_complete) {
    const tzKeyboard = inlineKeyboard(
      TIMEZONES.map((tz) => [inlineButton(tz.label, tz.data)]),
    );
    await ctx.reply(
      "Welcome to Crypto Watcher! I'll help you track crypto prices and get alerts.\n\nFirst, pick your timezone so alerts arrive at the right time:",
      { reply_markup: tzKeyboard },
    );
    return;
  }

  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const tz = ctx.match[1];
  let profile = await getUserProfile(userId);
  if (!profile) {
    profile = createDefaultProfile(userId);
  }
  profile.timezone = tz;
  profile.onboarding_complete = true;
  await saveUserProfile(userId, profile);

  const watchlistHint = await getUserProfile(userId).then((p) => {
    const ids = (p as unknown as Record<string, unknown>)?.watchlist_ids;
    return Array.isArray(ids) && ids.length > 0;
  });

  if (watchlistHint) {
    await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
  } else {
    await ctx.editMessageText(
      "All set! Now add some coins to your watchlist.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add common coins", "watchlist:add_common")],
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
  }
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("price:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const { getWatchlistForUser } = await import("../lib/storage.js");
  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty. Add coins first to check prices.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add_common")],
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
    return;
  }
  const buttons = items.map((item) => [
    inlineButton(`${item.friendly_name} (${item.ticker})`, `price:check:${item.coingecko_id}`),
  ]);
  buttons.push([inlineButton("🔄 Check all", "price:check_all")]);
  buttons.push([inlineButton("⬅️ Main menu", "menu:main")]);
  await ctx.editMessageText("Pick a coin to check its current price:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery("watchlist:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const { getWatchlistForUser } = await import("../lib/storage.js");
  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty — no coins tracked yet.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add_common")],
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
    return;
  }
  const lines = items.map((item) => `• ${item.friendly_name} (${item.ticker.toUpperCase()})`);
  const buttons = items.map((item) => [
    inlineButton(`❌ ${item.ticker.toUpperCase()}`, `watchlist:remove:${item.id}`),
  ]);
  buttons.push([inlineButton("➕ Add more", "watchlist:add_common")]);
  buttons.push([inlineButton("⬅️ Main menu", "menu:main")]);
  await ctx.editMessageText(
    `Your watchlist:\n${lines.join("\n")}\n\nTap a coin to remove it.`,
    { reply_markup: inlineKeyboard(buttons) },
  );
});

composer.callbackQuery("alerts:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const { getWatchlistForUser } = await import("../lib/storage.js");
  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText(
      "Add coins to your watchlist before setting up alerts.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add_common")],
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
    return;
  }
  const buttons = items.map((item) => [
    inlineButton(`${item.friendly_name} (${item.ticker})`, `alerts:configure:${item.id}`),
  ]);
  buttons.push([inlineButton("⬅️ Main menu", "menu:main")]);
  await ctx.editMessageText("Select a coin to configure its alerts:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery("summary:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const { getUserProfile: getProfile } = await import("../lib/storage.js");
  const profile = await getProfile(userId);
  const enabled = profile?.summary_enabled ?? false;
  const time = profile?.summary_time ?? "08:00";
  const status = enabled ? "✅ On" : "❌ Off";
  await ctx.editMessageText(
    `Daily summary\n\nStatus: ${status}\nDelivery time: ${time} (${profile?.timezone ?? "UTC"})\n\nToggle or set a new time:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(enabled ? "❌ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("🕐 Set time", "summary:set_time")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
