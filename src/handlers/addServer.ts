import { Context } from "telegraf";
import { Update, Message, CallbackQuery } from "telegraf/types";
import { getServers, addServer, serverExists } from "../db/servers";
import { testConnection, ServerConfig } from "../services/ssh";
import { showMainMenu } from "./start";

type AddServerStep =
  | "mode_select"
  | "name"
  | "host"
  | "port"
  | "username"
  | "auth_type"
  | "credential"
  | "confirm"
  | "cli_input"
  | "cli_name";

interface AddServerState {
  step: AddServerStep;
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: "password" | "ssh_key";
  credential?: string;
  mode?: "form" | "cli";
}

interface AddServerContext extends Context {
  match: RegExpExecArray | null;
}

type AddServerCallbackContext = NarrowedContext<
  AddServerContext,
  Update.CallbackQueryUpdate<CallbackQuery>
>;

type AddServerTextContext = NarrowedContext<
  AddServerContext,
  Update.MessageUpdate<Message>
>;

import { NarrowedContext } from "telegraf";

// Store for temporary state per user
const userStates = new Map<string, AddServerState>();

/**
 * Format server info as SSH string for summary
 */
function formatServerSummary(state: AddServerState): string {
  const name = state.name || "-";
  const username = state.username || "-";
  const host = state.host || "-";
  const port = state.port || 22;

  return (
    `[alias] ssh <user>@<host> -p <port>\n` +
    `[${name}] ssh ${username}@${host} -p ${port}`
  );
}

/**
 * Clear user state
 */
function clearState(userId: string) {
  userStates.delete(userId);
}

/**
 * Get user state
 */
function getState(userId: string): AddServerState {
  if (!userStates.has(userId)) {
    userStates.set(userId, { step: "mode_select" });
  }
  return userStates.get(userId)!;
}

/**
 * Show mode selection
 */
async function showModeSelection(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "mode_select";

  await ctx.reply(
    "Select how to add a server:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Form Template", callback_data: "add_mode_form" }],
          [{ text: "💻 CLI String", callback_data: "add_mode_cli" }],
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show name input step
 */
