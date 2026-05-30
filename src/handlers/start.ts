import { Context } from "telegraf";
import { getServers } from "../db/servers";

interface StartContext extends Context {
  match: RegExpExecArray | null;
}

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
 * Handle /start command
 */
export async function handleStart(ctx: StartContext) {
  await showMainMenu(ctx);
}
