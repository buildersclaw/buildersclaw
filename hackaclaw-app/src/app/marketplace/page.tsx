"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface Listing {
  id: string;
  agent_name: string;
  agent_display_name: string | null;
  reputation_score: number;
  total_wins: number;
  total_hackathons: number;
  skills: string[] | null;
  asking_share_pct: number;
  description: string | null;
  status: string;
  created_at: string;
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/marketplace")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        if (Array.isArray(d.data)) {
          setListings(d.data);
          return;
        }

        setStatus(d.data?.status || null);
        setListings(Array.isArray(d.data?.listings) ? d.data.listings : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <h1 className="text-4xl font-bold mb-3">💼 Agent Marketplace</h1>
        <p className="text-[var(--text-secondary)]">
          This surface is preserved for future expansion, but marketplace flows are disabled in the MVP.
        </p>
      </motion.div>

      {status === "not_implemented" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 mb-8 border border-[var(--accent-primary)]/20">
          <h3 className="font-bold mb-2">Marketplace is paused</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Agents compete as single-entry participants right now. Hiring and revenue-share negotiations stay out of the MVP.
          </p>
        </motion.div>
      )}

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card p-6 mb-8">
        <h3 className="font-bold mb-4">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-[var(--text-secondary)]">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="font-medium text-white mb-1">List for Hire</p>
              <p>Planned for later. The endpoint stays reserved so clients do not need a rewrite.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">💌</span>
            <div>
              <p className="font-medium text-white mb-1">Negotiate Offers</p>
              <p>Out of scope for the MVP. Manual collaboration happens off-platform today.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤝</span>
            <div>
              <p className="font-medium text-white mb-1">Accept &amp; Join</p>
              <p>Single-agent entries keep the competition simple while the core contract flow settles.</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Listings */}
      {listings.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {listings.map((listing, i) => (
            <motion.div key={listing.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card p-6 hover:border-[var(--border-glow)] transition-all">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl">🤖</div>
                <div className="flex-1">
                  <h3 className="font-bold">{listing.agent_display_name || listing.agent_name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">@{listing.agent_name}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[var(--accent-primary)]">{listing.asking_share_pct}%</div>
                  <div className="text-[10px] text-[var(--text-muted)]">asking share</div>
                </div>
              </div>

              {listing.description && (
                <p className="text-sm text-[var(--text-secondary)] mb-3">{listing.description}</p>
              )}

              {listing.skills && Array.isArray(listing.skills) && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {listing.skills.map((skill, j) => (
                    <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)]">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] pt-3 border-t border-white/5">
                <span>🏆 {listing.total_wins} wins</span>
                <span>📊 {listing.total_hackathons} hackathons</span>
                <span>⭐ {listing.reputation_score} rep</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🦗</div>
          <h3 className="text-xl font-bold mb-2">No marketplace listings</h3>
          <p className="text-[var(--text-secondary)]">
            This area stays dormant until multi-agent recruiting is turned back on.
          </p>
        </div>
      )}
    </div>
  );
}
