import { Context, NarrowedContext } from "telegraf";
import { Update, CallbackQuery, Message } from "telegraf/types";
import { getServerById, getServers, ServerConfig } from "../db/servers";
import { connectSSH, executeCommand } from "../services/ssh";
import {
  getServerSpecs,
  getDiskUsage,
  getMemoryUsage,
  detectServerTools,
  getPM2List,
  getDockerContainers,
  restartNginx,
  stopNginx,
  restartDockerContainer,
  stopDockerContainer,
  restartSystemdService,
  stopSystemdService,
  getSystemdServiceStatus,
  getSystemdServiceDetailedStatus,
  restartPM2,
  stopPM2,
  getNginxErrorLog,
  getNginxAccessLog,
  getDockerLog,
  getPM2Log,
  getJournalLog,
} from "../services/parsers";
import { isCommandBlacklisted } from "../services/blacklist";

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
 * Show PM2 app list - each app is a clickable button
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
    message += "Select an app to manage:\n\n";

    const keyboard: { text: string; callback_data: string }[][] = [];

    for (const app of apps) {
      const statusIcon = app.status === "online" ? "🟢" : app.status === "errored" ? "🔴" : "🟡";
      message += `${statusIcon} ${app.name} — ${app.status}\n`;
      keyboard.push([{ text: `${statusIcon} ${app.name}`, callback_data: `pm2action_${serverId}_${app.name}` }]);
    }

    keyboard.push([{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }]);

    await ctx.reply(message.trim(), {
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get PM2 apps: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Handle PM2 app action - show restart/stop buttons
 */
export async function handlePM2Action(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: pm2action_<serverId>_<appName>
  const match = data.match(/^pm2action_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const appName = match[2];

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

  await ctx.reply(
    `📦 PM2 App: ${appName}\n` +
    `Server: ${serverName}\n\n` +
    `Select action:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `pm2restart_${serverId}_${appName}` },
            { text: "⏹ Stop", callback_data: `pm2stop_${serverId}_${appName}` },
          ],
          [{ text: "🔙 Back to PM2 List", callback_data: `pm2list_${serverId}` }],
        ],
      },
    }
  );
}

/**
 * Handle PM2 restart
 */
export async function handlePM2Restart(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const match = data.match(/^pm2restart_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const appName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Restarting PM2 app '${appName}'...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await restartPM2(connectResult.connection, appName);

    if (result.success) {
      await ctx.reply(`✅ ${result.message}`);
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart Again", callback_data: `pm2restart_${serverId}_${appName}` },
            { text: "⏹ Stop", callback_data: `pm2stop_${serverId}_${appName}` },
          ],
          [{ text: "🔙 Back to PM2 List", callback_data: `pm2list_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Handle PM2 stop
 */
export async function handlePM2Stop(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const match = data.match(/^pm2stop_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const appName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Stopping PM2 app '${appName}'...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await stopPM2(connectResult.connection, appName);

    if (result.success) {
      await ctx.reply(`✅ ${result.message}`);
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `pm2restart_${serverId}_${appName}` },
            { text: "⏹ Stop Again", callback_data: `pm2stop_${serverId}_${appName}` },
          ],
          [{ text: "🔙 Back to PM2 List", callback_data: `pm2list_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show Docker container list - each container is a clickable button
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
    message += "Select a container to manage:\n\n";

    const keyboard: { text: string; callback_data: string }[][] = [];

    for (const container of containers) {
      const stateIcon = container.state === "running" ? "🟢" : "🔴";
      message += `${stateIcon} ${container.name} — ${container.state}\n`;
      keyboard.push([{ text: `${stateIcon} ${container.name}`, callback_data: `dockeraction_${serverId}_${container.name}` }]);
    }

    keyboard.push([{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }]);

    await ctx.reply(message.trim(), {
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get Docker containers: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Handle Docker container action - show restart/stop buttons
 */
export async function handleDockerAction(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: dockeraction_<serverId>_<containerName>
  const match = data.match(/^dockeraction_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const containerName = match[2];

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

  await ctx.reply(
    `🐳 Docker: ${containerName}\n` +
    `Server: ${serverName}\n\n` +
    `Select action:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `dockerrestart_${serverId}_${containerName}` },
            { text: "⏹ Stop", callback_data: `dockerstop_${serverId}_${containerName}` },
          ],
          [{ text: "🔙 Back to Docker List", callback_data: `dockerlist_${serverId}` }],
        ],
      },
    }
  );
}

/**
 * Handle Docker container restart
 */
export async function handleDockerRestart(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const match = data.match(/^dockerrestart_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const containerName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Restarting container '${containerName}'...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await restartDockerContainer(connectResult.connection, containerName);

    if (result.success) {
      await ctx.reply(`✅ ${result.message}`);
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart Again", callback_data: `dockerrestart_${serverId}_${containerName}` },
            { text: "⏹ Stop", callback_data: `dockerstop_${serverId}_${containerName}` },
          ],
          [{ text: "🔙 Back to Docker List", callback_data: `dockerlist_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Handle Docker container stop
 */
export async function handleDockerStop(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const match = data.match(/^dockerstop_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const containerName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Stopping container '${containerName}'...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await stopDockerContainer(connectResult.connection, containerName);

    if (result.success) {
      await ctx.reply(`✅ ${result.message}`);
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `dockerrestart_${serverId}_${containerName}` },
            { text: "⏹ Stop Again", callback_data: `dockerstop_${serverId}_${containerName}` },
          ],
          [{ text: "🔙 Back to Docker List", callback_data: `dockerlist_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
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
 * Show Nginx info and action buttons
 */
export async function handleNginxInfo(ctx: ServerActionCallbackContext) {
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

  await ctx.reply("⏳ Checking Nginx status...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await executeCommand(connectResult.connection, "systemctl is-active nginx 2>/dev/null || echo 'inactive'");
    const isActive = result.stdout.trim() === "active";

    const statusText = isActive ? "🟢 Running" : "🔴 Not running";

    await ctx.reply(
      `🌐 Nginx — ${serverName}\n\n` +
      `Status: ${statusText}\n\n` +
      `Select action:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Restart", callback_data: `nginxrestart_${serverId}` },
              { text: "⏹ Stop", callback_data: `nginxstop_${serverId}` },
            ],
            [{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }],
          ],
        },
      }
    );
  } catch (error) {
    await ctx.reply(`❌ Failed to check Nginx status: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Restart Nginx
 */
export async function handleNginxRestart(ctx: ServerActionCallbackContext) {
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

  await ctx.reply("⏳ Restarting Nginx...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await restartNginx(connectResult.connection);

    if (result.success) {
      await ctx.reply(`✅ Nginx restarted successfully on ${serverName}.`);
    } else {
      await ctx.reply(`❌ Failed to restart Nginx: ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart Again", callback_data: `nginxrestart_${serverId}` },
            { text: "⏹ Stop", callback_data: `nginxstop_${serverId}` },
          ],
          [{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Stop Nginx
 */
export async function handleNginxStop(ctx: ServerActionCallbackContext) {
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

  await ctx.reply("⏳ Stopping Nginx...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await stopNginx(connectResult.connection);

    if (result.success) {
      await ctx.reply(`✅ Nginx stopped successfully on ${serverName}.`);
    } else {
      await ctx.reply(`❌ Failed to stop Nginx: ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `nginxrestart_${serverId}` },
            { text: "⏹ Stop Again", callback_data: `nginxstop_${serverId}` },
          ],
          [{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show Systemd services list - each service is a clickable button with status indicator
 * 2-column layout
 */
export async function handleSystemdList(ctx: ServerActionCallbackContext) {
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

  await ctx.reply("⏳ Fetching systemd services...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    // Get list of all services
    const result = await executeCommand(
      connectResult.connection,
      "systemctl list-units --type=service 2>/dev/null"
    );

    const rawOutput = result.stdout;

    if (!rawOutput || !rawOutput.trim()) {
      await ctx.reply("No systemd services found.");
      return;
    }

    const lines = rawOutput.split("\n");
    const buttons: { text: string; callback_data: string; description: string }[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse systemctl output: UNIT LOAD ACTIVE SUB DESCRIPTION
      // UNIT is at the start, then LOAD, ACTIVE, SUB are single words, rest is DESCRIPTION
      const match = line.match(/^(.+?)\s+(loaded|not-found|masked)\s+(active|inactive|failed)\s+(running|exited|dead)\s+(.+)$/);

      if (!match) continue;

      const serviceNameWithSuffix = match[1].trim();
      const loadState = match[2];
      const activeState = match[3];
      const description = match[5].trim();

      // Skip if load state is "not-found" or "masked"
      if (loadState === "not-found" || loadState === "masked") continue;

      // Remove .service suffix if present
      let serviceName = serviceNameWithSuffix.replace(/\.service$/, "");

      if (!serviceName) continue;

      // Determine status: green if running, red if failed, white otherwise
      const isActive = activeState === "active";
      const isFailed = activeState === "failed";
      const statusIcon = isActive ? "🟢" : isFailed ? "🔴" : "⚪";

      buttons.push({
        text: `${statusIcon} ${serviceName}`,
        callback_data: `sysdaction_${serverId}_${serviceName}`,
        description: description,
      });
    }

    if (buttons.length === 0) {
      await ctx.reply("No systemd services found.");
      return;
    }

    // Create 2-column layout
    const keyboard: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      const row: { text: string; callback_data: string }[] = [];
      row.push({ text: buttons[i].text, callback_data: buttons[i].callback_data });
      if (i + 1 < buttons.length) {
        row.push({ text: buttons[i + 1].text, callback_data: buttons[i + 1].callback_data });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: "🔙 Back to Services", callback_data: `service_${serverId}` }]);

    await ctx.reply(
      `⚙️ Systemd Services — ${serverName}\n\n` +
      `Select a service to manage:`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (error) {
    await ctx.reply(`❌ Failed to get systemd services: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

// Store service info temporarily (key: "serverId_serviceName")
const systemdServiceInfo = new Map<string, { activeState: string; subState: string; shortDesc: string }>();

/**
 * Handle systemd service action - show inline status/description with Restart/Stop buttons
 */
export async function handleSystemdAction(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: sysdaction_<serverId>_<serviceName>
  const match = data.match(/^sysdaction_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const serviceName = match[2];

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

  // First, get the short description from the list command
  const listConnection = await connectSSH(serverConfig);
  if (!listConnection.success || !listConnection.connection) {
    await ctx.reply(`❌ Connection failed: ${listConnection.error}`);
    return;
  }

  let shortDesc = "";
  let activeState = "inactive";
  let subState = "dead";
  let statusIcon = "⚪";

  try {
    const listResult = await executeCommand(
      listConnection.connection,
      "systemctl list-units --type=service 2>/dev/null"
    );

    const lines = listResult.stdout.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const lineMatch = line.match(/^(.+?)\s+(loaded|not-found|masked)\s+(active|inactive|failed)\s+(running|exited|dead)\s+(.+)$/);
      if (!lineMatch) continue;

      let svcName = lineMatch[1].trim().replace(/\.service$/, "");
      const loadState = lineMatch[2];
      activeState = lineMatch[3];
      subState = lineMatch[4];
      shortDesc = lineMatch[5].trim();

      if (loadState === "not-found" || loadState === "masked") continue;

      if (svcName === serviceName) {
        // Determine status icon
        const isActive = activeState === "active";
        const isFailed = activeState === "failed";
        statusIcon = isActive ? "🟢" : isFailed ? "🔴" : "⚪";

        // Store for later use
        const infoKey = `${serverId}_${serviceName}`;
        systemdServiceInfo.set(infoKey, { activeState, subState, shortDesc });
        break;
      }
    }
  } finally {
    listConnection.connection.dispose();
  }

  // Get detailed status
  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  let detailedStatus = "";
  try {
    const statusResult = await executeCommand(
      connectResult.connection,
      `systemctl status ${serviceName} --no-pager 2>&1`
    );
    detailedStatus = statusResult.stdout || statusResult.stderr || "No details available";
  } finally {
    connectResult.connection.dispose();
  }

  // Format status text
  const statusText = `${statusIcon} ${activeState.charAt(0).toUpperCase() + activeState.slice(1)} (${subState.charAt(0).toUpperCase() + subState.slice(1)})`;

  // Truncate detailed status if too long
  let detailedDesc = detailedStatus;
  if (detailedDesc.length > 1500) {
    detailedDesc = detailedDesc.substring(0, 1500) + "\n\n... (truncated)";
  }

  await ctx.reply(
    `⚙️ ${serviceName}\n` +
    `Server: ${serverName}\n\n` +
    `Status: ${statusText}\n\n` +
    `${shortDesc}\n\n` +
    `Detail:\n\`\`\`\n${detailedDesc}\n\`\`\`\n\n` +
    `Select action:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `sysdrestart_${serverId}_${serviceName}` },
            { text: "⏹ Stop", callback_data: `sysdstop_${serverId}_${serviceName}` },
          ],
          [{ text: "🔙 Back to Services", callback_data: `systemdlist_${serverId}` }],
        ],
      },
    }
  );
}

/**
 * Show systemd service description
 */
export async function handleSystemdDescription(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: sysddesc_<serverId>_<serviceName>
  const match = data.match(/^sysddesc_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const serviceName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply("⏳ Getting service description...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await executeCommand(
      connectResult.connection,
      `systemctl status ${serviceName} --no-pager 2>&1`
    );

    const output = result.stdout || result.stderr || "No description available";

    // Truncate if too long
    let message = output;
    if (message.length > 3800) {
      message = message.substring(0, 3800) + "\n\n... (truncated)";
    }

    await ctx.reply(`\`\`\`\n${message}\n\`\`\``, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `sysdrestart_${serverId}_${serviceName}` },
            { text: "⏹ Stop", callback_data: `sysdstop_${serverId}_${serviceName}` },
          ],
          [{ text: "🔙 Back to Service", callback_data: `sysdaction_${serverId}_${serviceName}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get description: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Restart a systemd service
 */
export async function handleSystemdRestart(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: sysdrestart_<serverId>_<serviceName>
  const match = data.match(/^sysdrestart_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const serviceName = match[2];

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

  await ctx.reply(`⏳ Restarting ${serviceName}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await restartSystemdService(connectResult.connection, serviceName);

    if (result.success) {
      // Get updated status
      const statusInfo = await getSystemdServiceDetailedStatus(connectResult.connection, serviceName);
      const statusIcon = statusInfo.activeState === "active" ? "🟢" : statusInfo.activeState === "failed" ? "🔴" : "⚪";
      const statusText = `${statusIcon} ${statusInfo.activeState.charAt(0).toUpperCase() + statusInfo.activeState.slice(1)} (${statusInfo.subState.charAt(0).toUpperCase() + statusInfo.subState.slice(1)})`;

      await ctx.reply(
        `✅ ${serviceName} restarted successfully on ${serverName}.\n\n` +
        `Status: ${statusText}`
      );
    } else {
      await ctx.reply(`❌ Failed to restart ${serviceName}: ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart Again", callback_data: `sysdrestart_${serverId}_${serviceName}` },
            { text: "⏹ Stop", callback_data: `sysdstop_${serverId}_${serviceName}` },
          ],
          [{ text: "🔙 Back to Services", callback_data: `systemdlist_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Stop a systemd service
 */
export async function handleSystemdStop(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: sysdstop_<serverId>_<serviceName>
  const match = data.match(/^sysdstop_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const serviceName = match[2];

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

  await ctx.reply(`⏳ Stopping ${serviceName}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await stopSystemdService(connectResult.connection, serviceName);

    if (result.success) {
      // Get updated status
      const statusInfo = await getSystemdServiceDetailedStatus(connectResult.connection, serviceName);
      const statusIcon = statusInfo.activeState === "active" ? "🟢" : statusInfo.activeState === "failed" ? "🔴" : "⚪";
      const statusText = `${statusIcon} ${statusInfo.activeState.charAt(0).toUpperCase() + statusInfo.activeState.slice(1)} (${statusInfo.subState.charAt(0).toUpperCase() + statusInfo.subState.slice(1)})`;

      await ctx.reply(
        `✅ ${serviceName} stopped successfully on ${serverName}.\n\n` +
        `Status: ${statusText}`
      );
    } else {
      await ctx.reply(`❌ Failed to stop ${serviceName}: ${result.message}`);
    }

    await ctx.reply("Select action:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Restart", callback_data: `sysdrestart_${serverId}_${serviceName}` },
            { text: "⏹ Stop Again", callback_data: `sysdstop_${serverId}_${serviceName}` },
          ],
          [{ text: "🔙 Back to Services", callback_data: `systemdlist_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

/**
 * Show CLI mode
 */
export async function handleCLI(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const servers = getServers(userId);
  const server = servers.find((s) => s.id === serverId);
  const serverName = server?.name || "Unknown";

  // Set CLI mode state
  setCLIMode(userId, serverId);

  await ctx.reply(
    `💻 CLI Mode — ${serverName}\n\n` +
    `Enter commands to execute on the server.\n` +
    `Type /exit to leave CLI mode.\n\n` +
    `⚠️ Warning: Some commands are blocked for security.\n\n` +
    `Send your command:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Exit CLI", callback_data: `connect_${serverId}` }],
        ],
      },
    }
  );
}

/**
 * Handle CLI command execution (for text input in CLI mode)
 */
export async function handleCLICommand(ctx: ServerActionContext, serverId: number) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = (ctx.message as Message.TextMessage).text;

  // Check for exit command
  if (text === "/exit") {
    clearCLIMode(userId);
    await ctx.reply("Exiting CLI mode.");
    // Show connect menu
    const servers = getServers(userId);
    const server = servers.find((s) => s.id === serverId);
    if (server) {
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
    return;
  }

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  // Check blacklist
  if (isCommandBlacklisted(text)) {
    await ctx.reply(
      `⚠️ Command blocked for security reasons.\n` +
      `This action is not allowed.`
    );
    return;
  }

  await ctx.reply("⏳ Executing command...");

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await executeCommand(connectResult.connection, text);

    let output = "";
    if (result.stdout) {
      output += result.stdout;
    }
    if (result.stderr) {
      if (output) output += "\n";
      output += `STDERR: ${result.stderr}`;
    }
    if (!output) {
      output = "(no output)";
    }

    // Truncate if too long
    const MAX_OUTPUT = 3800;
    if (output.length > MAX_OUTPUT) {
      output = output.substring(0, MAX_OUTPUT) + "\n\n... (output truncated)";
    }

    await ctx.reply(`\`\`\`\n${output}\n\`\`\``, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Command failed: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

// Store for CLI mode state per user
const cliModeState = new Map<string, number>();

export function setCLIMode(userId: string, serverId: number) {
  cliModeState.set(userId, serverId);
}

export function getCLIMode(userId: string): number | undefined {
  return cliModeState.get(userId);
}

export function clearCLIMode(userId: string) {
  cliModeState.delete(userId);
}

// Log viewing handlers
export async function handleNginxErrorLog(ctx: ServerActionCallbackContext) {
  await handleLog(ctx, "nginx_error", async (connection) => {
    const result = await getNginxErrorLog(connection, 50);
    return result;
  });
}

export async function handleNginxAccessLog(ctx: ServerActionCallbackContext) {
  await handleLog(ctx, "nginx_access", async (connection) => {
    const result = await getNginxAccessLog(connection, 50);
    return result;
  });
}

export async function handlePM2LogView(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: pm2log_<serverId>_<appName>
  const match = data.match(/^pm2log_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const appName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Fetching PM2 log for ${appName}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await getPM2Log(connectResult.connection, appName, 50);

    let output = result.log || "(no output)";
    if (result.truncated) {
      output += "\n\n... (log truncated)";
    }

    const message = `📦 PM2 Log — ${appName}\n\n\`\`\`\n${output}\n\`\`\``;
    const truncatedMsg = message.length > 4096 ? output : message;

    await ctx.reply(truncatedMsg.length > 4096 ? `\`\`\`\n${output.substring(0, 3800)}\n\`\`\`\n... (truncated)` : message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `pm2log_${serverId}_${appName}` }],
          [{ text: "🔙 Back to Logs", callback_data: `log_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get log: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

export async function handleDockerLogView(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: docklog_<serverId>_<containerName>
  const match = data.match(/^docklog_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const containerName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Fetching Docker log for ${containerName}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await getDockerLog(connectResult.connection, containerName, 50);

    let output = result.log || "(no output)";
    if (result.truncated) {
      output += "\n\n... (log truncated)";
    }

    const message = `🐳 Docker Log — ${containerName}\n\n\`\`\`\n${output}\n\`\`\``;
    const truncatedMsg = message.length > 4096 ? output : message;

    await ctx.reply(truncatedMsg.length > 4096 ? `\`\`\`\n${output.substring(0, 3800)}\n\`\`\`\n... (truncated)` : message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `docklog_${serverId}_${containerName}` }],
          [{ text: "🔙 Back to Logs", callback_data: `log_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get log: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

export async function handleJournalLog(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  const serverId = extractServerId(data);
  if (!serverId) return;

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  // Ask for service name
  await ctx.reply("Enter the systemd service name to view its journal log:\n(e.g., nginx, sshd, docker)");

  // Store state that we're waiting for service name
  cliModeState.set(`journal_${userId}`, serverId);
}

// Handle journal log with service name
export async function handleJournalLogWithService(ctx: ServerActionCallbackContext) {
  const callbackQuery = ctx.callbackQuery;
  if (!("data" in callbackQuery)) return;

  const data = (callbackQuery as { data: string }).data;
  // Format: journal_<serverId>_<serviceName>
  const match = data.match(/^journal_(\d+)_(.+)$/);
  if (!match) return;

  const serverId = parseInt(match[1], 10);
  const serviceName = match[2];

  await ctx.answerCbQuery();

  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const serverConfig = await getServerConfig(userId, serverId);
  if (!serverConfig) {
    await ctx.reply("Server not found.");
    return;
  }

  await ctx.reply(`⏳ Fetching journal log for ${serviceName}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await getJournalLog(connectResult.connection, serviceName, 50);

    let output = result.log || "(no output)";
    if (result.truncated) {
      output += "\n\n... (log truncated)";
    }

    const message = `📜 Journal Log — ${serviceName}\n\n\`\`\`\n${output}\n\`\`\``;

    await ctx.reply(message.length > 4096 ? `\`\`\`\n${output.substring(0, 3800)}\n\`\`\`\n... (truncated)` : message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `journal_${serverId}_${serviceName}` }],
          [{ text: "🔙 Back to Logs", callback_data: `log_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get log: ${(error as Error).message}`);
  } finally {
    connectResult.connection.dispose();
  }
}

// Helper function for log handling
async function handleLog(
  ctx: ServerActionCallbackContext,
  logType: string,
  fetchLog: (connection: any) => Promise<{ success: boolean; log: string; truncated?: boolean; error?: string }>
) {
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

  const logTitle = logType === "nginx_error" ? "Nginx Error Log" : "Nginx Access Log";

  await ctx.reply(`⏳ Fetching ${logTitle}...`);

  const connectResult = await connectSSH(serverConfig);
  if (!connectResult.success || !connectResult.connection) {
    await ctx.reply(`❌ Connection failed: ${connectResult.error}`);
    return;
  }

  try {
    const result = await fetchLog(connectResult.connection);

    if (!result.success && !result.log) {
      await ctx.reply(`❌ Failed to fetch log: ${result.error || "Unknown error"}`);
      return;
    }

    let output = result.log || "(no output)";
    if (result.truncated) {
      output += "\n\n... (log truncated)";
    }

    const message = `${logTitle} — ${serverName}\n\n\`\`\`\n${output}\n\`\`\``;

    await ctx.reply(message.length > 4096 ? `\`\`\`\n${output.substring(0, 3800)}\n\`\`\`\n... (truncated)` : message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `${logType === "nginx_error" ? "ngxerrorlog" : "ngxaccesslog"}_${serverId}` }],
          [{ text: "🔙 Back to Logs", callback_data: `log_${serverId}` }],
        ],
      },
    });
  } catch (error) {
    await ctx.reply(`❌ Failed to get log: ${(error as Error).message}`);
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
