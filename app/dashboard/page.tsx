"use client";

import { useState } from "react";
import { bootstrapApplication } from "@/core/application/bootstrap";

export default function DashboardPage() {
  const [goal, setGoal] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setExecuting(true);
    const { facade } = bootstrapApplication();
    const res = await facade.executeTask(goal, {
      userId: "user_demo",
    });
    if (res.success) {
      setResult(`Task started: ${res.data.executionId}`);
    } else {
      setResult(`Error: ${res.error.messageKey}`);
    }
    setExecuting(false);
    setGoal("");
  }

  return (
    <div className="min-h-screen bg-8bit-bg text-8bit-text font-mono">
      <header className="border-4 border-8bit-accent bg-8bit-panel p-4 flex items-center justify-between shadow-8bit">
        <div>
          <h1 className="text-lg" style={{ textShadow: "0 0 5px #2a5a4a, 0 0 10px #2a5a4a" }}>
            8bitAI
          </h1>
          <p className="text-xs text-8bit-muted">PERSONAL AGENT v0.9</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-8bit-accent rounded-full animate-pulse" />
          <span className="text-xs text-8bit-muted">ONLINE</span>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <section className="grid grid-cols-2 gap-3">
          <div className="border-2 border-8bit-accent bg-gradient-to-br from-8bit-panel to-8bit-bg p-3 shadow-8bit">
            <p className="text-xs text-8bit-muted">ACTIVE TASKS</p>
            <p className="text-2xl text-8bit-accent">0</p>
          </div>
          <div className="border-2 border-8bit-accent bg-gradient-to-br from-8bit-panel to-8bit-bg p-3 shadow-8bit">
            <p className="text-xs text-8bit-muted">SYNC STATUS</p>
            <p className="text-sm text-8bit-accent">SYNCED</p>
            <p className="text-xs text-8bit-muted">0 pending</p>
          </div>
        </section>

        <section className="border-2 border-8bit-accent bg-gradient-to-br from-8bit-panel to-8bit-bg p-4 shadow-8bit">
          <h2 className="text-sm mb-3 text-8bit-accent">ASK 8bitAI</h2>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Type a task..."
              disabled={executing}
              className="flex-1 bg-8bit-bg border-2 border-8bit-accent text-8bit-text px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={executing}
              className="border-4 border-8bit-accent bg-8bit-accent text-8bit-bg px-4 py-2 text-sm font-bold hover:opacity-80 disabled:opacity-50"
            >
              {executing ? "..." : "SEND"}
            </button>
          </form>
          {result && (
            <p className="text-xs mt-2 text-8bit-muted">{result}</p>
          )}
        </section>

        <section>
          <h2 className="text-sm mb-3 text-8bit-accent">TOOLS</h2>
          <div className="grid grid-cols-3 gap-2">
            {["Web Search", "File Read", "Device Info"].map((tool) => (
              <button
                key={tool}
                className="border-2 border-8bit-accent bg-gradient-to-br from-8bit-panel to-8bit-bg p-3 text-xs hover:bg-8bit-panel shadow-8bit"
              >
                {tool}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}