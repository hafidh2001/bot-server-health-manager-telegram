import { NodeSSH } from "node-ssh";
import { ServerConfig } from "./ssh";
import { executeCommand, connectSSH } from "./ssh";
import { isCommandBlacklisted, getBlacklistReason } from "./blacklist";

export interface CLIResult {
  success: boolean;
  output: string;
  error?: string;
  blocked?: boolean;
  blockedReason?: string;
}

export interface CLISession {
  userId: string;
  serverId: number;
  serverName: string;
  serverConfig: ServerConfig;
  active: boolean;
}

/**
 * Execute a CLI command with blacklist check
 */
export async function executeCLICommand(
  session: CLISession,
  command: string
): Promise<CLIResult> {
  // Check blacklist first
  if (isCommandBlacklisted(command)) {
    return {
      success: false,
      output: "",
      blocked: true,
      blockedReason: getBlacklistReason(command) || "Command diblokir karena termasuk command berbahaya",
    };
  }

  // Connect to server
  const connectResult = await connectSSH(session.serverConfig);

  if (!connectResult.success || !connectResult.connection) {
    return {
      success: false,
      output: "",
      error: `Gagal terhubung ke server: ${connectResult.error}`,
    };
  }

  // Execute command
  const result = await executeCommand(connectResult.connection, command);

  // Always disconnect
  connectResult.connection.dispose();

  if (result.code === 0 || result.stdout) {
    return {
      success: true,
      output: result.stdout || "(no output)",
      error: result.stderr || undefined,
    };
  } else {
    return {
      success: false,
      output: result.stdout,
      error: result.stderr || `Command exited with code ${result.code}`,
    };
  }
}

/**
 * Check if a command would be blocked without executing it
 */
export function checkCommand(command: string): { blocked: boolean; reason?: string } {
  if (isCommandBlacklisted(command)) {
    return {
      blocked: true,
      reason: getBlacklistReason(command) || "Command diblokir",
    };
  }
  return { blocked: false };
}
