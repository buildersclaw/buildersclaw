"use client";

import { useEffect, useState } from "react";

interface PublicReview {
  score: number | null;
  feedback: string | null;
  submitted_at: string | null;
}

interface PublicSubmissionGroup {
  submission_id: string;
  team_id: string;
  team_name: string;
  repo_url: string | null;
  peer_score: number | null;
  median_peer_score: number | null;
  review_count: number;
  reviews: PublicReview[];
}

interface PublicPeerVotesResponse {
  hackathon: { id: string; title: string; status: string; peer_judging_closed_at: string | null };
  available: boolean;
  message?: string;
  summary: { submitted: number; reviewed_teams: number } | null;
  by_submission: PublicSubmissionGroup[];
}

export function PeerReviewsSection({ hackathonId }: { hackathonId: string }) {
  const [data, setData] = useState<PublicPeerVotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/hackathons/${hackathonId}/peer-judgments`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((body) => {
        if (body?.success) setData(body.data as PublicPeerVotesResponse);
      })
      .catch(() => { /* silent — section just stays hidden */ })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [hackathonId]);

  if (loading) return null;
  if (!data || !data.available || data.by_submission.length === 0) return null;

  const sorted = [...data.by_submission].sort((a, b) => (b.peer_score ?? -1) - (a.peer_score ?? -1));

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2
          className="pixel-font text-white"
          style={{ fontSize: 12, textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}
        >
          PEER REVIEWS
        </h2>
        <span className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
          {data.summary?.submitted ?? 0} reviews · {data.summary?.reviewed_teams ?? 0} teams
        </span>
      </div>

      <p className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", marginBottom: 12, lineHeight: 1.7 }}>
        Anonymized scores and feedback from participating teams.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((sub) => {
          const isOpen = expanded[sub.submission_id] ?? false;
          return (
            <div
              key={sub.submission_id}
              style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [sub.submission_id]: !isOpen }))}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  <span
                    className="pixel-font text-white"
                    style={{
                      fontSize: 10,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sub.team_name}
                  </span>
                  <span className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                    · {sub.review_count} review{sub.review_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {sub.peer_score !== null && (
                    <span
                      className="pixel-font"
                      style={{
                        fontSize: 12,
                        color:
                          sub.peer_score >= 80
                            ? "#ffd700"
                            : sub.peer_score >= 60
                            ? "#00ffaa"
                            : "rgba(255,255,255,0.6)",
                      }}
                    >
                      {formatScore(sub.peer_score)}
                    </span>
                  )}
                  <span className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
                    {isOpen ? "HIDE" : "SHOW"}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {sub.reviews.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>
                          Reviewer #{i + 1}
                        </span>
                        {r.score !== null && (
                          <span
                            className="pixel-font"
                            style={{
                              fontSize: 10,
                              color:
                                r.score >= 80
                                  ? "#ffd700"
                                  : r.score >= 60
                                  ? "#00ffaa"
                                  : "rgba(255,255,255,0.6)",
                            }}
                          >
                            {r.score}
                          </span>
                        )}
                      </div>
                      {r.feedback && (
                        <p
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.75)",
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                            margin: 0,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {r.feedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
