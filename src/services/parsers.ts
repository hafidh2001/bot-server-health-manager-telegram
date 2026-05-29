import { NodeSSH } from "node-ssh";
import { executeCommand } from "./ssh";

// ─────────────────────────────────────────────────────────────
// BE-04a: Server Specification
// ─────────────────────────────────────────────────────────────

export interface ServerSpecs {
  hostname: string;
  os: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  architecture: string;
  uptime: string;
}

/**
 * Get server specifications
 */
export async function getServerSpecs(connection: NodeSSH): Promise<ServerSpecs> {
  const [unameResult, osReleaseResult, cpuInfoResult, coreCountResult, uptimeResult] = await Promise.all([
    executeCommand(connection, "uname -n"),
    executeCommand(connection, "cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || echo 'Unknown OS'"),
    executeCommand(connection, "lscpu | grep 'Model name' | cut -d: -f2 | xargs"),
    executeCommand(connection, "nproc"),
    executeCommand(connection, "uptime -p 2>/dev/null || uptime"),
  ]);

  const hostname = unameResult.stdout.trim() || "Unknown";

  // Parse OS release
  let os = "Unknown";
  const osLines = osReleaseResult.stdout.split("\n");
  for (const line of osLines) {
    if (line.startsWith("PRETTY_NAME=")) {
      os = line.split("=")[1]?.replace(/"/g, "") || "Unknown";
      break;
    } else if (line.startsWith("NAME=")) {
      const name = line.split("=")[1]?.replace(/"/g, "") || "";
      const versionLine = osLines.find((l) => l.startsWith("VERSION="));
      const version = versionLine?.split("=")[1]?.replace(/"/g, "") || "";
      os = version ? `${name} ${version}` : name;
    }
  }

  // Get kernel version
  const kernelResult = await executeCommand(connection, "uname -r");
  const kernel = kernelResult.stdout.trim() || "Unknown";

  // Parse CPU info
  const cpuModel = cpuInfoResult.stdout.trim() || "Unknown";
  const cpuCores = parseInt(coreCountResult.stdout.trim(), 10) || 1;

  // Get architecture
  const archResult = await executeCommand(connection, "uname -m");
  const architecture = archResult.stdout.trim() || "Unknown";

  // Parse uptime
  const uptime = uptimeResult.stdout.trim() || "Unknown";

  return {
    hostname,
    os,
    kernel,
    cpuModel,
    cpuCores,
    architecture,
    uptime,
  };
}

// ─────────────────────────────────────────────────────────────
// BE-04b: Disk Usage
// ─────────────────────────────────────────────────────────────

export interface DiskPartition {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountedOn: string;
}

/**
 * Get disk usage for all partitions
 */
export async function getDiskUsage(connection: NodeSSH): Promise<DiskPartition[]> {
  const result = await executeCommand(connection, "df -h --output=source,size,used,avail,pcent,target 2>/dev/null | tail -n +2");

  if (!result.stdout.trim()) {
    return [];
  }

  const lines = result.stdout.trim().split("\n");
  const partitions: DiskPartition[] = [];

  for (const line of lines) {
    // Skip lines that don't have 6 columns (like tmpfs, devtmpfs)
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;

    const [filesystem, size, used, available, usePercentStr, mountedOn] = parts;

    // Skip虚拟文件系统
    if (filesystem.startsWith("tmpfs") || filesystem.startsWith("devtmpfs") || filesystem === "none") {
      continue;
    }

    const usePercent = parseInt(usePercentStr.replace("%", ""), 10) || 0;

    partitions.push({
      filesystem,
      size,
      used,
      available,
      usePercent,
      mountedOn,
    });
  }

  return partitions;
}

// ─────────────────────────────────────────────────────────────
// BE-04c: Memory Usage
// ─────────────────────────────────────────────────────────────

export interface MemoryUsage {
  ramTotal: string;
  ramUsed: string;
  ramFree: string;
  ramAvailable: string;
  ramUsedPercent: number;
  swapTotal: string;
  swapUsed: string;
  swapFree: string;
  swapUsedPercent: number;
}

/**
 * Get memory usage (RAM and Swap)
 */
export async function getMemoryUsage(connection: NodeSSH): Promise<MemoryUsage> {
  const result = await executeCommand(connection, "free -b");

  if (!result.stdout.trim()) {
    return {
      ramTotal: "0",
      ramUsed: "0",
      ramFree: "0",
      ramAvailable: "0",
      ramUsedPercent: 0,
      swapTotal: "0",
      swapUsed: "0",
      swapFree: "0",
      swapUsedPercent: 0,
    };
  }

  const lines = result.stdout.trim().split("\n");
  let ramTotal = "0", ramUsed = "0", ramFree = "0", ramAvailable = "0";
  let swapTotal = "0", swapUsed = "0", swapFree = "0";

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "Mem:") {
      ramTotal = parts[1] || "0";
      ramUsed = parts[2] || "0";
      ramFree = parts[3] || "0";
      // Available is the last column (6th position in free -b output)
      ramAvailable = parts[parts.length - 1] || ramFree;
    } else if (parts[0] === "Swap:") {
      swapTotal = parts[1] || "0";
      swapUsed = parts[2] || "0";
      swapFree = parts[3] || "0";
    }
  }

  // Calculate percentages (free -b outputs in bytes)
  const ramTotalNum = parseInt(ramTotal, 10) || 0;
  const ramUsedNum = parseInt(ramUsed, 10) || 0;
  const ramUsedPercent = ramTotalNum > 0 ? Math.round((ramUsedNum / ramTotalNum) * 100) : 0;

  const swapTotalNum = parseInt(swapTotal, 10) || 0;
  const swapUsedNum = parseInt(swapUsed, 10) || 0;
  const swapUsedPercent = swapTotalNum > 0 ? Math.round((swapUsedNum / swapTotalNum) * 100) : 0;

  return {
    ramTotal: formatBytes(ramTotalNum),
    ramUsed: formatBytes(ramUsedNum),
    ramFree: formatBytes(parseInt(ramFree, 10) || 0),
    ramAvailable: formatBytes(parseInt(ramAvailable, 10) || 0),
    ramUsedPercent,
    swapTotal: formatBytes(swapTotalNum),
    swapUsed: formatBytes(swapUsedNum),
    swapFree: formatBytes(parseInt(swapFree, 10) || 0),
    swapUsedPercent,
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ─────────────────────────────────────────────────────────────
// BE-04d: Service Detection
// ─────────────────────────────────────────────────────────────

export interface ServerTools {
  hasPm2: boolean;
  hasDocker: boolean;
  hasNginx: boolean;
  hasSystemctl: boolean;
}

/**
 * Check which tools are available on the server
 */
export async function detectServerTools(connection: NodeSSH): Promise<ServerTools> {
  const commands = [
    "command -v pm2 >/dev/null 2>&1 && echo 'PM2:OK' || echo 'PM2:NO'",
    "command -v docker >/dev/null 2>&1 && echo 'DOCKER:OK' || echo 'DOCKER:NO'",
    "command -v nginx >/dev/null 2>&1 && echo 'NGINX:OK' || echo 'NGINX:NO'",
    "command -v systemctl >/dev/null 2>&1 && echo 'SYSTEMCTL:OK' || echo 'SYSTEMCTL:NO'",
  ];

  const results = await Promise.all(commands.map((cmd) => executeCommand(connection, cmd)));
  const combinedOutput = results.map((r) => r.stdout.trim()).join("\n");

  return {
    hasPm2: combinedOutput.includes("PM2:OK"),
    hasDocker: combinedOutput.includes("DOCKER:OK"),
    hasNginx: combinedOutput.includes("NGINX:OK"),
    hasSystemctl: combinedOutput.includes("SYSTEMCTL:OK"),
  };
}

// ─────────────────────────────────────────────────────────────
// BE-04e: PM2 List
// ─────────────────────────────────────────────────────────────

export interface PM2App {
  name: string;
  status: "online" | "stopped" | "errored" | "restarting" | "unknown";
  cpu: number;
  memory: number;
  uptime: string;
  restarts: number;
}

/**
 * Get list of PM2 applications
 */
export async function getPM2List(connection: NodeSSH): Promise<PM2App[]> {
  const result = await executeCommand(connection, "pm2 jlist 2>/dev/null");

  if (!result.stdout.trim()) {
    // Try alternative command if jlist fails
    const altResult = await executeCommand(connection, "pm2 list --json 2>/dev/null || echo '[]'");
    if (!altResult.stdout.trim()) {
      return [];
    }
    return parsePM2List(altResult.stdout);
  }

  return parsePM2List(result.stdout);
}

function parsePM2List(jsonOutput: string): PM2App[] {
  try {
    const data = JSON.parse(jsonOutput);
    if (!Array.isArray(data)) return [];

    return data.map((app: any) => ({
      name: app.name || "unknown",
      status: mapPM2Status(app.pm2_env?.status || app.status || "unknown"),
      cpu: app.monit?.cpu || 0,
      memory: app.monit?.memory || 0,
      uptime: formatUptime(app.pm2_env?.pm_uptime ? Date.now() - app.pm2_env.pm_uptime : 0),
      restarts: app.pm2_env?.restart_time || app.restart_time || 0,
    }));
  } catch {
    return [];
  }
}

function mapPM2Status(status: string): PM2App["status"] {
  switch (status.toLowerCase()) {
    case "online":
      return "online";
    case "stopped":
    case "stopped":
      return "stopped";
    case "errored":
      return "errored";
    case "restarting":
      return "restarting";
    default:
      return "unknown";
  }
}

function formatUptime(ms: number): string {
  if (ms <= 0) return "0m";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// ─────────────────────────────────────────────────────────────
// BE-04f: Docker List
// ─────────────────────────────────────────────────────────────

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "restarting" | "unknown";
  ports: string;
}

/**
 * Get list of Docker containers
 */
export async function getDockerContainers(connection: NodeSSH): Promise<DockerContainer[]> {
  // Use JSON format for easier parsing
  const result = await executeCommand(
    connection,
    "docker ps -a --format '{{json .}}' 2>/dev/null"
  );

  if (!result.stdout.trim()) {
    return [];
  }

  const containers: DockerContainer[] = [];
  const lines = result.stdout.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const data = JSON.parse(line);
      containers.push({
        id: data.ID || "",
        name: data.Names || "",
        image: data.Image || "",
        status: data.Status || "",
        state: mapDockerState(data.State || ""),
        ports: data.Ports || "",
      });
    } catch {
      // Skip malformed JSON lines
    }
  }

  return containers;
}

function mapDockerState(state: string): DockerContainer["state"] {
  switch (state.toLowerCase()) {
    case "running":
      return "running";
    case "exited":
      return "exited";
    case "paused":
      return "paused";
    case "restarting":
      return "restarting";
    default:
      return "unknown";
  }
}

// ─────────────────────────────────────────────────────────────
// BE-05: Service Management (Restart)
// ─────────────────────────────────────────────────────────────

export interface RestartResult {
  success: boolean;
  message: string;
}

/**
 * Restart a PM2 application
 */
export async function restartPM2(connection: NodeSSH, appName: string): Promise<RestartResult> {
  const result = await executeCommand(connection, `pm2 restart ${appName} 2>&1`);
  const success = result.code === 0 && !result.stderr.includes("error");

  return {
    success,
    message: success
      ? `PM2 app '${appName}' restarted successfully`
      : `Failed to restart PM2 app: ${result.stderr || result.stdout}`,
  };
}

/**
 * Restart a Docker container
 */
export async function restartDockerContainer(connection: NodeSSH, containerName: string): Promise<RestartResult> {
  const result = await executeCommand(connection, `docker restart ${containerName} 2>&1`);
  const success = result.code === 0;

  return {
    success,
    message: success
      ? `Container '${containerName}' restarted successfully`
      : `Failed to restart container: ${result.stderr || result.stdout}`,
  };
}

/**
 * Restart Nginx
 */
export async function restartNginx(connection: NodeSSH): Promise<RestartResult> {
  const result = await executeCommand(connection, `sudo systemctl restart nginx 2>&1`);
  const success = result.code === 0;

  return {
    success,
    message: success
      ? "Nginx restarted successfully"
      : `Failed to restart Nginx: ${result.stderr || result.stdout}`,
  };
}

/**
 * Restart a systemd service
 */
export async function restartSystemdService(connection: NodeSSH, serviceName: string): Promise<RestartResult> {
  const result = await executeCommand(connection, `sudo systemctl restart ${serviceName} 2>&1`);
  const success = result.code === 0;

  return {
    success,
    message: success
      ? `Service '${serviceName}' restarted successfully`
      : `Failed to restart service: ${result.stderr || result.stdout}`,
  };
}

// ─────────────────────────────────────────────────────────────
// BE-06: Log Viewer
// ─────────────────────────────────────────────────────────────

export interface LogResult {
  success: boolean;
  log: string;
  truncated: boolean;
  error?: string;
}

const MAX_LOG_LENGTH = 3800; // Leave room for prefix text

/**
 * Get Nginx error log
 */
export async function getNginxErrorLog(connection: NodeSSH, lines: number = 50): Promise<LogResult> {
  return getLog(connection, `/var/log/nginx/error.log`, lines);
}

/**
 * Get Nginx access log
 */
export async function getNginxAccessLog(connection: NodeSSH, lines: number = 50): Promise<LogResult> {
  return getLog(connection, `/var/log/nginx/access.log`, lines);
}

/**
 * Get Docker container log
 */
export async function getDockerLog(connection: NodeSSH, containerName: string, lines: number = 50): Promise<LogResult> {
  const result = await executeCommand(
    connection,
    `docker logs --tail ${lines} ${containerName} 2>&1`
  );

  return {
    success: result.code === 0 || result.stdout.trim().length > 0,
    log: result.stdout,
    truncated: false,
    error: result.code !== 0 && !result.stdout ? result.stderr : undefined,
  };
}

/**
 * Get PM2 log
 */
export async function getPM2Log(connection: NodeSSH, appName: string, lines: number = 50): Promise<LogResult> {
  const result = await executeCommand(
    connection,
    `pm2 logs ${appName} --lines ${lines} --nostream 2>&1`
  );

  return {
    success: result.code === 0,
    log: result.stdout,
    truncated: false,
    error: result.code !== 0 ? result.stderr : undefined,
  };
}

/**
 * Get journalctl log
 */
export async function getJournalLog(
  connection: NodeSSH,
  serviceName: string,
  lines: number = 50
): Promise<LogResult> {
  return getLog(connection, `journalctl -u ${serviceName} -n ${lines} --no-pager 2>&1`, lines, false);
}

async function getLog(
  connection: NodeSSH,
  command: string,
  lines: number,
  useTail: boolean = true
): Promise<LogResult> {
  const actualCommand = useTail
    ? `tail -n ${lines} ${command.startsWith("/") ? command : command.split(" ").slice(2).join(" ")}`
    : command;

  const result = useTail
    ? await executeCommand(connection, `tail -n ${lines} ${command}`)
    : await executeCommand(connection, command);

  let log = result.stdout;
  let truncated = false;

  if (log.length > MAX_LOG_LENGTH) {
    log = log.substring(0, MAX_LOG_LENGTH) + "\n\n... (dipotong)";
    truncated = true;
  }

  return {
    success: result.code === 0 || log.length > 0,
    log,
    truncated,
    error: result.code !== 0 && !log ? result.stderr : undefined,
  };
}
