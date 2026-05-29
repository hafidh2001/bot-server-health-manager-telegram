import "dotenv/config";
import { Telegraf } from "telegraf";
import { readFileSync } from "fs";
import { join } from "path";

// Check required env vars
const requiredEnvVars = ["BOT_TOKEN", "ENCRYPTION_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} is not set in environment variables`);
    process.exit(1);
  }
}

// Allowed user IDs (comma-separated)
const allowedUserIds = process.env.ALLOWED_USER_IDS?.split(",").map((id) => id.trim()) || [];

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN!);

// Auth middleware - whitelist check
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply("❌ Unable to identify your account.");
    return;
  }

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(userId)) {
    await ctx.reply("❌ Access denied. Your Telegram ID is not whitelisted.");
    return;
  }

  await next();
});

// Start command
bot.command("start", async (ctx) => {
  await ctx.reply(
    "🤖 Selamat datang di ServerBot!\n\n" +
    "Bot ini digunakan untuk monitoring dan manajemen server via Telegram.\n\n" +
    "Gunakan /help untuk melihat bantuan."
  );
});

// Help command
bot.command("help", async (ctx) => {
  const helpText = `
📚 Daftar Command:

/start - Buka menu utama
/help - Tampilkan bantuan ini

Bot ini masih dalam fase pengembangan.
  `.trim();

  await ctx.reply(helpText);
});

// Health check - echo message
bot.on("text", async (ctx) => {
  await ctx.reply(`You said: ${ctx.message.text}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down bot...");
  bot.stop("SIGINT");
  process.exit(0);
});

// Start bot
const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error("BOT_TOKEN is not set!");
  process.exit(1);
}

console.log("🤖 Starting ServerBot...");
console.log(`Allowed users: ${allowedUserIds.length > 0 ? allowedUserIds.join(", ") : "ALL (not recommended)"}`);

bot.launch().then(() => {
  console.log("✅ Bot is running!");
}).catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
