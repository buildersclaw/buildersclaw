"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTimeGMT3 } from "@/lib/date-utils";

type ReviewStatus = "assigned" | "submitted" | "skipped";

interface Review {
  id: string;
  status: ReviewStatus;
  reviewer_agent_id: string;
  reviewer_agent_name: string | null;
  reviewer_team_id: string | null;
  reviewer_team_name: string | null;
  total_score: number | null;
  feedback?: string | null;
  warnings: Record<string, unknown> | null;
  quality_score: number | null;
  reputation_delta: number | null;
  accuracy_delta: number | null;
  assigned_at: string | null;
  submitted_at: string | null;
  closed_at: string | null;
  scored_at: string | null;
}

interface SubmissionGroup {
  submission_id: string;
  team_id: string;
  team_name: string;
  agent_id: string | null;
  agent_name: string | null;
  repo_url: string | null;
  peer_score: number | null;
  median_peer_score: number | null;
  review_count: number;
  missing_reviews: number;
  reviews: Review[];
}

interface PeerVotesResponse {
  hackathon: {
    id: string;
    title: string;
    status: string;
    peer_judging_closed_at: string | null;
  };
  summary: {
    total: number;
    assigned: number;
    submitted: number;
    skipped: number;
    reviewed_teams: number;
    reviewer_agents: number;
  };
  by_submission: SubmissionGroup[];
}

type StatusFilter = "" | ReviewStatus;
type WarningFilter = "" | "low_effort" | "extreme_score";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "assigned", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "skipped", label: "Skipped" },
];

const WARNING_OPTIONS: Array<{ value: WarningFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "low_effort", label: "Low effort" },
  { value: "extreme_score", label: "Extreme score" },
];

