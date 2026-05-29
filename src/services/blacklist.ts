/**
 * Command Blacklist for CLI Mode
 * These commands are blocked for security reasons
 */

export const BLACKLISTED_COMMANDS = [
  // Destructive commands
  "rm -rf /",
  "rm -rf /*",
  "rm -rf /home",
  "rm -rf /var",
  "rm -rf /etc",
  "rm -rf /usr",
  "rm -rf /bin",
  "rm -rf /sbin",
  "rm -rf /lib",
  "rm -rf /lib64",
  "rm -rf /boot",
  "rm -rf /sys",
  "rm -rf /proc",
  "rm -rf /dev",
  "rm -rf /run",
  "rm -rf /root",
  "rm -rf /tmp",
  "rm -rf /mnt",
  "rm -rf /media",
  "rm -rf /opt",
  "rm -rf /srv",
  "rm -rf /snap",
  "rm -rf /lost+found",

  // Shutdown and reboot
  "shutdown",
  "shutdown -h",
  "shutdown -r",
  "shutdown -p",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",

  // Filesystem operations
  "mkfs",
  "mkfs.ext4",
  "mkfs.xfs",
  "mkfs.ntfs",
  "dd if=",
  "dd of=",

  // Permission changes
  "chmod 777 /",
  "chmod -R 777 /",
  "chown -R /",
  "chown -R nobody:nobody /",
  "chmod -R 777 /etc",
  "chmod -R 777 /var",
  "chmod -R 777 /home",

  // Network manipulation
  "iptables -F",
  "iptables -X",
  "iptables -Z",
  "iptables -P INPUT ACCEPT",
  "iptables -P FORWARD ACCEPT",
  "iptables -P OUTPUT ACCEPT",
  "ufw disable",
  "systemctl stop firewalld",

  // Service manipulation
  "systemctl disable firewalld",
  "service iptables stop",

  // User manipulation
  "userdel",
  "useradd",
  "deluser",
  "adduser",

  // Package manipulation
  "apt-get remove --purge",
  "apt-get purge",
  "yum remove",
  "dnf remove",
  "pacman -Rcs",

  // Kernel operations
  "modprobe -r",
  "rmmod",

  // Write to raw devices
  "> /dev/sda",
  ">> /dev/sda",
  "cat /dev/zero > /dev/sda",

  // Crontab manipulation
  "crontab -r",
  "crontab -d",

  // SSH key manipulation
  "rm ~/.ssh/authorized_keys",

  // Environment
  "export HISTSIZE=0",
  "history -c",
  "history -w",
];

// Patterns that match dangerous commands (regex)
export const BLACKLISTED_PATTERNS = [
  /^rm\s+-rf\s+\/.*$/i,
  /^rm\s+-rf\s+\/$/i,
  /^dd\s+if=/i,
  /^dd\s+of=/i,
  /^mkfs/i,
  /^shutdown/i,
  /^reboot/i,
  /^halt/i,
  /^poweroff/i,
  /^init\s+[06]$/i,
  /^chmod\s+777\s+\/$/i,
  /^chown\s+-R\s+.*\s+\/$/i,
  /^>:?\s*\/dev\/sd/i,
  /^curl.*sh\s*\|\s*sh$/i, // Pipe to shell
  /^wget.*sh\s*\|\s*sh$/i, // Pipe to shell
  /^python.*-m\s+http\.server.*0\.0\.0\.0:80$/i, // HTTP server on port 80
];

/**
 * Check if a command is blacklisted
 */
export function isCommandBlacklisted(command: string): boolean {
  const trimmedCommand = command.trim();

  // Check exact matches (case insensitive)
  for (const blocked of BLACKLISTED_COMMANDS) {
    if (trimmedCommand.toLowerCase() === blocked.toLowerCase()) {
      return true;
    }
    // Check if command starts with blocked prefix (for partial matches)
    if (trimmedCommand.toLowerCase().startsWith(blocked.toLowerCase() + " ")) {
      return true;
    }
  }

  // Check pattern matches
  for (const pattern of BLACKLISTED_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the reason why a command is blocked
 */
export function getBlacklistReason(command: string): string | null {
  const trimmedCommand = command.trim();

  if (trimmedCommand.match(/^rm\s+-rf\s+\//)) {
    return "Command 'rm -rf' ke root directory diblokir";
  }
  if (trimmedCommand.match(/^shutdown|^reboot|^halt|^poweroff/)) {
    return "Command shutdown/reboot diblokir";
  }
  if (trimmedCommand.match(/^dd\s+if=|^dd\s+of=|^mkfs/)) {
    return "Command dd/mkfs ke device diblokir";
  }
  if (trimmedCommand.match(/^chmod\s+777\s+\/|^chown\s+-R\s+.*\s+\/$/)) {
    return "Command mengubah permission root diblokir";
  }
  if (trimmedCommand.match(/>:?\s*\/dev\/sd/)) {
    return "Menulis langsung ke block device diblokir";
  }

  return "Command ini termasuk dalam command berbahaya yang diblokir";
}
