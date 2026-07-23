import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getWatchlistForUser, getUserProfile, saveUserProfile, addAlert, getAlertsForUser, deleteAlert, saveWatchlistItem, getWatchlistItem } from "../lib/storage.js";
import type { AlertRecord, WatchlistItem } from "../lib/storage.js";
import { fetchPrices, formatPrice } from "../lib/coingecko.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("alerts:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

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

composer.callbackQuery(/^alerts:configure:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const itemId = ctx.match[1];
  const item = await getWatchlistItem(itemId);
  if (!item) {
    await ctx.editMessageText("Coin not found on your watchlist.");
    return;
  }

  const thresholdText = item.price_threshold_type === "above"
    ? `Above ${formatPrice(item.target_price ?? 0)}`
    : item.price_threshold_type === "below"
    ? `Below ${formatPrice(item.target_price ?? 0)}`
    : item.percent_alert_value
    ? `${item.percent_alert_value}% move in ${item.alert_window_minutes}min`
    : "Not configured";

  const cooldownProfile = await getUserProfile(userId);
  const cooldownMinutes = Math.round((cooldownProfile?.alert_cooldown_length ?? 3600) / 60);

  await ctx.editMessageText(
    `Alert settings for ${item.friendly_name} (${item.ticker})\n\nCurrent rule: ${thresholdText}\nCooldown: ${cooldownMinutes}min\n\nChoose alert type:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📈 Price above", `alerts:set_type:${itemId}:above`)],
        [inlineButton("📉 Price below", `alerts:set_type:${itemId}:below`)],
        [inlineButton("📊 % Change", `alerts:set_type:${itemId}:percent`)],
        [inlineButton("🗑 Remove alert", `alerts:remove:${itemId}`)],
        [inlineButton("⬅️ Back", "alerts:manage")],
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:set_type:([^:]+):(above|below|percent)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const itemId = ctx.match[1];
  const alertType = ctx.match[2];
  const item = await getWatchlistItem(itemId);
  if (!item) {
    await ctx.editMessageText("Coin not found.");
    return;
  }

  if (alertType === "percent") {
    const buttons = [1, 2, 3, 5, 10, 15, 25].map((pct) => [
      inlineButton(`${pct}%`, `alerts:set_pct:${itemId}:${pct}`),
    ]);
    buttons.push([inlineButton("⬅️ Back", `alerts:configure:${itemId}`)]);
    await ctx.editMessageText(
      `How big a price move should trigger an alert for ${item.friendly_name}?`,
      { reply_markup: inlineKeyboard(buttons) },
    );
    return;
  }

  const label = alertType === "above" ? "above" : "below";
  const buttons = [
    [inlineButton("Type a price…", `alerts:prompt_price:${itemId}:${alertType}`)],
    [inlineButton("⬅️ Back", `alerts:configure:${itemId}`)],
  ];
  await ctx.editMessageText(
    `Send the target price ${label} which to alert you for ${item.friendly_name}.`,
    { reply_markup: inlineKeyboard(buttons) },
  );
});

composer.callbackQuery(/^alerts:set_pct:([^:]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Set!" });
  const userId = ctx.from?.id;
  if (!userId) return;

  const itemId = ctx.match[1];
  const pct = Number(ctx.match[2]);
  const item = await getWatchlistItem(itemId);
  if (!item) return;

  item.price_threshold_type = "percent";
  item.percent_alert_value = pct;
  item.target_price = null;
  item.enabled_flag = true;
  await saveWatchlistItem(item);

  const profile = await getUserProfile(userId);
  const cooldownMinutes = Math.round((profile?.alert_cooldown_length ?? 3600) / 60);

  await ctx.editMessageText(
    `Alert set! You'll be notified when ${item.friendly_name} moves ${pct}% within ${item.alert_window_minutes}min.\nCooldown: ${cooldownMinutes}min between alerts.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Manage alerts", "alerts:manage")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:prompt_price:([^:]+):(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const itemId = ctx.match[1];
  const alertType = ctx.match[2];
  const item = await getWatchlistItem(itemId);
  if (!item) return;

  const session = ctx.session as Record<string, unknown>;
  session.step = "awaiting_alert_price";
  session.flow_data = { item_id: itemId, alert_type: alertType };

  await ctx.editMessageText(
    `Type the target price for ${item.friendly_name} (e.g. 50000):`,
  );
});

composer.on("message:text", async (ctx, next) => {
  const session = ctx.session as Record<string, unknown>;
  if (session.step !== "awaiting_alert_price") return next();

  const flowData = session.flow_data as Record<string, string> | undefined;
  if (!flowData?.item_id || !flowData?.alert_type) {
    session.step = undefined;
    session.flow_data = undefined;
    return next();
  }

  const price = parseFloat(ctx.message.text.replace(/[$,]/g, "").trim());
  if (isNaN(price) || price <= 0) {
    await ctx.reply("Please enter a valid price (e.g. 50000).");
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) return;

  const item = await getWatchlistItem(flowData.item_id);
  if (!item) {
    await ctx.reply("Coin not found on your watchlist.");
    session.step = undefined;
    session.flow_data = undefined;
    return;
  }

  item.price_threshold_type = flowData.alert_type;
  item.target_price = price;
  item.percent_alert_value = null;
  item.enabled_flag = true;
  await saveWatchlistItem(item);

  session.step = undefined;
  session.flow_data = undefined;

  const label = flowData.alert_type === "above" ? "rises above" : "drops below";
  const profile = await getUserProfile(userId);
  const cooldownMinutes = Math.round((profile?.alert_cooldown_length ?? 3600) / 60);

  await ctx.reply(
    `Alert set! You'll be notified when ${item.friendly_name} ${label} ${formatPrice(price)}.\nCooldown: ${cooldownMinutes}min between alerts.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Manage alerts", "alerts:manage")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Alert removed" });
  const userId = ctx.from?.id;
  if (!userId) return;

  const itemId = ctx.match[1];
  const item = await getWatchlistItem(itemId);
  if (!item) return;

  item.price_threshold_type = "none";
  item.target_price = null;
  item.percent_alert_value = null;
  item.enabled_flag = false;
  await saveWatchlistItem(item);

  await ctx.editMessageText(`Alert for ${item.friendly_name} removed.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Manage alerts", "alerts:manage")],
      [inlineButton("⬅️ Main menu", "menu:main")],
    ]),
  });
});

export default composer;
