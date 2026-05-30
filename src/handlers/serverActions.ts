import { Context, NarrowedContext } from "telegraf";
import { Update, CallbackQuery } from "telegraf/types";
import { getServerById, getServers, ServerConfig } from "../db/servers";
import { connectSSH } from "../services/ssh";
import {
  getServerSpecs,
  getDiskUsage,
  getMemoryUsage,
  detectServerTools,
  getPM2List,
  getDockerContainers,
} from "../services/parsers";

interface ServerActionContext extends Context {
  match: RegExpExecArray | null;
}

type ServerActionCallbackContext = NarrowedContext<
  ServerActionContext,
  Update.CallbackQueryUpdate<CallbackQuery>
>;

/**
 * Extract server ID from callback data
 */
function extractServerId(data: string): number | null {
  const match = data.match(/_(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Get server config with credentials for SSH connection
 */
async function getServerConfig(userId: string, serverId: number): Promise<ServerConfig | null> {
  const server = getServerById(userId, serverId);
  if (!server) return null;
  // Return without id and timestamps
  const { id, createdAt, updatedAt, ...config } = server;
  return config;
}

/**
 * Show server specifications
 */
export async function handleSpec(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Fetching server specifications...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const specs = await getServerSpecs(connectResult.connection);

    const message =
      `🖥 Server: ${serverName}\n\n` +
      `OS       : ${specs.os}\n` +
      `Hostname : ${specs.hostname}\n` +
      `Kernel   : ${specs.kernel}\n` +
      `CPU      : ${specs.cpuModel}\n` +
      `Cores    : ${specs.cpuCores}\n` +
      `Arch     : ${specs.architecture}\n` +
      `Uptime   : ${specs.uptime}`;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `spec_${serverId}` }],
          [{ text: "🔙 Back", callback_data: `connect_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get specs: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show disk usage
 */
export async function handleDisk(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Fetching disk usage...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const partitions = await getDiskUsage(connectResult.connection);

    if (partitions.length === 0) {
      await ctx.reply("No disk partitions found.");
      return;
    }

    let message = `💾 Disk Usage — ${serverName}\n\n`;

    for (const partition of partitions) {
      const bar = getProgressBar(partition.usePercent);
      message += `${partition.mountedOn}\n`;
      message += `${bar} ${partition.usePercent}%\n`;
      message += `${partition.used} / ${partition.size} (${partition.available} avail)\n\n`;
    }

    await ctx.reply(message.trim(), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `disk_${serverId}` }],
          [{ text: "🔙 Back", callback_data: `connect_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get disk usage: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show memory usage
 */
export async function handleMemory(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Fetching memory usage...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const mem = await getMemoryUsage(connectResult.connection);

    const ramBar = getProgressBar(mem.ramUsedPercent);
    const swapBar = getProgressBar(mem.swapUsedPercent);

    const message =
      `🧠 Memory Usage — ${serverName}\n\n` +
      `RAM\n` +
      `${ramBar} ${mem.ramUsedPercent}%\n` +
      `${mem.ramUsed} / ${mem.ramTotal} used\n` +
      `${mem.ramAvailable} available\n\n` +
      `Swap\n` +
      `${swapBar} ${mem.swapUsedPercent}%\n` +
      `${mem.swapUsed} / ${mem.swapTotal} used`;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `mem_${serverId}` }],
          [{ text: "🔙 Back", callback_data: `connect_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get memory usage: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show service list - detect available services first
 */
export async function handleServiceList(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Detecting available services...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const tools = await detectServerTools(connectResult.connection);

    const buttons: { text: string; callback_data: string }[] = [];

    if (tools.hasPm2) {
      buttons.push({ text: "📦 PM2", callback_data: `pm2list_${serverId}` });
    }
    if (tools.hasDocker) {
      buttons.push({ text: "🐳 Docker", callback_data: `dockerlist_${serverId}` });
    }
    if (tools.hasNginx) {
      buttons.push({ text: "🌐 Nginx", callback_data: `nginxinfo_${serverId}` });
    }
    if (tools.hasSystemctl) {
      buttons.push({ text: "⚙️ Systemd", callback_data: `systemdlist_${serverId}` });
    }

    if (buttons.length === 0) {
      await ctx.reply("No supported services detected on this server.");
      return;
    }

    // Arrange buttons in pairs
    const keyboard: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      const row: { text: string; callback_data: string }[] = [buttons[i]];
      if (i + 1 < buttons.length) {
        row.push(buttons[i + 1]);
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: "🔙 Back", callback_data: `connect_${serverId}` }]);

    await ctx.reply(
      `🔧 Service List — ${serverName}\n\n` +
      `Detected services:`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (error) {
    await ctx.reply(`❌ Failed to detect services: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show PM2 app list
 */
export async function handlePM2List(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Fetching PM2 apps...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const apps = await getPM2List(connectResult.connection);

    if (apps.length === 0) {
      await ctx.reply("No PM2 apps found.");
      return;
    }

    let message = `📦 PM2 Apps — ${serverName}\n\n`;

    for (const app of apps) {
      const statusIcon = app.status === "online" ? "🟢" : app.status === "errored" ? "🔴" : "🟡";
      message += `${statusIcon} ${app.name}\n`;
      message += `   ${app.status} | CPU: ${app.cpu}% | RAM: ${formatBytes(app.memory)}\n`;
      message += `   Uptime: ${app.uptime} | Restarts: ${app.restarts}\n\n`;
    }

    await ctx.reply(message.trim(), {
      reply_markup: {
        inline_keyup: {
          inline_keyboard: [
            [{ text: "🔄 Refresh", callback_data: `pm2list_${serverId}` }],
            [{ text: "🔙 Back", callback_data: `service_${serverId}` }],
          ],
        },
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get PM2 apps: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show Docker container list
 */
export async function handleDockerList(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  await ctx.reply("⏳ Fetching Docker containers...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const containers = await getDockerContainers(connectResult.connection);

    if (containers.length === 0) {
      await ctx.reply("No Docker containers found.");
      return;
    }

    let message = `🐳 Docker Containers — ${serverName}\n\n`;

    for (const container of containers) {
      const stateIcon = container.state === "running" ? "🟢" : "🔴";
      message += `${stateIcon} ${container.name}\n`;
      message += `   ${container.status}\n`;
      if (container.ports) {
        message += `   Ports: ${container.ports}\n`;
      }
      message += "\n";
    }

    await ctx.reply(message.trim(), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `dockerlist_${serverId}` }],
          [{ text: "🔙 Back", callback_data: `service_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get Docker containers: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show log viewer menu
 */
export async function handleLogMenu(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  // Detect available log sources
  await ctx.reply("⏳ Detecting available log sources...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const tools = await detectServerTools(connectResult.connection);
    const pm2Apps = tools.hasPm2 ? await getPM2List(connectResult.connection) : [];
    const dockerContainers = tools.hasDocker ? await getDockerContainers(connectResult.connection) : [];

    const keyboard: { text: string; callback_data: string }[][] = [];

    // Nginx logs (if nginx is installed)
    if (tools.hasNginx) {
      keyboard.push([
        { text: "🌐 Nginx Error Log", callback_data: `ngxerrorlog_${serverId}` },
        { text: "🌐 Nginx Access Log", callback_data: `ngxaccesslog_${serverId}` },
      ]);
    }

    // PM2 logs (if pm2 is installed and has apps)
    if (tools.hasPm2 && pm2Apps.length > 0) {
      for (const app of pm2Apps.slice(0, 3)) {
        // Limit to 3 apps for inline keyboard space
        keyboard.push([{ text: `📦 PM2: ${app.name}`, callback_data: `pm2log_${serverId}_${app.name}` }]);
      }
    }

    // Docker logs (if docker is installed and has containers)
    if (tools.hasDocker && dockerContainers.length > 0) {
      for (const container of dockerContainers.slice(0, 3)) {
        // Limit to 3 containers
        keyboard.push([{ text: `🐳 ${container.name}`, callback_data: `docklog_${serverId}_${container.name}` }]);
      }
    }

    // Journalctl option
    if (tools.hasSystemctl) {
      keyboard.push([{ text: "📜 Systemd Journal", callback_data: `journal_${serverId}` }]);
    }

    keyboard.push([{ text: "🔙 Back", callback_data: `connect_${serverId}` }]);

    await ctx.reply(
      `📜 Log Viewer — ${serverName}\n\n` +
      `Select log source:`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (error) {
    await ctx.reply(`❌ Failed to detect log sources: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Helper function to generate progress bar
 */
function getProgressBar(percent: number, length: number = 10): string {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
