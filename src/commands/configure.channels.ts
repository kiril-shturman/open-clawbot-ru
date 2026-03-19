import { getChannelPlugin, listChannelPlugins } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { CONFIG_PATH } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { shortenHomePath } from "../utils.js";
import { confirm, select } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

export async function removeChannelConfigWizard(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  let next = { ...cfg };

  const listConfiguredChannels = () =>
    listChannelPlugins()
      .map((plugin) => plugin.meta)
      .filter((meta) => next.channels?.[meta.id] !== undefined);

  while (true) {
    const configured = listConfiguredChannels();
    if (configured.length === 0) {
      note(
        [
          "В openclaw.json не найдено настроек каналов.",
          `Подсказка: \`${formatCliCommand("openclaw channels status")}\` показывает, что настроено и включено.`,
        ].join("\n"),
        "Удаление канала",
      );
      return next;
    }

    const channel = guardCancel(
      await select({
        message: "Какую конфигурацию канала удалить?",
        options: [
          ...configured.map((meta) => ({
            value: meta.id,
            label: meta.label,
            hint: "Удаляет токены и настройки из конфига (credentials на диске останутся)",
          })),
          { value: "done", label: "Готово" },
        ],
      }),
      runtime,
    );

    if (channel === "done") {
      return next;
    }

    const label = getChannelPlugin(channel)?.meta.label ?? channel;
    const confirmed = guardCancel(
      await confirm({
        message: `Удалить конфигурацию ${label} из ${shortenHomePath(CONFIG_PATH)}?`,
        initialValue: false,
      }),
      runtime,
    );
    if (!confirmed) {
      continue;
    }

    const nextChannels: Record<string, unknown> = { ...next.channels };
    delete nextChannels[channel];
    next = {
      ...next,
      channels: Object.keys(nextChannels).length
        ? (nextChannels as OpenClawConfig["channels"])
        : undefined,
    };

    note(
      [
        `${label} удалён из конфига.`,
        "Примечание: credentials и сессии на диске не изменены.",
      ].join("\n"),
      "Канал удалён",
    );
  }
}
