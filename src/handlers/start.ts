import { Context, NarrowedContext } from "telegraf";
import { Update, CallbackQuery } from "telegraf/types";
import { getServers, deleteServer } from "../db/servers";

interface StartContext extends Context {
  match: RegExpExecArray | null;
}

type ServerCallbackContext = NarrowedContext<
  StartContext,
  Update.CallbackQueryUpdate<CallbackQuery>
>;

/**
 * Show main menu with server list
 */
export async function showMainMenu(ctx: StartContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const servers = getServers(userId);

  if (servers.length === 0) {
    // No servers - show onboarding
    await ctx.reply(
      "🤖 Welcome to HAF Service Manager!\n\n" +
      "No servers added yet. Add your first server to start monitoring.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Add Server", callback_data: "add_server" }],
          ],
        },
      }
    );
    return;
  }

  // Build inline keyboard array
  const inlineKeyboard: { text: string; callback_data: string }[][] = [];

  // Add server buttons (2 per row)
  for (let i = 0; i < servers.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    row.push({ text: `🔴 ${servers[i].name}`, callback_data: `server_${servers[i].id}` });

    if (i + 1 < servers.length) {
      row.push({ text: `🔴 ${servers[i + 1].name}`, callback_data: `server_${servers[i + 1].id}` });
    }

    inlineKeyboard.push(row);
  }

  // Add "Add Server" button
  inlineKeyboard.push([{ text: "➕ Add Server", callback_data: "add_server" }]);

  // Build server status summary
  const serverList = servers.map((s) => `🔴 ${s.name}`).join("\n");

  await ctx.reply(
    "🖥 Select a Server\n\n" +
    serverList + "\n\n" +
    "🔴 = Connection status unknown\n\n" +
    "Use /help for available commands.",
    { reply_markup: { inline_keyboard: inlineKeyboard } }
  );
}

/**
 * Handle server selection - show Connect/Delete options
 */
export async function handleServerSelect(ctx: ServerCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;

  // Check if this is a server selection callback
  if (!data.startsWith("server_")) return;

  const serverId = parseInt(data.replace("server_", ""), 10);
  if (isNaN(serverId)) return;

  await ctx.answerCbQuery();

  // Get server info
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);

  if (!server) {
    await ctx.reply("Server not found.");
    return;
  }

  // Show Connect and Delete options
  await ctx.reply(
    `🖥 Server: ${server.name}\n\n` +
    `[${server.name}]  -->  ssh ${server.username}@${server.host} -p ${server.port}\n\n` +
    `What would you like to do?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 Connect", callback_data: `connect_${server.id}` }],
          [{ text: "🗑 Delete", callback_data: `delete_${server.id}` }],
          [{ text: "🔙 Back", callback_data: "back_main" }],
        ],
      },
    }
  );
}

/**
 * Handle delete server - show confirmation
 */
export async function handleDeleteServer(ctx: ServerCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;

  if (!data.startsWith("delete_")) return;

  const serverId = parseInt(data.replace("delete_", ""), 10);
  if (isNaN(serverId)) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);

  if (!server) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(
    `⚠️ Delete Server: ${server.name}?\n\n` +
    `[${server.name}]  -->  ssh ${server.username}@${server.host} -p ${server.port}\n\n` +
    `This action cannot be undone.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Yes, Delete", callback_data: `delete_confirm_${server.id}` }],
          [{ text: "❌ Cancel", callback_data: `server_${server.id}` }],
        ],
      },
    }
  );
}

/**
 * Handle delete confirmation - actually delete the server
 */
export async function handleDeleteConfirm(ctx: ServerCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;

  if (!data.startsWith("delete_confirm_")) return;

  const serverId = parseInt(data.replace("delete_confirm_", ""), 10);
  if (isNaN(serverId)) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const success = deleteServer(userId, serverId);

  if (success) {
    await ctx.reply("✅ Server deleted successfully.");
    await showMainMenu(ctx as unknown as StartContext);
  } else {
    await ctx.reply("❌ Failed to delete server. Please try again.");
  }
}

/**
 * Handle connect - show full server action menu
 */
export async function handleConnect(ctx: ServerCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;

  if (!data.startsWith("connect_")) return;

  const serverId = parseInt(data.replace("connect_", ""), 10);
  if (isNaN(serverId)) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);

  if (!server) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(
    `🖥 Server: ${server.name}\n` +
    `[${server.name}]  -->  ssh ${server.username}@${server.host} -p ${server.port}\n\n` +
    `Select an action:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💻 CLI Mode", callback_data: `cli_${server.id}` },
            { text: "📋 Spesifikasi", callback_data: `spec_${server.id}` },
          ],
          [
            { text: "💾 Disk Usage", callback_data: `disk_${server.id}` },
            { text: "🧠 Memory Usage", callback_data: `mem_${server.id}` },
          ],
          [
            { text: "🔧 Service List", callback_data: `service_${server.id}` },
            { text: "📜 Lihat Log", callback_data: `log_${server.id}` },
          ],
          [{ text: "🔙 Back", callback_data: `server_${server.id}` }],
        ],
      },
    }
  );
}

/**
 * Handle /start command
 */
export async function handleStart(ctx: StartContext) {
  await showMainMenu(ctx);
}