async function showNameInput(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "name";

  await ctx.reply(
    "Step 1/6 - Server Alias Name:\n\n" +
    "Enter a friendly name for this server\n" +
    "(e.g., production-api, db-main, staging-01)",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show host input step
 */
async function showHostInput(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "host";

  await ctx.reply(
    "Step 2/6 - Host / IP Address:\n\n" +
    "Enter the server IP address or hostname\n" +
    "(e.g., 192.168.1.100 or server.example.com)",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show port input step
 */
async function showPortInput(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "port";

  await ctx.reply(
    "Step 3/6 - SSH Port:\n\n" +
    "Enter SSH port (default: 22)",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show username input step
 */
async function showUsernameInput(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "username";

  await ctx.reply(
    "Step 4/6 - SSH Username:\n\n" +
    "Enter SSH username\n" +
    "(e.g., root, ubuntu, deploy)",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show auth type selection
 */
async function showAuthTypeSelection(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "auth_type";

  await ctx.reply(
    "Step 5/6 - Authentication Method:\n\n" +
    "Select authentication method:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 Password", callback_data: "add_auth_password" }],
          [{ text: "📄 SSH Key", callback_data: "add_auth_sshkey" }],
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show credential input step
 */
async function showCredentialInput(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "credential";

  const isPassword = state.authType === "password";
  const isCLI = state.mode === "cli";
  const stepNum = isCLI ? "4/4" : "6/6";

  await ctx.reply(
    `Step ${stepNum} - ${isPassword ? "Password" : "SSH Key Path"}:\n\n` +
    `${isPassword ? "Enter the SSH password" : "Enter the path to SSH private key file"}\n` +
    `(e.g., ${isPassword ? "mysecretpassword" : "/home/user/.ssh/id_rsa"})`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Show confirmation screen
 */
async function showConfirmation(ctx: AddServerContext, userId: string) {
  const state = getState(userId);
  state.step = "confirm";

  await ctx.reply(
    "📋 Server Summary:\n\n" +
    formatServerSummary(state) + "\n\n" +
    "Test connection before saving?",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Save & Test", callback_data: "add_save_test" }],
          [{ text: "💾 Save Only", callback_data: "add_save_only" }],
          [{ text: "❌ Cancel", callback_data: "add_cancel" }],
        ],
      },
    }
  );
}

/**
 * Handle "Add Server" button click
 */
export async function handleAddServer(ctx: AddServerContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  clearState(userId);
  await showModeSelection(ctx, userId);
}

/**
 * Handle add mode selection (callback)
 */
export async function handleAddModeSelect(ctx: AddServerCallbackContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;
  const data = (callbackQuery as { data: string }).data;

  if (data === "add_mode_form") {
    const state = getState(userId);
    state.mode = "form";
    await ctx.answerCbQuery();
    await showNameInput(ctx, userId);
  } else if (data === "add_mode_cli") {
    const state = getState(userId);
    state.mode = "cli";
    await ctx.answerCbQuery();
    await ctx.reply(
      "💻 CLI String Mode:\n\n" +
      "Step 1/4 - Server Alias Name:\n\n" +
      "Enter a friendly name for this server first\n" +
      "(e.g., production-api, db-main, staging-01)",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "add_cancel" }],
          ],
        },
      }
    );
    const cliState = getState(userId);
    cliState.step = "cli_name";
  } else if (data === "add_cancel") {
    await ctx.answerCbQuery();
    clearState(userId);
    await ctx.reply("Add server cancelled.");
    await showMainMenu(ctx);
  }
}

/**
 * Parse CLI string input
 */
function parseCLIString(input: string): { username?: string; host?: string; port?: number } | null {
  let str = input.trim();
  if (str.startsWith("ssh ")) {
    str = str.substring(4);
  }

  const match = str.match(/^([^@]+)@([^\s\-]+)(?:\s+-p\s+(\d+))?/);
  if (!match) return null;

  return {
    username: match[1],
    host: match[2],
    port: match[3] ? parseInt(match[3], 10) : 22,
  };
}

/**
 * Handle text input during add server flow
 */
export async function handleAddServerText(ctx: AddServerTextContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const state = getState(userId);
  const text = (ctx.message as Message.TextMessage).text;

  switch (state.step) {
    case "name":
      if (text.length < 1 || text.length > 50) {
        await ctx.reply("Invalid name. Please enter 1-50 characters.");
        return;
      }
      if (serverExists(userId, text)) {
        await ctx.reply("A server with this name already exists. Please choose another name.");
        return;
      }
      state.name = text;
      await showHostInput(ctx, userId);
      break;

    case "host":
      const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?$/;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!hostRegex.test(text) && !ipRegex.test(text)) {
        await ctx.reply("Invalid hostname or IP address.");
        return;
      }
      state.host = text;
      await showPortInput(ctx, userId);
      break;

    case "port":
      const port = parseInt(text, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        await ctx.reply("Invalid port number. Please enter 1-65535.");
        return;
      }
      state.port = port;
      await showUsernameInput(ctx, userId);
      break;

    case "username":
      if (!text || text.length < 1) {
        await ctx.reply("Invalid username.");
        return;
      }
      state.username = text;
      await showAuthTypeSelection(ctx, userId);
      break;

    case "credential":
      if (!text || text.length < 1) {
        await ctx.reply("Invalid credential.");
        return;
      }
      state.credential = text;
      await showConfirmation(ctx, userId);
      break;

    case "cli_name": {
      const cliState = getState(userId);

      if (text.length < 1 || text.length > 50) {
        await ctx.reply("Invalid name. Please enter 1-50 characters.");
        return;
      }

      if (serverExists(userId, text)) {
        await ctx.reply("A server with this name already exists. Please choose another name.");
        return;
      }

      cliState.name = text;
      cliState.step = "cli_input";

      await ctx.reply(
        "Step 2/4 - CLI Connection String:\n\n" +
        "Send your SSH connection string:\n" +
        "Format: ssh user@host -p port\n\n" +
        "Example: ssh root@192.168.1.100 -p 2222",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "❌ Cancel", callback_data: "add_cancel" }],
            ],
          },
        }
      );
      break;
    }

    case "cli_input": {
      const parsed = parseCLIString(text);
      if (!parsed || !parsed.username || !parsed.host) {
        await ctx.reply(
          "Invalid SSH string format.\n\n" +
          "Please use format: ssh user@host -p port\n" +
          "Example: ssh root@192.168.1.100 -p 2222"
        );
        return;
      }

      const cliState = getState(userId);
      cliState.host = parsed.host;
      cliState.port = parsed.port;
      cliState.username = parsed.username;
      cliState.step = "auth_type";

      await ctx.reply(
        "Step 3/4 - Authentication Method:\n\n" +
        "Select authentication method:",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔑 Password", callback_data: "add_auth_password" }],
              [{ text: "📄 SSH Key", callback_data: "add_auth_sshkey" }],
              [{ text: "❌ Cancel", callback_data: "add_cancel" }],
            ],
          },
        }
      );
      break;
    }

    default:
      // Not in add flow, ignore
      break;
  }
}

