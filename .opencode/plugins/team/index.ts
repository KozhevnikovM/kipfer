/**
 * team — координация параллельных агентов конвейера family-vpn.
 *
 * Даёт агентам два механизма:
 *  1. Presence: кто, над какой задачей, на какой стадии, в каком статусе (worktree/ветка).
 *  2. Чат: треды на задачу (thread = id карточки доски) + канал "global".
 *
 * Инструменты: team_announce, team_roster, team_chat_post, team_chat_read, team_context.
 * Данные — в storage плагина, переживают перезапуск сервера.
 */
import { Plugin } from "@opencode/plugin"

const STAGES = ["backlog", "design", "spec-review", "implementation", "qa", "pr-review", "done-merged"]
const STATUSES = ["working", "blocked", "waiting", "done"]
const CHAT_LIMIT = 100
// done-объявления исчезают из roster/context через 30 минут
const DONE_TTL_MS = 30 * 60_000
const isStaleDone = (r: Presence) => r.status === "done" && now() - r.updated > DONE_TTL_MS

type AnnounceInput = {
  task: string
  stage: string
  status: string
  note?: string
  branch?: string
  worktree?: string
}

type Presence = {
  agent: string
  task: string
  stage: string
  status: string
  note?: string
  branch?: string
  worktree?: string
  updated: number
  updatedISO: string
}

type Message = {
  seq: number
  from: string
  to?: string
  text: string
  at: string
}

const now = () => Date.now()
const iso = () => new Date().toISOString()

// валидация входа без зависимостей
function bad(label: string, value: unknown): never {
  throw new Error(`${label} invalid: ${String(value)}`)
}

function checkStage(v: string) {
  if (!STAGES.includes(v)) bad("stage", v)
}
function checkStatus(v: string) {
  if (!STATUSES.includes(v)) bad("status", v)
}

