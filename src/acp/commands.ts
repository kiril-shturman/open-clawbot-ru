import type { AvailableCommand } from "@agentclientprotocol/sdk";

export function getAvailableCommands(): AvailableCommand[] {
  return [
    { name: "help", description: "Показать справку и основные команды." },
    { name: "commands", description: "Показать доступные команды." },
    { name: "status", description: "Показать текущее состояние." },
    {
      name: "context",
      description: "Пояснить использование context (list|detail|json).",
      input: { hint: "list | detail | json" },
    },
    { name: "whoami", description: "Показать идентификатор отправителя (алиас: /id)." },
    { name: "id", description: "Алиас для /whoami." },
    { name: "subagents", description: "Показать субагентов или управлять ими." },
    { name: "config", description: "Читать или изменять config (только для владельца)." },
    { name: "debug", description: "Задать runtime-only переопределения (только для владельца)." },
    { name: "usage", description: "Переключить footer usage (off|tokens|full)." },
    { name: "stop", description: "Остановить текущий запуск." },
    { name: "restart", description: "Перезапустить gateway (если включено)." },
    { name: "dock-telegram", description: "Направлять ответы в Telegram." },
    { name: "dock-discord", description: "Направлять ответы в Discord." },
    { name: "dock-slack", description: "Направлять ответы в Slack." },
    { name: "activation", description: "Задать активацию группы (mention|always)." },
    { name: "send", description: "Задать режим отправки (on|off|inherit)." },
    { name: "reset", description: "Сбросить session (/new)." },
    { name: "new", description: "Сбросить session (/reset)." },
    {
      name: "think",
      description: "Задать уровень thinking (off|minimal|low|medium|high|xhigh).",
    },
    { name: "verbose", description: "Задать verbose-режим (on|full|off)." },
    { name: "reasoning", description: "Переключить вывод reasoning (on|off|stream)." },
    { name: "elevated", description: "Переключить elevated-режим (on|off)." },
    { name: "model", description: "Выбрать модель (list|status|<name>)." },
    { name: "queue", description: "Настроить режим очереди и параметры." },
    { name: "bash", description: "Выполнить команду на хосте (если разрешено)." },
    { name: "compact", description: "Сжать историю session." },
  ];
}
