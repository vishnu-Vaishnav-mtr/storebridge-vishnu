"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MigrationControls({ migrationId }: { migrationId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function control(
    action:
      "start" | "pause" | "resume" | "retry-failed" | "verify" | "dry-run",
  ) {
    const response = await fetch("/api/migrations/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ migrationId, action }),
    });
    const payload = (await response.json()) as { message: string };
    setMessage(payload.message);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void control("start")}>
          <Play className="h-4 w-4" /> Start
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void control("pause")}
        >
          <Pause className="h-4 w-4" /> Pause
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void control("resume")}
        >
          <Play className="h-4 w-4" /> Resume
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void control("retry-failed")}
        >
          <RotateCcw className="h-4 w-4" /> Retry failed
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void control("verify")}
        >
          <ShieldCheck className="h-4 w-4" /> Verify
        </Button>
      </div>
      {message ? (
        <p className="rounded-xl border border-green/30 bg-green/10 p-3 text-sm text-green">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function LiveMigrationEvents({ migrationId }: { migrationId: string }) {
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    const source = new EventSource(
      `/api/migrations/events?migrationId=${migrationId}`,
    );
    source.onmessage = (event) => {
      setEvents((current) => [event.data, ...current].slice(0, 8));
    };
    return () => source.close();
  }, [migrationId]);

  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <p
          key={`${event}-${index}`}
          className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-muted"
        >
          {event}
        </p>
      ))}
      {events.length === 0 ? (
        <p className="text-sm text-muted">
          Live updates will appear here while a migration is running.
        </p>
      ) : null}
    </div>
  );
}
