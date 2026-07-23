import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getWatchlistForUser, addToWatchlist, removeFromWatchlist, getUserProfile, saveUserProfile } from "../lib/storage.js";
import { getPopularCoins, fetchPrices, formatPrice } from "../lib/coingecko.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("watchlist:add_common", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const popular = getPopularCoins();
  const existing = await getWatchlistForUser(userId);
  const existingIds = new Set(existing.map((i) => i.coingecko_id));

  const available = popular.filter((c) => !existingIds.has(c.id));

  if (available.length === 0) {
    await ctx.editMessageText(
      "You already have all the popular coins on your watchlist.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const buttons = available.map((coin) => [
    inlineButton(`${coin.name} (${coin.symbol.toUpperCase()})`, `watchlist:add:${coin.id}:${coin.symbol}:${encodeURIComponent(coin.name)}`),
  ]);
  buttons.push([inlineButton("✅ Done", "watchlist:done")]);
  buttons.push([inlineButton("⬅️ Main menu", "menu:main")]);

  await ctx.editMessageText(
    "Pick coins to add to your watchlist:",
    { reply_markup: inlineKeyboard(buttons) },
  );
});

composer.callbackQuery(/^watchlist:add:([^:]+):([^:]+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Added!" });
  const userId = ctx.from?.id;
  if (!userId) return;

  const coinId = ctx.match[1];
  const symbol = ctx.match[2].toUpperCase();
  const name = decodeURIComponent(ctx.match[3]);

  const existing = await getWatchlistForUser(userId);
  if (existing.some((i) => i.coingecko_id === coinId)) {
    return;
  }

  let prices: Record<string, { current_price: number }> = {};
  try {
    prices = await fetchPrices([coinId]);
  } catch {
    // proceed without price
  }

  const item = {
    id: `${userId}:${coinId}`,
    user_id: userId,
    ticker: symbol,
    coingecko_id: coinId,
    friendly_name: name,
    price_threshold_type: "none",
    target_price: null,
    percent_alert_value: null,
    alert_window_minutes: 60,
    enabled_flag: true,
    last_alert_time: 0,
    last_alert_price: prices[coinId]?.current_price ?? null,
  };

  await addToWatchlist(userId, item);

  const remaining = getPopularCoins().filter(
    (c) => c.id !== coinId && !existing.some((i) => i.coingecko_id === c.id) && !existing.some((i) => i.coingecko_id === c.id),
  );

  if (remaining.length > 0) {
    const buttons = remaining.map((coin) => [
      inlineButton(`${coin.name} (${coin.symbol.toUpperCase()})`, `watchlist:add:${coin.id}:${coin.symbol}:${encodeURIComponent(coin.name)}`),
    ]);
    buttons.push([inlineButton("✅ Done", "watchlist:done")]);
    await ctx.editMessageText(`${name} added! Pick more coins or tap Done.`, {
      reply_markup: inlineKeyboard(buttons),
    });
  } else {
    await ctx.editMessageText(`${name} added! All popular coins are on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    });
  }
});

composer.callbackQuery("watchlist:done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText("Your watchlist is empty.", {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add coins", "watchlist:add_common")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    });
    return;
  }
  const lines = items.map((item) => `• ${item.friendly_name} (${item.ticker})`);
  await ctx.editMessageText(
    `Your watchlist:\n${lines.join("\n")}\n\nTap /price to check prices.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add more", "watchlist:add_common")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^watchlist:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Removed" });
  const userId = ctx.from?.id;
  if (!userId) return;
  const itemId = ctx.match[1];
  await removeFromWatchlist(userId, itemId);

  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText(
      "Watchlist is now empty.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add_common")],
          [inlineButton("⬅️ Main menu", "menu:main")],
        ]),
      },
    );
    return;
  }
  const lines = items.map((item) => `• ${item.friendly_name} (${item.ticker})`);
  const buttons = items.map((item) => [
    inlineButton(`❌ ${item.ticker.toUpperCase()}`, `watchlist:remove:${item.id}`),
  ]);
  buttons.push([inlineButton("➕ Add more", "watchlist:add_common")]);
  buttons.push([inlineButton("⬅️ Main menu", "menu:main")]);
  await ctx.editMessageText(
    `Removed. Your watchlist:\n${lines.join("\n")}`,
    { reply_markup: inlineKeyboard(buttons) },
  );
});

export default composer;
