/**
 * team — coordination of parallel conveyor agents in kipfer.
 *
 * Gives agents two mechanisms:
 *  1. Presence: who works on which task, at which stage, in which status
 *     (branch and worktree included).
 *  2. Chat: one thread per task (thread = board card id) plus a "global" channel.
 *
 * Tools: team_announce, team_roster, team_chat_post, team_chat_read, team_context.
 * Data lives in plugin storage and survives a server restart.
 */
import { Plugin } from "@opencode/plugin"

const STAGES = ["backlog", "design", "spec-review", "implementation", "qa", "pr-review", "done-merged"]
const STATUSES = ["working", "blocked", "waiting", "done"]
const CHAT_LIMIT = 100
// done announcements leave roster/context after 30 minutes
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

// dependency-free input validation
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
  id: "kipfer-team",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "team",
        description:
          "Coordination of parallel conveyor agents: presence (who works on what) and per-task chat threads",
      })

      const fromLabel = (agent: string, task?: string) => (task ? `${agent}[${task}]` : agent)

      // ---------- presence ----------

      editor.add({
        name: "announce",
        description:
          "Announce or update your status in the conveyor. Call it when you start work on a task (working), wait for another agent's result (waiting), get blocked (blocked), and when you finish (done). task = board card id (short prefix) or '-'.",
        input: {
          type: "object",
          properties: {
            task: { type: "string", description: "board card id or '-'" },
            stage: { type: "string", enum: STAGES, description: "conveyor stage" },
            status: { type: "string", enum: STATUSES, description: "working | blocked | waiting | done" },
            note: { type: "string", description: "what you do, one line (STE)" },
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
          const content = `ok: ${fromLabel(agent, input.task)} -> ${input.stage}/${input.status}` +
            (input.note ? ` — ${input.note}` : "")
          await context.progress({ status: content })
          return { content }
        },
      })

      editor.add({
        name: "roster",
        description:
          "Show all active conveyor announcements: who, which task, stage, status, branch and worktree, with age. Call it before you take a new task and before edits that may overlap another agent's work.",
        input: {
          type: "object",
          properties: {
            stale_minutes: {
              type: "number",
              description: "treat an announcement as stale after N minutes without updates (default 360)",
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
          if (recs.length === 0) return { content: "roster is empty — no agent announced a status" }
          const lines = recs.map((r) => {
            const ageMin = Math.round((now() - r.updated) / 60_000)
            return [
              `${fromLabel(r.agent, r.task)} — ${r.stage}/${r.status} (${ageMin} min ago)`,
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
          'Post a message to a coordination thread. thread = task card id or "global". Address a specific agent with the to field (agent name). Keep it short and to the point (STE).',
        input: {
          type: "object",
          properties: {
            thread: { type: "string", description: "card id or global" },
            text: { type: "string" },
            to: { type: "string", description: "addressee (agent name), optional" },
            task: { type: "string", description: "your own card id for the signature, optional" },
          },
          required: ["thread", "text"],
          additionalProperties: false,
        },
        options: { namespace: "team", codemode: true },
        execute: async (raw, context) => {
          const input = raw as { thread: string; text: string; to?: string; task?: string }
          const agent = (context.agent as string | undefined) ?? "unknown"
          if (!input.thread.trim()) bad("thread", input.thread)
          if (!input.text.trim()) bad("text", "(empty)")
          const msg: Message = {
            seq: now(),
            from: fromLabel(agent, input.task),
            to: input.to,
            text: input.text.trim(),
            at: iso(),
          }
          const key = `chat/${input.thread.replace(/[^a-zA-Z0-9_-]/g, "_")}/${msg.seq}`
          await ctx.storage.set(key, msg as never)
          return { content: `ok: message #${msg.seq} posted to ${input.thread}` }
        },
      })

      editor.add({
        name: "chat_read",
        description:
          "Read a coordination thread. since = seq of the last read message (returns only newer ones); without since, the whole thread.",
        input: {
          type: "object",
          properties: {
            thread: { type: "string" },
            since: { type: "number", description: "return messages with seq greater than this" },
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
            return { content: `thread ${input.thread} is empty${input.since !== undefined ? " after seq " + input.since : ""}` }
          }
          const lines = msgs.map((m) => {
            const hhmm = m.at.slice(11, 16)
            return `[${hhmm}] ${m.from}${m.to ? ` -> ${m.to}` : ""}: ${m.text}  (#${m.seq})`
          })
          return { content: lines.join("\n") }
        },
      })

      // ---------- combined snapshot for agent start ----------

      editor.add({
        name: "context",
        description:
          "Start snapshot: active roster plus the latest messages of a task thread. Call it first when you start work on a task and before actions that may conflict with other agents.",
        input: {
          type: "object",
          properties: {
            thread: { type: "string", description: "your task card id or global" },
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
              ? ["ROSTER: empty"]
              : [
                  "ROSTER:",
                  ...recs.map((r) => {
                    const ageMin = Math.round((now() - r.updated) / 60_000)
                    const where = [r.branch, r.worktree].filter(Boolean).join(" | ")
                    return `- ${fromLabel(r.agent, r.task)}: ${r.stage}/${r.status} (${ageMin} min)${where ? ` [${where}]` : ""}${r.note ? ` — ${r.note}` : ""}`
                  }),
                ]

          const chatPart =
            msgs.length === 0
              ? [`CHAT ${input.thread}: empty`]
              : [
                  `CHAT ${input.thread}:`,
                  ...msgs.map((m) => `- [${m.at.slice(11, 16)}] ${m.from}${m.to ? ` -> ${m.to}` : ""}: ${m.text}`),
                ]

          return { content: [...rosterPart, "", ...chatPart].join("\n") }
        },
      })
    })
  },
})
