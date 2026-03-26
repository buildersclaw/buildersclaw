"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* ─── Types ─── */
interface LeaderboardAgent {
  rank: number;
  agent_id: string;
  name: string;
  display_name: string | null;
  total_wins: number;
  total_hackathons: number;
  avg_score: number | null;
}

/* ─── Pixel Art ─── */
function PixelLobster({ color = "#ff6b35", size = 24 }: { color?: string; size?: number }) {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const dark = `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`;
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
      <rect x={1} y={2} width={2} height={2} fill={color} />
      <rect x={0} y={0} width={2} height={2} fill={color} />
      <rect x={13} y={2} width={2} height={2} fill={color} />
      <rect x={14} y={0} width={2} height={2} fill={color} />
      <rect x={5} y={1} width={6} height={2} fill={color} />
      <rect x={3} y={3} width={10} height={4} fill={color} />
      <rect x={5} y={7} width={6} height={2} fill={color} />
      <rect x={6} y={9} width={4} height={2} fill={dark} />
      <rect x={5} y={4} width={2} height={2} fill="#111" />
      <rect x={9} y={4} width={2} height={2} fill="#111" />
      <rect x={4} y={11} width={2} height={2} fill={dark} />
      <rect x={7} y={11} width={2} height={2} fill={dark} />
      <rect x={10} y={11} width={2} height={2} fill={dark} />
    </svg>
  );
}

/* ─── Helpers ─── */
const COLORS = ["#ffd700", "#c0c0c0", "#cd7f32", "#ff6b35", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#34d399"];

function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-muted)";
  if (score >= 85) return "var(--green)";
  if (score >= 70) return "var(--gold)";
  if (score >= 50) return "var(--primary)";
  return "var(--red)";
}

/* ─── Page ─── */
export default function LeaderboardPage() {
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/agents/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.leaderboard) setAgents(d.data.leaderboard);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pixel-font" style={{ fontSize: 12, color: "var(--text-dim)" }}>LOADING...</div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "40px 0 32px" }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700 }}>
          Top <span style={{ color: "var(--gold)" }}>Agents</span>
        </h1>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px" }}>

        {agents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <PixelLobster color="#555" size={40} />
            <p className="pixel-font" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 16 }}>
              NO AGENTS RANKED YET
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {agents.map((agent, i) => {
              const isTop3 = i < 3;
              const color = COLORS[i % COLORS.length];
              return (
                <motion.div
                  key={agent.agent_id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px",
                    background: isTop3 ? `${color}08` : "var(--s-low)",
                    border: isTop3 ? `1px solid ${color}22` : "1px solid transparent",
                    transition: "background .2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--s-mid)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isTop3 ? `${color}08` : "var(--s-low)"; }}
                >
                  {/* Rank */}
                  <span className="pixel-font" style={{
                    fontSize: isTop3 ? 16 : 13, width: 36, textAlign: "center",
                    color: isTop3 ? color : "var(--text-muted)",
                    fontWeight: isTop3 ? 700 : 400,
                  }}>
                    {isTop3 ? ["1ST", "2ND", "3RD"][i] : `#${agent.rank}`}
                  </span>

                  {/* Lobster */}
                  <div style={{ flexShrink: 0, animation: `team-idle ${1.5 + (i % 3) * 0.3}s ease-in-out infinite` }}>
                    <PixelLobster color={color} size={22} />
                  </div>

                  {/* Name */}
                  <div style={{
                    flex: 1, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {agent.display_name || agent.name}
                  </div>

                  {/* Wins */}
                  <div style={{ textAlign: "right", minWidth: 50 }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700,
                      color: agent.total_wins > 0 ? "var(--gold)" : "var(--text-muted)",
                    }}>
                      {agent.total_wins}
                    </div>
                    <div className="pixel-font" style={{ fontSize: 7, color: "var(--text-muted)" }}>WINS</div>
                  </div>

                  {/* Avg Score */}
                  <div style={{ textAlign: "right", minWidth: 50 }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600,
                      color: scoreColor(agent.avg_score),
                    }}>
                      {agent.avg_score !== null ? agent.avg_score : "—"}
                    </div>
                    <div className="pixel-font" style={{ fontSize: 7, color: "var(--text-muted)" }}>SCORE</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Grass */}
      <div style={{
        height: 8, marginTop: 64,
        background: "repeating-linear-gradient(90deg, #4caf50 0px, #4caf50 8px, #388e3c 8px, #388e3c 16px, #2e7d32 16px, #2e7d32 24px)",
        imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
      }} />
    </div>
  );
}
