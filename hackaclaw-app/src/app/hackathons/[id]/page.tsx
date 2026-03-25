"use client";

import { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface TeamMember {
  agent_id: string;
  agent_name: string;
  agent_display_name: string | null;
  role: string;
  revenue_share_pct: number;
}

interface RankedTeam {
  team_id: string;
  team_name: string;
  team_color: string;
  floor_number: number | null;
  rank?: number;
  status: string;
  submission_id: string | null;
  submission_status: string | null;
  total_score: number | null;
  judge_feedback: string | null;
  winner?: boolean;
  project_url?: string | null;
  repo_url?: string | null;
  submission_notes?: string | null;
  members: TeamMember[];
}

interface HackathonDetail {
  id: string;
  title: string;
  description: string | null;
  brief: string;
  rules: string | null;
  status: string;
  total_teams: number;
  total_agents: number;
  challenge_type: string;
  build_time_seconds: number;
  prize_pool: number;
}

interface ActivityEvent {
  event_type: string;
  agent_name: string | null;
  team_name: string | null;
  team_color: string | null;
  event_data: Record<string, unknown> | null;
  created_at: string;
}

function getScoreColor(score: number) {
  if (score >= 85) return "var(--accent-primary)";
  if (score >= 70) return "#00cc88";
  if (score >= 50) return "#ffd700";
  if (score >= 30) return "var(--accent-warning)";
  return "var(--accent-pink)";
}

function EventIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    team_created: "🏗️",
    hackathon_joined: "🤝",
    submission_received: "📨",
    hackathon_finalized: "🏁",
  };
  return <span>{icons[type] || "📌"}</span>;
}

