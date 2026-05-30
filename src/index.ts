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
  handleDeleteServer,
  handleDeleteConfirm,
  handleConnect,
  handleSpec,
  handleDisk,
  handleMemory,
  handleServiceList,
  handlePM2List,
  handlePM2Action,
  handlePM2Restart,
  handlePM2Stop,
  handleDockerList,
  handleDockerAction,
  handleDockerRestart,
  handleDockerStop,
  handleLogMenu,
  handleNginxInfo,
  handleNginxRestart,
  handleNginxStop,
  handleSystemdList,
  handleSystemdAction,
  handleSystemdDescription,
  handleSystemdRestart,
  handleSystemdStop,
  handleCLI,
  handleNginxErrorLog,
  handleNginxAccessLog,
  handlePM2LogView,
  handleDockerLogView,
  handleJournalLog,
  handleJournalLogWithService,
  getCLIMode,
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
bot.action(/^connect_\d+$/, handleConnect);
bot.action(/^delete_\d+$/, handleDeleteServer);
bot.action(/^delete_confirm_\d+$/, handleDeleteConfirm);

// Server action handlers (from connect menu)
bot.action(/^spec_\d+$/, handleSpec);
bot.action(/^disk_\d+$/, handleDisk);
bot.action(/^mem_\d+$/, handleMemory);
bot.action(/^service_\d+$/, handleServiceList);
bot.action(/^pm2list_\d+$/, handlePM2List);
bot.action(/^pm2action_\d+_.+$/, handlePM2Action);
bot.action(/^pm2restart_\d+_.+$/, handlePM2Restart);
bot.action(/^pm2stop_\d+_.+$/, handlePM2Stop);
bot.action(/^dockerlist_\d+$/, handleDockerList);
bot.action(/^dockeraction_\d+_.+$/, handleDockerAction);
bot.action(/^dockerrestart_\d+_.+$/, handleDockerRestart);
bot.action(/^dockerstop_\d+_.+$/, handleDockerStop);
bot.action(/^log_\d+$/, handleLogMenu);
bot.action(/^cli_\d+$/, handleCLI);

// Nginx handlers
bot.action(/^nginxinfo_\d+$/, handleNginxInfo);
bot.action(/^nginxrestart_\d+$/, handleNginxRestart);
bot.action(/^nginxstop_\d+$/, handleNginxStop);

// Systemd handlers
bot.action(/^systemdlist_\d+$/, handleSystemdList);
bot.action(/^sysdaction_\d+_.+$/, handleSystemdAction);
bot.action(/^sysddesc_\d+_.+$/, handleSystemdDescription);
bot.action(/^sysdrestart_\d+_.+$/, handleSystemdRestart);
bot.action(/^sysdstop_\d+_.+$/, handleSystemdStop);

// Log handlers
bot.action(/^ngxerrorlog_\d+$/, handleNginxErrorLog);
bot.action(/^ngxaccesslog_\d+$/, handleNginxAccessLog);
bot.action(/^pm2log_\d+_.+$/, handlePM2LogView);
bot.action(/^docklog_\d+_.+$/, handleDockerLogView);
bot.action(/^journal_\d+$/, handleJournalLog);
bot.action(/^journal_\d+_.+$/, handleJournalLogWithService);

// Handle text input - single handler for both add flow and fallback
bot.on("text", async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  // Check if user is in CLI mode
  const cliServerId = getCLIMode(userId);
  if (cliServerId) {
    // Import here to avoid circular dependency
    const { handleCLICommand } = await import("./handlers");
    await handleCLICommand(ctx as any, cliServerId);
    return;
  }

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
