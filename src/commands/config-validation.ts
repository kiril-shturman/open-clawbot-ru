import { formatCliCommand } from "../cli/command-format.js";
import { type OpenClawConfig, readConfigFileSnapshot } from "../config/config.js";
import { formatConfigIssueLines } from "../config/issue-format.js";
import {
  buildPluginCompatibilityNotices,
  formatPluginCompatibilityNotice,
} from "../plugins/status.js";
import type { RuntimeEnv } from "../runtime.js";

export async function requireValidConfigSnapshot(
  runtime: RuntimeEnv,
  opts?: { includeCompatibilityAdvisory?: boolean },
): Promise<OpenClawConfig | null> {
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists && !snapshot.valid) {
    const issues =
      snapshot.issues.length > 0
        ? formatConfigIssueLines(snapshot.issues, "-").join("\n")
        : "Неизвестная ошибка валидации.";
    runtime.error(`Конфиг некорректен:\n${issues}`);
    runtime.error(`Исправьте конфиг или запустите ${formatCliCommand("openclaw doctor")}.`);
    runtime.exit(1);
    return null;
  }
  if (opts?.includeCompatibilityAdvisory !== true) {
    return snapshot.config;
  }
  const compatibility = buildPluginCompatibilityNotices({ config: snapshot.config });
  if (compatibility.length > 0) {
    runtime.log(
      [
        `Совместимость плагинов: ${compatibility.length} предупреждени${compatibility.length === 1 ? "е" : compatibility.length < 5 ? "я" : "й"}.`,
        ...compatibility
          .slice(0, 3)
          .map((notice) => `- ${formatPluginCompatibilityNotice(notice)}`),
        ...(compatibility.length > 3 ? [`- ... и ещё ${compatibility.length - 3}`] : []),
        `Проверьте: ${formatCliCommand("openclaw doctor")}`,
      ].join("\n"),
    );
  }
  return snapshot.config;
}