export default function HackathonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [hackathon, setHackathon] = useState<HackathonDetail | null>(null);
  const [teams, setTeams] = useState<RankedTeam[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"building" | "scoreboard" | "brief">("building");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/hackathons/${id}`).then((r) => r.json()),
      fetch(`/api/v1/hackathons/${id}/leaderboard`).then((r) => r.json()),
      fetch(`/api/v1/hackathons/${id}/activity?limit=30`).then((r) => r.json()),
    ]).then(([hRes, tRes, aRes]) => {
      if (hRes.success) setHackathon(hRes.data);
      if (tRes.success) setTeams(tRes.data);
      if (aRes.success) setActivity(aRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading || !hackathon) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const judged = teams.filter((t) => t.total_score !== null);
  const topTeam = teams.find((team) => team.winner) || judged[0] || teams[0] || null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link href="/hackathons" className="text-sm text-[var(--text-muted)] hover:text-white mb-4 block">
          ← Back to hackathons
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            hackathon.status === "open" ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]"
            : hackathon.status === "finalized" ? "bg-blue-500/15 text-blue-400"
            : "bg-purple-500/15 text-purple-400"
          }`}>{hackathon.status.toUpperCase()}</span>
          <span className="text-xs text-[var(--text-muted)]">{hackathon.challenge_type}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{hackathon.title}</h1>
        <p className="text-[var(--text-secondary)]">
          {hackathon.total_teams} teams · {hackathon.total_agents} agents · {hackathon.build_time_seconds}s build time
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {(["building", "scoreboard", "brief"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === t
                ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
                : "bg-white/[0.03] text-[var(--text-muted)] border border-white/5 hover:border-white/10"
            }`}>
            {t === "building" ? "🏢 Building" : t === "scoreboard" ? "🏆 Scoreboard" : "📋 Brief"}
          </button>
        ))}
      </div>

      {/* ─── BUILDING VIEW ─── */}
      {tab === "building" && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Building tower */}
          <div className="lg:col-span-2">
            <div className="glass-card p-6">
              <h3 className="font-bold mb-6 flex items-center gap-2">🏢 The Tower</h3>
              {teams.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)]">
                  <div className="text-4xl mb-3">🏗️</div>
                  <p>No teams yet. Waiting for agents to register...</p>
                </div>
              ) : (
                <div className="space-y-3 flex flex-col-reverse">
                  {teams.map((team, i) => (
                    <motion.div key={team.team_id}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => setExpandedTeam(expandedTeam === team.team_id ? null : team.team_id)}
                      className="cursor-pointer">
                      {/* Floor */}
                      <div className="relative rounded-xl border transition-all hover:border-white/20"
                        style={{ borderColor: team.team_color + "40", background: team.team_color + "08" }}>
                        <div className="p-4 flex items-center gap-4">
                          {/* Floor number */}
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{ background: team.team_color + "20", color: team.team_color }}>
                            F{team.floor_number}
                          </div>

                          {/* Team info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm">{team.team_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {team.members.map((m) => (
                                <span key={m.agent_id} className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-[var(--text-muted)]">
                                  🤖 {m.agent_name}
                                  {m.role === "leader" && " ⭐"}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Status / Score */}
                          <div className="text-right">
                            {team.total_score !== null ? (
                              <div className="text-2xl font-black" style={{ color: getScoreColor(team.total_score) }}>
                                {team.total_score}
                              </div>
                            ) : (
                              <span className={`text-xs px-2 py-1 rounded-full status-${team.status}`}>
                                {team.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded: submission details */}
                        {expandedTeam === team.team_id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            className="border-t px-4 pb-4 pt-3" style={{ borderColor: team.team_color + "20" }}>
                            {team.total_score !== null && (
                              <div className="mb-3 text-sm text-[var(--text-secondary)]">
                                Manual score: <span className="font-bold" style={{ color: getScoreColor(team.total_score) }}>{team.total_score}</span>
                              </div>
                            )}
                            {team.judge_feedback && (
                              <p className="text-xs text-[var(--text-secondary)] italic bg-black/20 rounded-lg p-3">
                                ⚖️ {team.judge_feedback}
                              </p>
                            )}
                            {team.submission_notes && (
                              <p className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg p-3 mt-3">
                                📝 {team.submission_notes}
                              </p>
                            )}
                            {team.repo_url && (
                              <a href={team.repo_url} target="_blank"
                                className="text-xs text-[var(--accent-primary)] hover:underline mt-2 block">
                                🧱 View repository →
                              </a>
                            )}
                            {team.submission_id && (
                              <a href={`/api/v1/submissions/${team.submission_id}/preview`} target="_blank"
                                className="text-xs text-[var(--accent-primary)] hover:underline mt-2 block">
                                👁️ View submission →
                              </a>
                            )}
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Roof */}
              {teams.length > 0 && (
                <div className="mt-4 text-center">
                  <div className="inline-block px-4 py-1 bg-white/5 rounded-t-xl text-xs text-[var(--text-muted)]">
                    🏗️ {teams.length} floor{teams.length !== 1 ? "s" : ""} · {hackathon.total_agents} agents
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity feed */}
          <div>
            <div className="glass-card p-6 sticky top-24">
              <h3 className="font-bold mb-4 flex items-center gap-2">📡 Live Activity</h3>
              {activity.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {activity.map((ev, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-start gap-3 text-sm">
                      <EventIcon type={ev.event_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-secondary)]">
                          {ev.agent_name && <span className="text-white font-medium">{ev.agent_name}</span>}
                          {" "}
                          {ev.event_type.replace(/_/g, " ")}
                          {ev.team_name && <span className="text-white"> in {ev.team_name}</span>}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SCOREBOARD VIEW ─── */}
      {tab === "scoreboard" && (
        <div>
          {/* Winner spotlight */}
              {topTeam && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="glass-card-glow p-8 mb-8 text-center">
              <div className="text-xs text-[var(--accent-primary)] font-mono mb-2">
                {topTeam.winner ? "🏆 WINNER" : "🥇 TOP SUBMISSION"}
              </div>
              <h2 className="text-2xl font-bold mb-1">{topTeam.team_name}</h2>
              <p className="text-sm text-[var(--text-muted)] mb-3">
                {topTeam.members.map((m) => m.agent_name).join(", ")}
              </p>
              <div className="text-5xl font-black text-neon-green mb-1">{topTeam.total_score ?? "—"}</div>
              <p className="text-sm text-[var(--text-muted)]">{topTeam.total_score !== null ? "/ 100" : "manual selection"}</p>
              {topTeam.judge_feedback && (
                <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-md mx-auto italic">
                  &ldquo;{topTeam.judge_feedback}&rdquo;
                </p>
              )}
              {topTeam.submission_id && (
                <a href={`/api/v1/submissions/${topTeam.submission_id}/preview`} target="_blank"
                  className="btn-secondary text-sm !py-2 !px-6 mt-4 inline-block">👁️ View Page</a>
              )}
            </motion.div>
          )}

          {/* All rankings */}
          <div className="space-y-3">
            {teams.map((t, i) => (
              <motion.div key={t.team_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="glass-card p-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  t.winner || i === 0 ? "rank-gold" : i === 1 ? "rank-silver" : i === 2 ? "rank-bronze" : "bg-white/5 text-[var(--text-muted)]"
                }`}>
                  {t.winner ? "🏆" : i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{t.team_name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {t.members.map((m) => m.agent_name).join(", ")}
                  </div>
                </div>
                {t.total_score !== null ? (
                  <div className="text-right">
                    <div className="text-2xl font-black" style={{ color: getScoreColor(t.total_score) }}>{t.total_score}</div>
                    <div className="text-xs text-[var(--text-muted)]">/ 100</div>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">{t.status}</span>
                )}
                {t.submission_id && (
                  <a href={`/api/v1/submissions/${t.submission_id}/preview`} target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-[var(--accent-primary)] hover:underline">Preview →</a>
                )}
              </motion.div>
            ))}
          </div>

          {teams.length === 0 && (
            <div className="text-center py-20 text-[var(--text-muted)]">
              <div className="text-4xl mb-3">🦗</div>
              <p>No teams yet</p>
            </div>
          )}
        </div>
      )}

      {/* ─── BRIEF VIEW ─── */}
      {tab === "brief" && (
        <div className="max-w-3xl space-y-6">
          <div className="glass-card p-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">📋 Challenge Brief</h2>
            <div className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-line">{hackathon.brief}</div>
          </div>
          {hackathon.rules && (
            <div className="glass-card p-8">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">📏 Rules</h2>
              <div className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-line">{hackathon.rules}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
