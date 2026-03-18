import type { ProgressReporter } from "../../cli/progress.js";
import { getTerminalTableWidth, renderTable } from "../../terminal/table.js";
import { isRich, theme } from "../../terminal/theme.js";
import { groupChannelIssuesByChannel } from "./channel-issues.js";
import { appendStatusAllDiagnosis } from "./diagnosis.js";
import { formatTimeAgo } from "./format.js";

type OverviewRow = { Item: string; Value: string };

type ChannelsTable = {
  rows: Array<{
    id: string;
    label: string;
    enabled: boolean;
    state: "ok" | "warn" | "off" | "setup";
    detail: string;
  }>;
  details: Array<{
    title: string;
    columns: string[];
    rows: Array<Record<string, string>>;
  }>;
};

type ChannelIssueLike = {
  channel: string;
  message: string;
};

type AgentStatusLike = {
  agents: Array<{
    id: string;
    name?: string | null;
    bootstrapPending?: boolean | null;
    sessionsCount: number;
    lastActiveAgeMs?: number | null;
    sessionsPath: string;
  }>;
};

export async function buildStatusAllReportLines(params: {
  progress: ProgressReporter;
  overviewRows: OverviewRow[];
  channels: ChannelsTable;
  channelIssues: ChannelIssueLike[];
  agentStatus: AgentStatusLike;
  connectionDetailsForReport: string;
  diagnosis: Omit<
    Parameters<typeof appendStatusAllDiagnosis>[0],
    "lines" | "progress" | "muted" | "ok" | "warn" | "fail" | "connectionDetailsForReport"
  >;
}) {
  const rich = isRich();
  const heading = (text: string) => (rich ? theme.heading(text) : text);
  const ok = (text: string) => (rich ? theme.success(text) : text);
  const warn = (text: string) => (rich ? theme.warn(text) : text);
  const fail = (text: string) => (rich ? theme.error(text) : text);
  const muted = (text: string) => (rich ? theme.muted(text) : text);

  const tableWidth = getTerminalTableWidth();

  const overview = renderTable({
    width: tableWidth,
    columns: [
      { key: "Item", header: "Пункт", minWidth: 10 },
      { key: "Value", header: "Значение", flex: true, minWidth: 24 },
    ],
    rows: params.overviewRows,
  });

  const channelRows = params.channels.rows.map((row) => ({
    channelId: row.id,
    Channel: row.label,
    Enabled: row.enabled ? ok("ON") : muted("OFF"),
    State:
      row.state === "ok"
        ? ok("OK")
        : row.state === "warn"
          ? warn("WARN")
          : row.state === "off"
            ? muted("OFF")
            : theme.accentDim("SETUP"),
    Detail: row.detail,
  }));
  const channelIssuesByChannel = groupChannelIssuesByChannel(params.channelIssues);
  const channelRowsWithIssues = channelRows.map((row) => {
    const issues = channelIssuesByChannel.get(row.channelId) ?? [];
    if (issues.length === 0) {
      return row;
    }
    const issue = issues[0];
    const suffix = ` · ${warn(`gateway: ${String(issue.message).slice(0, 90)}`)}`;
    return {
      ...row,
      State: warn("WARN"),
      Detail: `${row.Detail}${suffix}`,
    };
  });

  const channelsTable = renderTable({
    width: tableWidth,
    columns: [
      { key: "Channel", header: "Канал", minWidth: 10 },
      { key: "Enabled", header: "Вкл", minWidth: 7 },
      { key: "State", header: "Состояние", minWidth: 8 },
      { key: "Detail", header: "Детали", flex: true, minWidth: 28 },
    ],
    rows: channelRowsWithIssues,
  });

  const agentRows = params.agentStatus.agents.map((a) => ({
    Agent: a.name?.trim() ? `${a.id} (${a.name.trim()})` : a.id,
    BootstrapFile:
      a.bootstrapPending === true
        ? warn("ЕСТЬ")
        : a.bootstrapPending === false
          ? ok("НЕТ")
          : "неизвестно",
    Sessions: String(a.sessionsCount),
    Active: a.lastActiveAgeMs != null ? formatTimeAgo(a.lastActiveAgeMs) : "неизвестно",
    Store: a.sessionsPath,
  }));

  const agentsTable = renderTable({
    width: tableWidth,
    columns: [
      { key: "Agent", header: "Агент", minWidth: 12 },
      { key: "BootstrapFile", header: "Bootstrap-файл", minWidth: 14 },
      { key: "Sessions", header: "Сессии", align: "right", minWidth: 8 },
      { key: "Active", header: "Активность", minWidth: 10 },
      { key: "Store", header: "Хранилище", flex: true, minWidth: 34 },
    ],
    rows: agentRows,
  });

  const lines: string[] = [];
  lines.push(heading("Статус OpenClaw --all"));
  lines.push("");
  lines.push(heading("Обзор"));
  lines.push(overview.trimEnd());
  lines.push("");
  lines.push(heading("Каналы"));
  lines.push(channelsTable.trimEnd());
  for (const detail of params.channels.details) {
    lines.push("");
    lines.push(heading(detail.title));
    lines.push(
      renderTable({
        width: tableWidth,
        columns: detail.columns.map((c) => ({
          key: c,
          header: c === "Notes" ? "Заметки" : c,
          flex: c === "Notes",
          minWidth: c === "Notes" ? 28 : 10,
        })),
        rows: detail.rows.map((r) => ({
          ...r,
          ...(r.Status === "OK"
            ? { Status: ok("OK") }
            : r.Status === "WARN"
              ? { Status: warn("WARN") }
              : r.Status === "OFF"
                ? { Status: muted("OFF") }
                : {}),
        })),
      }).trimEnd(),
    );
  }
  lines.push("");
  lines.push(heading("Агенты"));
  lines.push(agentsTable.trimEnd());
  lines.push("");
  lines.push(heading("Диагностика (только чтение)"));

  await appendStatusAllDiagnosis({
    lines,
    progress: params.progress,
    muted,
    ok,
    warn,
    fail,
    connectionDetailsForReport: params.connectionDetailsForReport,
    ...params.diagnosis,
  });

  return lines;
}
