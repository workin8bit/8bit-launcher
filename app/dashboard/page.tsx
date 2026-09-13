"use client";

import { useState, useEffect } from "react";
import { bootstrapApplication } from "@/core/application/bootstrap";

// Nothing OS-style square icons — Doto font glyphs, not dots
const Ikons = {
  // Square glyph icons using Doto-style characters
  Search: () => <span className="ikon-kotak text-lg">⌕</span>,
  File: () => <span className="ikon-kotak text-lg">▦</span>,
  Device: () => <span className="ikon-kotak text-lg">▦</span>,
  Send: () => <span className="ikon-kotak text-lg">→</span>,
  Sync: () => <span className="ikon-kotak text-lg">⟳</span>,
  Task: () => <span className="ikon-kotak text-lg">□</span>,
  Online: () => <span className="w-2 h-2 bg-8bit-accent rounded-full animate-pulse inline-block" />,
  Home: () => <span className="ikon-kotak text-lg">▦</span>,
  Grid: () => <span className="ikon-kotak text-lg">▦</span>,
};

export default function DashboardPage() {
  const [goal, setGoal] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState("PENDING_SYNC");

  useEffect(() => {
    const { facade } = bootstrapApplication();
    if (facade.startWorker) facade.startWorker("user_demo", 3000);
    if (facade.processPending) facade.processPending("user_demo").catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setExecuting(true);
    const { facade } = bootstrapApplication();
    const res = await facade.executeTask(goal, { userId: "user_demo" });
    if (res.success) {
      setResult(res.data.executionId);
      setSyncStatus("PENDING_SYNC");
    } else {
      setResult("ERR:" + res.error.messageKey);
    }
    setExecuting(false);
    setGoal("");
  }

  return (
    <div className="min-h-screen bg-8bit-bg text-8bit-text font-mono">
      {/* Header — Nothing OS-style: minimal, icon-only */}
      <header className="border-b-2 border-8bit-accent bg-8bit-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ikons.Home />
          <div>
            <h1 className="text-lg text-8bit-accent">8bitAI</h1>
            <p className="text-xs text-8bit-muted">v0.9</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Ikons.Sync />
          <Ikons.Online />
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Status widgets — Nothing OS-style square widgets */}
        <section className="grid grid-cols-2 gap-3">
          <div className="widget-kotak">
            <div className="flex items-center gap-2 mb-2">
              <Ikons.Task />
              <span className="text-xs text-8bit-muted">TASKS</span>
            </div>
            <p className="text-3xl text-8bit-accent">0</p>
          </div>
          <div className="widget-kotak">
            <div className="flex items-center gap-2 mb-2">
              <Ikons.Sync />
              <span className="text-xs text-8bit-muted">SYNC</span>
            </div>
            <p className="text-sm text-8bit-accent">{syncStatus}</p>
            <p className="text-xs text-8bit-muted">0 pending</p>
          </div>
        </section>

        {/* Input — Nothing OS-style: minimal input with square send button */}
        <section className="widget-kotak">
          <div className="flex items-center gap-2 mb-3">
            <Ikons.Search />
            <span className="text-sm text-8bit-accent">ASK</span>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="type a task..."
              disabled={executing}
              className="flex-1 bg-8bit-bg border-2 border-8bit-accent text-8bit-text px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={executing}
              className="ikon-kotak border-8bit-accent bg-8bit-accent text-8bit-bg hover:bg-transparent hover:text-8bit-accent"
            >
              <Ikons.Send />
            </button>
          </form>
          {result && (
            <p className="text-xs mt-2 text-8bit-muted">{result}</p>
          )}
        </section>

        {/* Tools grid — Nothing OS-style: square icon grid */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Ikons.Grid />
            <span className="text-sm text-8bit-accent">TOOLS</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="ikon-kotak hover:bg-8bit-accent hover:text-8bit-bg">
              <Ikons.Search />
            </button>
            <button className="ikon-kotak hover:bg-8bit-accent hover:text-8bit-bg">
              <Ikons.File />
            </button>
            <button className="ikon-kotak hover:bg-8bit-accent hover:text-8bit-bg">
              <Ikons.Device />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}