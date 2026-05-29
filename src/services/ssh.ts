import { NodeSSH, SSHExecCommandResponse } from "node-ssh";
import { readFileSync, existsSync } from "fs";

const SSH_TIMEOUT_MS = parseInt(process.env.SSH_TIMEOUT_MS || "15000", 10);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
  authType: "password" | "ssh_key";
  credential: string; // plain password or path to SSH key
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string | null;
}

export interface ConnectionResult {
  success: boolean;
  connection?: NodeSSH;
  error?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connect to SSH server with retry mechanism
 */
export async function connectSSH(config: ServerConfig): Promise<ConnectionResult> {
  const ssh = new NodeSSH();

  const sshConfig: Parameters<typeof ssh.connect>[0] = {
    host: config.host,
    port: config.port,
    username: config.username,
    timeout: SSH_TIMEOUT_MS,
    tryKeyboard: false,
    onKeyboardInteractive: () => false,
  };

  // Set authentication based on type
  if (config.authType === "password") {
    sshConfig.password = config.credential;
  } else {
    // SSH key authentication
    const keyPath = config.credential;
    if (!existsSync(keyPath)) {
      return { success: false, error: `SSH key file not found: ${keyPath}` };
    }
    sshConfig.privateKey = readFileSync(keyPath);
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SSH] Connecting to ${config.host}:${config.port} (attempt ${attempt}/${MAX_RETRIES})...`);
      await ssh.connect(sshConfig);
      console.log(`[SSH] Connected successfully to ${config.host}`);
      return { success: true, connection: ssh };
    } catch (err) {
      lastError = err as Error;
      console.log(`[SSH] Connection attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
      }
    }
  }

  const errorMsg = lastError?.message || "Unknown error";
  console.log(`[SSH] Failed to connect after ${MAX_RETRIES} attempts: ${errorMsg}`);
  return { success: false, error: `Connection failed: ${errorMsg}` };
}

/**
 * Execute a command on the SSH connection
 */
export async function executeCommand(
  connection: NodeSSH,
  command: string
): Promise<CommandResult> {
  try {
    const result: SSHExecCommandResponse = await connection.execCommand(command);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      signal: result.signal,
    };
  } catch (err) {
    const error = err as Error;
    return {
      stdout: "",
      stderr: error.message,
      code: -1,
    };
  }
}

/**
 * Test SSH connection without keeping it open
 */
export async function testConnection(config: ServerConfig): Promise<TestConnectionResult> {
  const result = await connectSSH(config);

  if (result.success && result.connection) {
    // Connection successful, disconnect immediately
    result.connection.dispose();
    return {
      success: true,
      message: `Successfully connected to ${config.host}:${config.port}`,
    };
  }

  return {
    success: false,
    message: result.error || "Unknown error",
  };
}

/**
 * Execute command with automatic connection handling
 * Convenience function that connects, executes, and disconnects
 */
export async function execOnServer(
  config: ServerConfig,
  command: string
): Promise<CommandResult> {
  const connectResult = await connectSSH(config);

  if (!connectResult.success || !connectResult.connection) {
    return {
      stdout: "",
      stderr: connectResult.error || "Failed to connect",
      code: -1,
    };
  }

  const result = await executeCommand(connectResult.connection, command);

  // Always disconnect after execution
  connectResult.connection.dispose();

  return result;
}

/**
 * Check if required tools are available on the server
 */
export async function checkServerTools(connection: NodeSSH): Promise<{
  hasPm2: boolean;
  hasDocker: boolean;
  hasNginx: boolean;
  hasSystemctl: boolean;
}> {
  const checkCommand = `
    command -v pm2 >/dev/null 2>&1 && echo "PM2:OK" || echo "PM2:NO";
    command -v docker >/dev/null 2>&1 && echo "DOCKER:OK" || echo "DOCKER:NO";
    command -v nginx >/dev/null 2>&1 && echo "NGINX:OK" || echo "NGINX:NO";
    command -v systemctl >/dev/null 2>&1 && echo "SYSTEMCTL:OK" || echo "SYSTEMCTL:NO";
  `.trim();

  const result = await executeCommand(connection, checkCommand);
  const output = result.stdout;

  return {
    hasPm2: output.includes("PM2:OK"),
    hasDocker: output.includes("DOCKER:OK"),
    hasNginx: output.includes("NGINX:OK"),
    hasSystemctl: output.includes("SYSTEMCTL:OK"),
  };
}
