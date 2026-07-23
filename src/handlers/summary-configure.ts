import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getUserProfile, saveUserProfile } from "../lib/storage.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("summary:configure", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = await getUserProfile(userId);
  if (!profile) {
    await ctx.editMessageText("Set up your profile first with /start.");
    return;
  }

  const enabled = profile.summary_enabled;
  const time = profile.summary_time;
  const status = enabled ? "✅ On" : "❌ Off";

  await ctx.editMessageText(
    `Daily summary\n\nStatus: ${status}\nDelivery time: ${time} (${profile.timezone})\n\nToggle or set a new time:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(enabled ? "❌ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("🕐 Set time", "summary:set_time")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("summary:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = await getUserProfile(userId);
  if (!profile) return;

  profile.summary_enabled = !profile.summary_enabled;
  await saveUserProfile(userId, profile);

  const status = profile.summary_enabled ? "✅ On" : "❌ Off";
  const action = profile.summary_enabled ? "enabled" : "disabled";

  await ctx.editMessageText(
    `Daily summary ${action}.\n\nStatus: ${status}\nDelivery time: ${profile.summary_time} (${profile.timezone})`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(profile.summary_enabled ? "❌ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("🕐 Set time", "summary:set_time")],
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("summary:set_time", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const times = ["06:00", "07:00", "08:00", "09:00", "10:00", "12:00", "18:00", "20:00", "22:00"];
  const buttons = times.map((t) => [inlineButton(t, `summary:time:${t}`)]);
  buttons.push([inlineButton("⬅️ Back", "summary:configure")]);

  await ctx.editMessageText("Pick a delivery time for your daily summary:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^summary:time:(\d{2}:\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Time set" });
  const userId = ctx.from?.id;
  if (!userId) return;

  const time = ctx.match[1];
  const profile = await getUserProfile(userId);
  if (!profile) return;

  profile.summary_time = time;
  profile.summary_enabled = true;
  await saveUserProfile(userId, profile);

  await ctx.editMessageText(
    `Daily summary enabled!\n\nDelivery time: ${time} (${profile.timezone})\nYou'll get a morning digest with notable price moves.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Main menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
