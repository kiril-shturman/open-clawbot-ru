/**
 * Display utilities for sandbox CLI
 */

import type { SandboxBrowserInfo, SandboxContainerInfo } from "../agents/sandbox.js";
import { formatCliCommand } from "../cli/command-format.js";
import { formatDurationCompact } from "../infra/format-time/format-duration.ts";
import type { RuntimeEnv } from "../runtime.js";
import { formatImageMatch, formatSimpleStatus, formatStatus } from "./sandbox-formatters.js";

type DisplayConfig<T> = {
  emptyMessage: string;
  title: string;
  renderItem: (item: T, runtime: RuntimeEnv) => void;
};

function displayItems<T>(items: T[], config: DisplayConfig<T>, runtime: RuntimeEnv): void {
  if (items.length === 0) {
    runtime.log(config.emptyMessage);
    return;
  }

  runtime.log(`\n${config.title}\n`);
  for (const item of items) {
    config.renderItem(item, runtime);
  }
}

export function displayContainers(containers: SandboxContainerInfo[], runtime: RuntimeEnv): void {
  displayItems(
    containers,
    {
      emptyMessage: "Sandbox-окружения не найдены.",
      title: "📦 Sandbox-окружения:",
      renderItem: (container, rt) => {
        rt.log(`  ${container.runtimeLabel ?? container.containerName}`);
        rt.log(`    Статус:  ${formatStatus(container.running)}`);
        rt.log(
          `    ${container.configLabelKind ?? "Образ"}:   ${container.image} ${formatImageMatch(container.imageMatch)}`,
        );
        rt.log(`    Бэкенд: ${container.backendId ?? "docker"}`);
        rt.log(
          `    Возраст: ${formatDurationCompact(Date.now() - container.createdAtMs, { spaced: true }) ?? "0 с"}`,
        );
        rt.log(
          `    Простой: ${formatDurationCompact(Date.now() - container.lastUsedAtMs, { spaced: true }) ?? "0 с"}`,
        );
        rt.log(`    Сессия:  ${container.sessionKey}`);
        rt.log("");
      },
    },
    runtime,
  );
}

export function displayBrowsers(browsers: SandboxBrowserInfo[], runtime: RuntimeEnv): void {
  displayItems(
    browsers,
    {
      emptyMessage: "Sandbox browser-контейнеры не найдены.",
      title: "🌐 Sandbox browser-контейнеры:",
      renderItem: (browser, rt) => {
        rt.log(`  ${browser.containerName}`);
        rt.log(`    Статус:  ${formatStatus(browser.running)}`);
        rt.log(`    Образ:   ${browser.image} ${formatImageMatch(browser.imageMatch)}`);
        rt.log(`    CDP:     ${browser.cdpPort}`);
        if (browser.noVncPort) {
          rt.log(`    noVNC:   ${browser.noVncPort}`);
        }
        rt.log(
          `    Возраст: ${formatDurationCompact(Date.now() - browser.createdAtMs, { spaced: true }) ?? "0 с"}`,
        );
        rt.log(
          `    Простой: ${formatDurationCompact(Date.now() - browser.lastUsedAtMs, { spaced: true }) ?? "0 с"}`,
        );
        rt.log(`    Сессия:  ${browser.sessionKey}`);
        rt.log("");
      },
    },
    runtime,
  );
}

export function displaySummary(
  containers: SandboxContainerInfo[],
  browsers: SandboxBrowserInfo[],
  runtime: RuntimeEnv,
): void {
  const totalCount = containers.length + browsers.length;
  const runningCount =
    containers.filter((c) => c.running).length + browsers.filter((b) => b.running).length;
  const mismatchCount =
    containers.filter((c) => !c.imageMatch).length + browsers.filter((b) => !b.imageMatch).length;

  runtime.log(`Всего: ${totalCount} (${runningCount} запущено)`);

  if (mismatchCount > 0) {
    runtime.log(`\n⚠️  Обнаружено ${mismatchCount} окруж. с несовпадением конфигурации.`);
    runtime.log(
      `   Запустите '${formatCliCommand("openclaw sandbox recreate --all")}', чтобы обновить все окружения.`,
    );
  }
}

export function displayRecreatePreview(
  containers: SandboxContainerInfo[],
  browsers: SandboxBrowserInfo[],
  runtime: RuntimeEnv,
): void {
  runtime.log("\nSandbox-окружения для пересоздания:\n");

  if (containers.length > 0) {
    runtime.log("📦 Sandbox-окружения:");
    for (const container of containers) {
      runtime.log(
        `  - ${container.runtimeLabel ?? container.containerName} [${container.backendId ?? "docker"}] (${formatSimpleStatus(container.running)})`,
      );
    }
  }

  if (browsers.length > 0) {
    runtime.log("\n🌐 Browser-контейнеры:");
    for (const browser of browsers) {
      runtime.log(`  - ${browser.containerName} (${formatSimpleStatus(browser.running)})`);
    }
  }

  const total = containers.length + browsers.length;
  runtime.log(`\nВсего: ${total} окруж.`);
}

export function displayRecreateResult(
  result: { successCount: number; failCount: number },
  runtime: RuntimeEnv,
): void {
  runtime.log(`\nГотово: удалено ${result.successCount}, ошибок ${result.failCount}`);

  if (result.successCount > 0) {
    runtime.log("\nОкружения будут автоматически пересозданы при следующем использовании агента.");
  }
}