export default Plugin.define({
  id: "family-vpn-team",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "team",
        description:
          "Координация параллельных агентов конвейера: presence (кто чем занят) и чат-треды по задачам",
      })

      const fromLabel = (agent: string, task?: string) => (task ? `${agent}[${task}]` : agent)

      // ---------- presence ----------

      editor.add({
        name: "announce",
        description:
          "Объявить/обновить свой статус в конвейере. Вызывать: при старте работы над задачей (working), при ожидании чужого результата (waiting), при блокировке (blocked), по завершении (done). task — id карточки доски (короткий префикс) или '-'.",
        input: {
          type: "object",
          properties: {
            task: { type: "string", description: "id карточки доски или '-'" },
            stage: { type: "string", enum: STAGES, description: "стадия конвейера" },
            status: { type: "string", enum: STATUSES, description: "working | blocked | waiting | done" },
            note: { type: "string", description: "чем именно занят, одна строка (ru)" },
            branch: { type: "string" },
            worktree: { type: "string" },
          },
          required: ["task", "stage", "status"],
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw, context) => {
          const input = raw as AnnounceInput
          const agent = (context.agent as string | undefined) ?? "unknown"
          checkStage(input.stage)
          checkStatus(input.status)
          const rec: Presence = {
            agent,
            task: input.task,
            stage: input.stage,
            status: input.status,
            note: input.note,
            branch: input.branch,
            worktree: input.worktree,
            updated: now(),
            updatedISO: iso(),
          }
          await ctx.storage.set(`presence/${agent}/${input.task}`, rec as never)
          const content = `ok: ${fromLabel(agent, input.task)} → ${input.stage}/${input.status}` +
            (input.note ? ` — ${input.note}` : "")
          await context.progress({ status: content })
          return { content }
        },
      })

      editor.add({
        name: "roster",
        description:
          "Показать все активные объявления агентов конвейера: кто, над какой задачей, стадия, статус, ветка/worktree, давность. Вызывать перед взятием новой задачи и перед правками, которые могут пересекаться с чужими.",
        input: {
          type: "object",
          properties: {
            stale_minutes: {
              type: "number",
              description: "считать объявление устаревшим после N минут без обновления (по умолчанию 360)",
            },
          },
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw) => {
          const input = (raw ?? {}) as { stale_minutes?: number }
          const staleMs = (input.stale_minutes ?? 360) * 60_000
          const page = await ctx.storage.scan({ prefix: "presence/", limit: 1000 })
          const recs = page.entries
            .map((e) => e.value as unknown as Presence)
            .filter((r) => now() - r.updated <= staleMs && !isStaleDone(r))
            .sort((a, b) => b.updated - a.updated)
          if (recs.length === 0) return { content: "roster пуст — никто не объявлял статус" }
          const lines = recs.map((r) => {
            const ageMin = Math.round((now() - r.updated) / 60_000)
            return [
              `${fromLabel(r.agent, r.task)} — ${r.stage}/${r.status} (${ageMin} мин назад)`,
              r.note ? `    ${r.note}` : null,
              r.branch || r.worktree ? `    ${[r.branch, r.worktree].filter(Boolean).join(" | ")}` : null,
            ]
              .filter(Boolean)
              .join("\n")
          })
          return { content: lines.join("\n") }
        },
      })

      // ---------- chat ----------

      editor.add({
        name: "chat_post",
        description:
          'Сообщение в тред координации. thread = id карточки задачи или "global". Обращение к конкретному агенту — полем to (имя агента). Пиши коротко и по делу (ru).',
        input: {
          type: "object",
          properties: {
            thread: { type: "string", description: "id карточки или global" },
            text: { type: "string" },
            to: { type: "string", description: "адресат (имя агента), опционально" },
            task: { type: "string", description: "своя карточка для подписи, опционально" },
          },
          required: ["thread", "text"],
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw, context) => {
          const input = raw as { thread: string; text: string; to?: string; task?: string }
          const agent = (context.agent as string | undefined) ?? "unknown"
          if (!input.thread.trim()) bad("thread", input.thread)
          if (!input.text.trim()) bad("text", "(пусто)")
          const msg: Message = {
            seq: now(),
            from: fromLabel(agent, input.task),
            to: input.to,
            text: input.text.trim(),
            at: iso(),
          }
          const key = `chat/${input.thread.replace(/[^a-zA-Z0-9_-]/g, "_")}/${msg.seq}`
          await ctx.storage.set(key, msg as never)
          return { content: `ok: сообщение #${msg.seq} в ${input.thread}` }
        },
      })

      editor.add({
        name: "chat_read",
        description:
          "Прочитать тред координации. since — seq последнего прочитанного сообщения (вернёт только более новые); без since — весь тред.",
        input: {
          type: "object",
          properties: {
            thread: { type: "string" },
            since: { type: "number", description: "seq, после которого нужны сообщения" },
          },
          required: ["thread"],
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw) => {
          const input = raw as { thread: string; since?: number }
          const prefix = `chat/${input.thread.replace(/[^a-zA-Z0-9_-]/g, "_")}/`
          const page = await ctx.storage.scan({ prefix, limit: 1000 })
          const msgs = page.entries
            .map((e) => e.value as unknown as Message)
            .filter((m) => input.since === undefined || m.seq > input.since)
            .sort((a, b) => a.seq - b.seq)
            .slice(-CHAT_LIMIT)
          if (msgs.length === 0) {
            return { content: `тред ${input.thread} пуст${input.since !== undefined ? " после seq " + input.since : ""}` }
          }
          const lines = msgs.map((m) => {
            const hhmm = m.at.slice(11, 16)
            return `[${hhmm}] ${m.from}${m.to ? ` → ${m.to}` : ""}: ${m.text}  (#${m.seq})`
          })
          return { content: lines.join("\n") }
        },
      })

      // ---------- одномоментный снимок для старта агента ----------

      editor.add({
        name: "context",
        description:
          "Стартовый снимок координации: активный roster + последние сообщения треда задачи. Вызывать первым делом при начале работы над задачей и перед потенциально конфликтующими действиями.",
        input: {
          type: "object",
          properties: {
            thread: { type: "string", description: "id карточки своей задачи или global" },
          },
          required: ["thread"],
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw) => {
          const input = raw as { thread: string }

          const staleMs = 360 * 60_000
          const page = await ctx.storage.scan({ prefix: "presence/", limit: 1000 })
          const recs = page.entries
            .map((e) => e.value as unknown as Presence)
            .filter((r) => now() - r.updated <= staleMs && !isStaleDone(r))
            .sort((a, b) => b.updated - a.updated)

          const prefix = `chat/${input.thread.replace(/[^a-zA-Z0-9_-]/g, "_")}/`
          const chatPage = await ctx.storage.scan({ prefix, limit: 1000 })
          const msgs = chatPage.entries
            .map((e) => e.value as unknown as Message)
            .sort((a, b) => a.seq - b.seq)
            .slice(-CHAT_LIMIT)

          const rosterPart =
            recs.length === 0
              ? ["ROSTER: пусто"]
              : [
                  "ROSTER:",
                  ...recs.map((r) => {
                    const ageMin = Math.round((now() - r.updated) / 60_000)
                    const where = [r.branch, r.worktree].filter(Boolean).join(" | ")
                    return `- ${fromLabel(r.agent, r.task)}: ${r.stage}/${r.status} (${ageMin} мин)${where ? ` [${where}]` : ""}${r.note ? ` — ${r.note}` : ""}`
                  }),
                ]

          const chatPart =
            msgs.length === 0
              ? [`CHAT ${input.thread}: пусто`]
              : [
                  `CHAT ${input.thread}:`,
                  ...msgs.map((m) => `- [${m.at.slice(11, 16)}] ${m.from}${m.to ? ` → ${m.to}` : ""}: ${m.text}`),
                ]

          return { content: [...rosterPart, "", ...chatPart].join("\n") }
        },
      })
    })
  },
})
