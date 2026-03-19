import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { buildWorkspaceHookStatus } from "../hooks/hooks-status.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export async function setupInternalHooks(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  await prompter.note(
    [
      "Hooks позволяют автоматизировать действия при выполнении команд агента.",
      "Пример: сохранять контекст сессии в memory, когда вы вызываете /new или /reset.",
      "",
      "Подробнее: https://docs.openclaw.ai/automation/hooks",
    ].join("\n"),
    "Hooks",
  );

  // Discover available hooks using the hook discovery system
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });

  // Show every eligible hook so users can opt in during setup.
  const eligibleHooks = report.hooks.filter((h) => h.eligible);

  if (eligibleHooks.length === 0) {
    await prompter.note(
      "Подходящих hooks не найдено. Позже их можно настроить в конфиге.",
      "Hooks недоступны",
    );
    return cfg;
  }

  const toEnable = await prompter.multiselect({
    message: "Включить hooks?",
    options: [
      { value: "__skip__", label: "Пока пропустить" },
      ...eligibleHooks.map((hook) => ({
        value: hook.name,
        label: `${hook.emoji ?? "🔗"} ${hook.name}`,
        hint: hook.description,
      })),
    ],
  });

  const selected = toEnable.filter((name) => name !== "__skip__");
  if (selected.length === 0) {
    return cfg;
  }

  // Enable selected hooks using the new entries config format
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }

  const next: OpenClawConfig = {
    ...cfg,
    hooks: {
      ...cfg.hooks,
      internal: {
        enabled: true,
        entries,
      },
    },
  };

  await prompter.note(
    [
      `Включено (${selected.length}): ${selected.join(", ")}`,
      "",
      "Позже hooks можно управлять командами:",
      `  ${formatCliCommand("openclaw hooks list")}`,
      `  ${formatCliCommand("openclaw hooks enable <name>")}`,
      `  ${formatCliCommand("openclaw hooks disable <name>")}`,
    ].join("\n"),
    "Hooks настроены",
  );

  return next;
}