/**
 * Handle auth type selection (callback)
 */
export async function handleAuthTypeSelect(ctx: AddServerCallbackContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;
  const data = (callbackQuery as { data: string }).data;

  const state = getState(userId);

  if (data === "add_auth_password") {
    await ctx.answerCbQuery();
    state.authType = "password";
    await showCredentialInput(ctx, userId);
  } else if (data === "add_auth_sshkey") {
    await ctx.answerCbQuery();
    state.authType = "ssh_key";
    await showCredentialInput(ctx, userId);
  }
}

/**
 * Handle save server (callback)
 */
export async function handleSaveServer(ctx: AddServerCallbackContext, testFirst: boolean) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  await ctx.answerCbQuery();

  const state = getState(userId);

  if (!state.name || !state.host || !state.port || !state.username || !state.authType || !state.credential) {
    await ctx.reply("Error: Missing server data. Please start over with /start.");
    clearState(userId);
    return;
  }

  const serverConfig: ServerConfig = {
    host: state.host,
    port: state.port,
    username: state.username,
    authType: state.authType,
    credential: state.credential,
  };

  if (testFirst) {
    await ctx.reply("Testing connection...");

    const testResult = await testConnection(serverConfig);

    if (!testResult.success) {
      await ctx.reply(
        "Connection Test Failed\n\n" +
        testResult.message + "\n\n" +
        "Do you want to save anyway or try again?",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💾 Save Anyway", callback_data: "add_save_forced" }],
              [{ text: "🔄 Try Again", callback_data: "add_retry" }],
              [{ text: "❌ Cancel", callback_data: "add_cancel" }],
            ],
          },
        }
      );
      return;
    }

    await ctx.reply("Connection successful!");
  }

  try {
    addServer({
      userId,
      name: state.name,
      host: state.host,
      port: state.port,
      username: state.username,
      authType: state.authType,
      credential: state.credential,
    });

    clearState(userId);

    await ctx.reply(
      "Server Added Successfully!\n\n" +
      formatServerSummary(state)
    );

    await showMainMenu(ctx);
  } catch (error) {
    await ctx.reply("Failed to save server: " + (error as Error).message);
  }
}

/**
 * Handle forced save / retry / cancel (callback)
 */
export async function handleSaveForced(ctx: AddServerCallbackContext) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;
  const data = (callbackQuery as { data: string }).data;

  if (data === "add_save_forced") {
    await handleSaveServer(ctx, false);
  } else if (data === "add_retry") {
    await ctx.answerCbQuery();
    const state = getState(userId!);
    state.step = "credential";
    await showCredentialInput(ctx, userId!);
  } else if (data === "add_cancel") {
    await ctx.answerCbQuery();
    clearState(userId!);
    await ctx.reply("Add server cancelled.");
    await showMainMenu(ctx);
  }
}
