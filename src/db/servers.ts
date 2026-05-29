import db from "./index";
import { encrypt, decrypt } from "../services/crypto";

export interface ServerConfig {
  id?: number;
  userId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "ssh_key";
  credential: string; // plain password or SSH key path - will be encrypted before storage
}

interface ServerRow {
  id: number;
  user_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "ssh_key";
  credential: string;
  created_at: number;
  updated_at: number;
}

/**
 * Add a new server for a user
 * Credentials are encrypted before storage
 */
export function addServer(config: ServerConfig): number {
  const encryptedCredential = encrypt(config.credential);

  const stmt = db.prepare(`
    INSERT INTO servers (user_id, name, host, port, username, auth_type, credential)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    config.userId,
    config.name,
    config.host,
    config.port,
    config.username,
    config.authType,
    encryptedCredential
  );

  return result.lastInsertRowid as number;
}

/**
 * Get all servers belonging to a user
 * Credentials are decrypted before returning
 */
export function getServers(userId: string): Omit<ServerConfig, "credential">[] {
  const stmt = db.prepare(`
    SELECT id, user_id, name, host, port, username, auth_type, created_at, updated_at
    FROM servers
    WHERE user_id = ?
    ORDER BY name ASC
  `);

  const rows = stmt.all(userId) as Array<Omit<ServerRow, "credential" | "auth_type"> & { auth_type: string }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    authType: row.auth_type as "password" | "ssh_key",
  }));
}

/**
 * Get a single server by ID with decrypted credential
 */
export function getServerById(userId: string, serverId: number): (ServerConfig & { createdAt: number; updatedAt: number }) | null {
  const stmt = db.prepare(`
    SELECT id, user_id, name, host, port, username, auth_type, credential, created_at, updated_at
    FROM servers
    WHERE id = ? AND user_id = ?
  `);

  const row = stmt.get(serverId, userId) as ServerRow | undefined;

  if (!row) {
    return null;
  }

  const decryptedCredential = decrypt(row.credential);

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    authType: row.auth_type,
    credential: decryptedCredential,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Delete a server by ID (only if owned by user)
 */
export function deleteServer(userId: string, serverId: number): boolean {
  const stmt = db.prepare(`
    DELETE FROM servers
    WHERE id = ? AND user_id = ?
  `);

  const result = stmt.run(serverId, userId);
  return result.changes > 0;
}

/**
 * Check if a server with the same name already exists for a user
 */
export function serverExists(userId: string, name: string): boolean {
  const stmt = db.prepare(`
    SELECT 1 FROM servers WHERE user_id = ? AND name = ? LIMIT 1
  `);

  return stmt.get(userId, name) !== undefined;
}

/**
 * Get all server names for a user (for display)
 */
export function getServerNames(userId: string): { id: number; name: string }[] {
  const stmt = db.prepare(`
    SELECT id, name FROM servers WHERE user_id = ? ORDER BY name ASC
  `);

  return stmt.all(userId) as { id: number; name: string }[];
}
