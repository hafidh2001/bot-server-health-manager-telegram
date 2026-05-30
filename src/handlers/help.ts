import { Context } from "telegraf";

/**
 * Handle /help command
 */
export async function handleHelp(ctx: Context) {
  const helpText = `
📚 Available Commands:

/start - Open main menu
/help - Show this help message
/exit - Exit CLI Mode (if active)

Select a server from the main menu to view available actions.
  `.trim();

  await ctx.reply(helpText);
}
