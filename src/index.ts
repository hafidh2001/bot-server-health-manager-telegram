import "dotenv/config";
import { Telegraf } from "telegraf";
import {
  handleStart,
  handleHelp,
  handleAddServer,
  handleAddModeSelect,
  handleAddServerText,
  handleAuthTypeSelect,
  handleSaveServer,
  handleSaveForced,
  handleServerSelect,
  showMainMenu,
} from "./handlers";

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

// Register command handlers
bot.command("start", handleStart);
bot.command("help", handleHelp);

// Callback query handlers for add server flow
bot.action("add_server", handleAddServer);
bot.action("add_cancel", handleAddModeSelect);
bot.action("add_mode_form", handleAddModeSelect);
bot.action("add_mode_cli", handleAddModeSelect);
bot.action("add_auth_password", handleAuthTypeSelect);
bot.action("add_auth_sshkey", handleAuthTypeSelect);
bot.action("add_save_test", async (ctx) => handleSaveServer(ctx as any, true));
bot.action("add_save_only", async (ctx) => handleSaveServer(ctx as any, false));
bot.action("add_save_forced", handleSaveForced);
bot.action("add_retry", handleSaveForced);

// Server list callback handlers
bot.action("back_main", showMainMenu);
bot.action(/^server_\d+$/, handleServerSelect);
bot.action(/^connect_\d+$/, async (ctx) => {
  await ctx.answerCbQuery("Connect feature coming soon!");
});
bot.action(/^delete_\d+$/, async (ctx) => {
  await ctx.answerCbQuery("Delete feature coming soon!");
});

// Handle text input - single handler for both add flow and fallback
bot.on("text", async (ctx) => {
  // Pass to add server flow handler
  await handleAddServerText(ctx as any);
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

console.log("🤖 Starting HAF Service Manager...");
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
