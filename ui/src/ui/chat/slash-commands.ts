import { t } from "../../i18n/lib/translate.ts";
import type { IconName } from "../icons.ts";

export type SlashCommandCategory = "session" | "model" | "agents" | "tools";

export type SlashCommandDef = {
  name: string;
  description: string;
  args?: string;
  icon?: IconName;
  category?: SlashCommandCategory;
  /** When true, the command is executed client-side via RPC instead of sent to the agent. */
  executeLocal?: boolean;
  /** Fixed argument choices for inline hints. */
  argOptions?: string[];
  /** Keyboard shortcut hint shown in the menu (display only). */
  shortcut?: string;
};

export const SLASH_COMMANDS: SlashCommandDef[] = [
  // ── Session ──
  {
    name: "new",
    description: t("slashCommands.commands.new"),
    icon: "plus",
    category: "session",
    executeLocal: true,
  },
  {
    name: "reset",
    description: t("slashCommands.commands.reset"),
    icon: "refresh",
    category: "session",
    executeLocal: true,
  },
  {
    name: "compact",
    description: t("slashCommands.commands.compact"),
    icon: "loader",
    category: "session",
    executeLocal: true,
  },
  {
    name: "stop",
    description: t("slashCommands.commands.stop"),
    icon: "stop",
    category: "session",
    executeLocal: true,
  },
  {
    name: "clear",
    description: t("slashCommands.commands.clear"),
    icon: "trash",
    category: "session",
    executeLocal: true,
  },
  {
    name: "focus",
    description: t("slashCommands.commands.focus"),
    icon: "eye",
    category: "session",
    executeLocal: true,
  },

  // ── Model ──
  {
    name: "model",
    description: t("slashCommands.commands.model"),
    args: "<name>",
    icon: "brain",
    category: "model",
    executeLocal: true,
  },
  {
    name: "think",
    description: t("slashCommands.commands.think"),
    args: "<level>",
    icon: "brain",
    category: "model",
    executeLocal: true,
    argOptions: ["off", "low", "medium", "high"],
  },
  {
    name: "verbose",
    description: t("slashCommands.commands.verbose"),
    args: "<on|off|full>",
    icon: "terminal",
    category: "model",
    executeLocal: true,
    argOptions: ["on", "off", "full"],
  },
  {
    name: "fast",
    description: t("slashCommands.commands.fast"),
    args: "<status|on|off>",
    icon: "zap",
    category: "model",
    executeLocal: true,
    argOptions: ["status", "on", "off"],
  },

  // ── Tools ──
  {
    name: "help",
    description: t("slashCommands.commands.help"),
    icon: "book",
    category: "tools",
    executeLocal: true,
  },
  {
    name: "status",
    description: t("slashCommands.commands.status"),
    icon: "barChart",
    category: "tools",
  },
  {
    name: "export",
    description: t("slashCommands.commands.export"),
    icon: "download",
    category: "tools",
    executeLocal: true,
  },
  {
    name: "usage",
    description: t("slashCommands.commands.usage"),
    icon: "barChart",
    category: "tools",
    executeLocal: true,
  },

  // ── Agents ──
  {
    name: "agents",
    description: t("slashCommands.commands.agents"),
    icon: "monitor",
    category: "agents",
    executeLocal: true,
  },
  {
    name: "kill",
    description: t("slashCommands.commands.kill"),
    args: "<id|all>",
    icon: "x",
    category: "agents",
    executeLocal: true,
  },
  {
    name: "skill",
    description: t("slashCommands.commands.skill"),
    args: "<name>",
    icon: "zap",
    category: "tools",
  },
  {
    name: "steer",
    description: t("slashCommands.commands.steer"),
    args: "<id> <msg>",
    icon: "send",
    category: "agents",
  },
];

const CATEGORY_ORDER: SlashCommandCategory[] = ["session", "model", "tools", "agents"];

export const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
  session: t("slashCommands.categories.session"),
  model: t("slashCommands.categories.model"),
  agents: t("slashCommands.categories.agents"),
  tools: t("slashCommands.categories.tools"),
};

export function getSlashCommandCompletions(filter: string): SlashCommandDef[] {
  const lower = filter.toLowerCase();
  const commands = lower
    ? SLASH_COMMANDS.filter(
        (cmd) => cmd.name.startsWith(lower) || cmd.description.toLowerCase().includes(lower),
      )
    : SLASH_COMMANDS;
  return commands.toSorted((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category ?? "session");
    const bi = CATEGORY_ORDER.indexOf(b.category ?? "session");
    if (ai !== bi) {
      return ai - bi;
    }
    // Exact prefix matches first
    if (lower) {
      const aExact = a.name.startsWith(lower) ? 0 : 1;
      const bExact = b.name.startsWith(lower) ? 0 : 1;
      if (aExact !== bExact) {
        return aExact - bExact;
      }
    }
    return 0;
  });
}

export type ParsedSlashCommand = {
  command: SlashCommandDef;
  args: string;
};

/**
 * Parse a message as a slash command. Returns null if it doesn't match.
 * Supports `/command`, `/command args...`, and `/command: args...`.
 */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const body = trimmed.slice(1);
  const firstSeparator = body.search(/[\s:]/u);
  const name = firstSeparator === -1 ? body : body.slice(0, firstSeparator);
  let remainder = firstSeparator === -1 ? "" : body.slice(firstSeparator).trimStart();
  if (remainder.startsWith(":")) {
    remainder = remainder.slice(1).trimStart();
  }
  const args = remainder.trim();

  if (!name) {
    return null;
  }

  const command = SLASH_COMMANDS.find((cmd) => cmd.name === name.toLowerCase());
  if (!command) {
    return null;
  }

  return { command, args };
}
