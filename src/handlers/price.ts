import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getWatchlistForUser } from "../lib/storage.js";
import { fetchPrices, formatPrice, formatPercentChange, searchCoin } from "../lib/coingecko.js";

const composer = new Composer<Ctx>();

composer.command("price", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text ?? "";
  const args = text.split(/\s+/).slice(1);
  const query = args[0]?.toUpperCase();

  if (!query) {
    const items = await getWatchlistForUser(userId);
    if (items.length === 0) {
      await ctx.reply(
        "Your watchlist is empty. Add coins first, or type /price BTC to check a specific coin.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("➕ Add coins", "watchlist:add_common")],
          ]),
        },
      );
      return;
    }

    const coinIds = items.map((i) => i.coingecko_id);
    try {
      const prices = await fetchPrices(coinIds);
      const lines = items.map((item) => {
        const p = prices[item.coingecko_id];
        if (!p) return `• ${item.friendly_name}: price unavailable`;
        return `• ${item.friendly_name}: ${formatPrice(p.current_price)} ${formatPercentChange(p.price_change_percentage_24h)}`;
      });
      await ctx.reply(`📊 Watchlist prices:\n\n${lines.join("\n")}`);
    } catch {
      await ctx.reply("Couldn't fetch prices right now. Try again in a moment.");
    }
    return;
  }

  try {
    const results = await searchCoin(query);
    if (results.length === 0) {
      await ctx.reply(
        `Couldn't find "${query}". Check the ticker and try again — common ones: BTC, ETH, SOL, TON.`,
      );
      return;
    }

    const match = results.find((c) => c.symbol.toUpperCase() === query) ?? results[0];
    const prices = await fetchPrices([match.id]);
    const p = prices[match.id];
    if (!p) {
      await ctx.reply(`Found ${match.name} but couldn't get its price. Try again shortly.`);
      return;
    }

    await ctx.reply(
      `${p.name} (${p.symbol})\nPrice: ${formatPrice(p.current_price)}\n24h change: ${formatPercentChange(p.price_change_percentage_24h)}`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add to watchlist", `watchlist:add:${match.id}:${match.symbol}:${encodeURIComponent(match.name)}`)],
        ]),
      },
    );
  } catch {
    await ctx.reply("Couldn't reach the price feed. Try again in a moment.");
  }
});

composer.callbackQuery(/^price:check:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const coinId = ctx.match[1];
  try {
    const prices = await fetchPrices([coinId]);
    const p = prices[coinId];
    if (!p) {
      await ctx.editMessageText("Couldn't get the price for this coin. Try again later.");
      return;
    }
    await ctx.editMessageText(
      `${p.name} (${p.symbol})\nPrice: ${formatPrice(p.current_price)}\n24h change: ${formatPercentChange(p.price_change_percentage_24h)}`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to prices", "price:menu")],
        ]),
      },
    );
  } catch {
    await ctx.editMessageText("Price feed unavailable. Try again shortly.");
  }
});

composer.callbackQuery("price:check_all", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const items = await getWatchlistForUser(userId);
  if (items.length === 0) {
    await ctx.editMessageText("Your watchlist is empty.");
    return;
  }
  try {
    const coinIds = items.map((i) => i.coingecko_id);
    const prices = await fetchPrices(coinIds);
    const lines = items.map((item) => {
      const p = prices[item.coingecko_id];
      if (!p) return `• ${item.friendly_name}: unavailable`;
      return `• ${item.friendly_name}: ${formatPrice(p.current_price)} ${formatPercentChange(p.price_change_percentage_24h)}`;
    });
    await ctx.editMessageText(`📊 All prices:\n\n${lines.join("\n")}`, {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "price:check_all")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    });
  } catch {
    await ctx.editMessageText("Couldn't fetch prices. Try again shortly.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    });
  }
});

export default composer;
