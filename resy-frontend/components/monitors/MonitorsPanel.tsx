"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, CheckCircle2, Clock, Loader2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export const MONITORS_CHANGED_EVENT = "monitors:changed"

interface Monitor {
  id: string
  venue_id: number
  venue_name: string | null
  day: string
  num_seats: number
  time_start: string | null
  time_end: string | null
  email: string
  status: "active" | "notified" | "expired" | "cancelled"
  last_check_at: number | null
  check_count: number
  last_error: string | null
  found_slots: { start: string; type: string }[] | null
}

const POLL_MS = 10_000

function fmtTime(epochSec: number | null) {
  if (!epochSec) return "not yet"
  return new Date(epochSec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
}

function slotTime(start: string) {
  return start.split(" ").pop()?.slice(0, 5) ?? start
}

function StatusIcon({ status }: { status: Monitor["status"] }) {
  if (status === "active") return <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
  if (status === "notified") return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
  if (status === "expired") return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
  return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
}

const STATUS_LABEL: Record<Monitor["status"], string> = {
  active: "Watching",
  notified: "Email sent",
  expired: "Expired",
  cancelled: "Cancelled",
}

export function MonitorsPanel({ taskId }: { taskId: string }) {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/resy/monitors", {
        headers: { "x-task-id": taskId },
        cache: "no-store",
      })
      if (res.ok) setMonitors(await res.json())
    } catch {
      // transient network error; next poll will retry
    }
  }, [taskId])

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    const onChanged = () => load()
    window.addEventListener(MONITORS_CHANGED_EVENT, onChanged)
    return () => {
      clearInterval(interval)
      window.removeEventListener(MONITORS_CHANGED_EVENT, onChanged)
    }
  }, [load])

  const cancel = async (id: string) => {
    setCancelling(id)
    try {
      await fetch(`/api/resy/monitors/${id}`, { method: "DELETE", headers: { "x-task-id": taskId } })
      await load()
    } finally {
      setCancelling(null)
    }
  }

  if (monitors.length === 0) return null

  return (
    <div className="w-full max-w-2xl space-y-2">
      <h2 className="text-sm font-semibold text-blue-600 flex items-center gap-2">
        <Bell className="w-4 h-4" /> Your monitors
      </h2>
      {monitors.map((m) => (
        <div key={m.id} className="flex items-start gap-3 p-3 border border-blue-600 bg-white dark:bg-black rounded">
          <StatusIcon status={m.status} />
          <div className="flex-1 min-w-0 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">{m.venue_name || `Venue ${m.venue_id}`}</p>
              <span className="text-xs text-muted-foreground shrink-0">{STATUS_LABEL[m.status]}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {m.day} · party of {m.num_seats}
              {(m.time_start || m.time_end) && ` · ${m.time_start ?? "any"}–${m.time_end ?? "any"}`}
              {" · "}
              {m.email}
            </p>
            {m.status === "active" && (
              <p className="text-xs text-blue-600 mt-1">
                Last checked {fmtTime(m.last_check_at)} · {m.check_count} checks
              </p>
            )}
            {m.status === "notified" && m.found_slots && (
              <p className="text-xs text-green-700 dark:text-green-500 mt-1">
                Found {m.found_slots.slice(0, 6).map((s) => slotTime(s.start)).join(", ")}. Check your email.
              </p>
            )}
            {m.last_error && m.status === "active" && (
              <p className="text-xs text-red-600 mt-1">{m.last_error}</p>
            )}
          </div>
          {m.status === "active" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              disabled={cancelling === m.id}
              onClick={() => cancel(m.id)}
              aria-label="Cancel monitor"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