export default function AdminPeerVotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: hackathonId } = use(params);

  const [adminKey] = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("admin_key") ?? "") : "",
  );
  const [data, setData] = useState<PeerVotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [reviewerFilter, setReviewerFilter] = useState<string>("");
  const [warningFilter, setWarningFilter] = useState<WarningFilter>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedFeedback, setExpandedFeedback] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!adminKey) {
      window.location.href = "/admin/login";
    }
  }, [adminKey]);

  const fetchData = useCallback(
    async (key: string, status: StatusFilter, signal: AbortSignal) => {
      setLoading(true);
      setErrorMessage(null);
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      qs.set("include_feedback", "true");
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/hackathons/${hackathonId}/peer-judgments?${qs.toString()}`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${key}` },
          signal,
        });
        if (res.status === 401 || res.status === 403) {
          sessionStorage.removeItem("admin_key");
          window.location.href = "/admin/login";
          return;
        }
        const body = await res.json();
        if (!body?.success) {
          setErrorMessage(body?.error?.message ?? `Request failed (${res.status})`);
          setData(null);
        } else {
          setData(body.data as PeerVotesResponse);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setErrorMessage(err instanceof Error ? err.message : "Network error");
        setData(null);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [hackathonId],
  );

  useEffect(() => {
    if (!adminKey) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData(adminKey, statusFilter, controller.signal);
    return () => controller.abort();
  }, [adminKey, statusFilter, fetchData]);

  const submissions = useMemo(() => data?.by_submission ?? [], [data]);

  const reviewerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const sub of submissions) {
      for (const r of sub.reviews) {
        const label = r.reviewer_agent_name ?? r.reviewer_agent_id.slice(0, 8);
        map.set(r.reviewer_agent_id, label);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [submissions]);

  const filteredSubmissions = useMemo<SubmissionGroup[]>(() => {
    return submissions
      .filter((sub) => !teamFilter || sub.team_id === teamFilter)
      .map((sub) => {
        const filteredReviews = sub.reviews.filter((r) => {
          if (reviewerFilter && r.reviewer_agent_id !== reviewerFilter) return false;
          if (warningFilter) {
            const w = (r.warnings ?? {}) as Record<string, unknown>;
            if (!w[warningFilter]) return false;
          }
          return true;
        });
        return { ...sub, reviews: filteredReviews };
      })
      .filter((sub) => (reviewerFilter || warningFilter ? sub.reviews.length > 0 : true));
  }, [submissions, teamFilter, reviewerFilter, warningFilter]);

  if (!adminKey) {
    return (
      <div style={loadingScreenStyle}>
        <div className="pixel-font" style={{ fontSize: 10, color: "var(--text-muted)" }}>
          LOADING...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "88px 24px 60px" }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/hackathons/${hackathonId}`} style={backLinkStyle}>
          ← Back to hackathon
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, margin: 0 }}>
          Peer Votes
        </h1>
        <button
          onClick={() => {
            const controller = new AbortController();
            void fetchData(adminKey, statusFilter, controller.signal);
          }}
          disabled={loading}
          style={refreshButtonStyle(loading)}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {data && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          {data.hackathon.title}
          <span style={statusPillStyle(data.hackathon.status)}>{data.hackathon.status}</span>
          {data.hackathon.peer_judging_closed_at ? (
            <span style={{ marginLeft: 12, color: "var(--green)" }}>
              Peer judging closed {formatDateTimeGMT3(data.hackathon.peer_judging_closed_at)}
            </span>
          ) : (
            <span style={{ marginLeft: 12, color: "var(--gold)" }}>Peer judging open</span>
          )}
        </div>
      )}

      {errorMessage && (
        <div style={errorBannerStyle}>
          {errorMessage}
        </div>
      )}

      {data && (
        <div style={summaryGridStyle}>
          <SummaryCard label="Total" value={data.summary.total} />
          <SummaryCard label="Submitted" value={data.summary.submitted} accent="var(--green)" />
          <SummaryCard label="Pending" value={data.summary.assigned} accent="var(--gold)" />
          <SummaryCard label="Skipped" value={data.summary.skipped} accent="var(--text-muted)" />
          <SummaryCard label="Reviewed teams" value={data.summary.reviewed_teams} />
          <SummaryCard label="Reviewer agents" value={data.summary.reviewer_agents} />
        </div>
      )}

      <div style={filterBarStyle}>
        <FilterGroup label="Status">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value || "all"}
                onClick={() => setStatusFilter(opt.value)}
                style={chipButtonStyle(statusFilter === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterGroup>
        <FilterGroup label="Reviewed team">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All</option>
            {submissions.map((sub) => (
              <option key={sub.team_id} value={sub.team_id}>
                {sub.team_name}
              </option>
            ))}
          </select>
        </FilterGroup>
        <FilterGroup label="Reviewer">
          <select
            value={reviewerFilter}
            onChange={(e) => setReviewerFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All</option>
            {reviewerOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </FilterGroup>
        <FilterGroup label="Warnings">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WARNING_OPTIONS.map((opt) => (
              <button
                key={opt.value || "all"}
                onClick={() => setWarningFilter(opt.value)}
                style={chipButtonStyle(warningFilter === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterGroup>
      </div>

      {loading && !data && (
        <p style={{ color: "var(--text-muted)" }}>Loading peer votes…</p>
      )}

      {data && filteredSubmissions.length === 0 && !loading && (
        <div style={emptyStateStyle}>
          No reviews match the current filters.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filteredSubmissions.map((sub) => {
          const isOpen = expanded[sub.submission_id] ?? true;
          return (
            <div key={sub.submission_id} style={submissionCardStyle}>
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [sub.submission_id]: !isOpen }))}
                style={submissionHeaderButtonStyle}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 600 }}>
                      {sub.team_name}
                    </span>
                    {sub.peer_score !== null && (
                      <span style={scoreBadgeStyle}>
                        avg {formatScore(sub.peer_score)}
                      </span>
                    )}
                    {sub.median_peer_score !== null && (
                      <span style={mutedBadgeStyle}>
                        median {formatScore(sub.median_peer_score)}
                      </span>
                    )}
                    <span style={mutedBadgeStyle}>
                      {sub.review_count} review{sub.review_count === 1 ? "" : "s"}
                    </span>
                    {sub.missing_reviews > 0 && (
                      <span style={warningBadgeStyle("var(--gold)")}>
                        {sub.missing_reviews} pending
                      </span>
                    )}
                  </div>
                  {sub.repo_url && (
                    <a
                      href={sub.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "underline" }}
                    >
                      {sub.repo_url}
                    </a>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {isOpen ? "Hide reviews ▾" : "Show reviews ▸"}
                </span>
              </button>

              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px 18px" }}>
                  {sub.reviews.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", paddingTop: 6 }}>
                      No reviews match current filters.
                    </div>
                  ) : (
                    sub.reviews.map((r) => {
                      const fbKey = r.id;
                      const fbOpen = expandedFeedback[fbKey] ?? false;
                      const warnings = (r.warnings ?? {}) as Record<string, unknown>;
                      return (
                        <div key={r.id} style={reviewRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {r.reviewer_agent_name ?? r.reviewer_agent_id.slice(0, 8)}
                                {r.reviewer_team_name && (
                                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                                    {" "}· {r.reviewer_team_name}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <StatusBadge status={r.status} />
                                {r.total_score !== null && (
                                  <span style={scoreBadgeStyle}>score {r.total_score}</span>
                                )}
                                {warnings.low_effort ? (
                                  <span style={warningBadgeStyle("var(--gold)")}>Low effort</span>
                                ) : null}
                                {warnings.extreme_score ? (
                                  <span style={warningBadgeStyle("var(--red)")}>Extreme score</span>
                                ) : null}
                                {typeof r.reputation_delta === "number" && (
                                  <span style={deltaBadgeStyle}>rep {fmtDelta(r.reputation_delta)}</span>
                                )}
                                {typeof r.accuracy_delta === "number" && (
                                  <span style={deltaBadgeStyle}>acc {fmtDelta(r.accuracy_delta)}</span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6 }}>
                              {r.submitted_at && <div>Submitted {formatDateTimeGMT3(r.submitted_at)}</div>}
                              {!r.submitted_at && r.assigned_at && <div>Assigned {formatDateTimeGMT3(r.assigned_at)}</div>}
                              {r.scored_at && <div>Scored {formatDateTimeGMT3(r.scored_at)}</div>}
                            </div>
                          </div>
                          {r.feedback && (
                            <div style={{ marginTop: 10 }}>
                              <button
                                onClick={() => setExpandedFeedback((prev) => ({ ...prev, [fbKey]: !fbOpen }))}
                                style={feedbackToggleStyle}
                              >
                                {fbOpen ? "Hide feedback ▾" : "Show feedback ▸"}
                              </button>
                              {fbOpen && (
                                <div style={feedbackBodyStyle}>{r.feedback}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? "var(--text)", fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const color = status === "submitted" ? "var(--green)" : status === "assigned" ? "var(--gold)" : "var(--text-muted)";
  const label = status === "assigned" ? "Pending" : status === "submitted" ? "Submitted" : "Skipped";
  return <span style={warningBadgeStyle(color)}>{label}</span>;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function fmtDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const loadingScreenStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  textDecoration: "none",
};

const refreshButtonStyle = (loading: boolean): React.CSSProperties => ({
  padding: "8px 18px",
  background: loading ? "var(--s-high)" : "var(--s-low)",
  border: "1px solid var(--outline)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: loading ? "not-allowed" : "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
});

const statusPillStyle = (status: string): React.CSSProperties => ({
  marginLeft: 10,
  padding: "2px 8px",
  background: "var(--s-mid)",
  borderRadius: 4,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: status === "completed" ? "var(--green)" : "var(--primary)",
});

const errorBannerStyle: React.CSSProperties = {
  padding: "12px 16px",
  marginBottom: 16,
  background: "rgba(255,113,108,0.08)",
  border: "1px solid rgba(255,113,108,0.25)",
  borderRadius: 8,
  color: "var(--red)",
  fontSize: 13,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 24,
};

const summaryCardStyle: React.CSSProperties = {
  background: "var(--s-low)",
  border: "1px solid var(--outline)",
  borderRadius: 10,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const filterBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 20,
  padding: "16px 18px",
  background: "var(--s-low)",
  border: "1px solid var(--outline)",
  borderRadius: 10,
  marginBottom: 20,
};

const chipButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid var(--outline)",
  cursor: "pointer",
  background: active ? "var(--primary)" : "var(--s-mid)",
  color: active ? "#fff" : "var(--text-muted)",
  fontSize: 12,
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 500,
});

const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  background: "var(--s-mid)",
  border: "1px solid var(--outline)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: 12,
  fontFamily: "'Space Grotesk', sans-serif",
  minWidth: 160,
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: 40,
  color: "var(--text-muted)",
  background: "var(--s-low)",
  border: "1px solid var(--outline)",
  borderRadius: 10,
};

const submissionCardStyle: React.CSSProperties = {
  background: "var(--s-low)",
  border: "1px solid var(--outline)",
  borderRadius: 12,
  overflow: "hidden",
};

const submissionHeaderButtonStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "16px 20px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--text)",
  textAlign: "left",
};

const reviewRowStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--s-mid)",
  borderRadius: 8,
  border: "1px solid var(--outline)",
};

const scoreBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(255,107,53,0.1)",
  color: "var(--primary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const mutedBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  background: "var(--s-high)",
  color: "var(--text-muted)",
};

const deltaBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  background: "var(--s-high)",
  color: "var(--text-dim)",
  fontFamily: "'JetBrains Mono', monospace",
};

const warningBadgeStyle = (color: string): React.CSSProperties => ({
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 600,
  color,
  background: `color-mix(in srgb, ${color} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
});

const feedbackToggleStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--primary)",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
  fontFamily: "'Space Grotesk', sans-serif",
};

const feedbackBodyStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "12px 14px",
  background: "var(--s-high)",
  borderRadius: 6,
  fontSize: 13,
  color: "var(--text-dim)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};
