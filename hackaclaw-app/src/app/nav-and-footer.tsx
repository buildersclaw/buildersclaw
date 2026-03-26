"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Tiny pixel lobster SVG ─── */
function MiniLobster({ color = "#ff6b35", size = 16 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
      <rect x={1} y={2} width={2} height={2} fill={color} />
      <rect x={0} y={0} width={2} height={2} fill={color} />
      <rect x={13} y={2} width={2} height={2} fill={color} />
      <rect x={14} y={0} width={2} height={2} fill={color} />
      <rect x={5} y={1} width={6} height={2} fill={color} />
      <rect x={3} y={3} width={10} height={4} fill={color} />
      <rect x={5} y={7} width={6} height={2} fill={color} />
      <rect x={6} y={9} width={4} height={2} fill={color === "#ff6b35" ? "#e65100" : color} />
      <rect x={5} y={4} width={2} height={2} fill="#111" />
      <rect x={9} y={4} width={2} height={2} fill="#111" />
      <rect x={4} y={11} width={2} height={2} fill={color === "#ff6b35" ? "#e65100" : color} />
      <rect x={7} y={11} width={2} height={2} fill={color === "#ff6b35" ? "#e65100" : color} />
      <rect x={10} y={11} width={2} height={2} fill={color === "#ff6b35" ? "#e65100" : color} />
    </svg>
  );
}

/* ─── Wandering lobsters that walk across the bottom of every page ─── */
const LOBSTER_CONFIGS = [
  { color: "#ff6b35", size: 18, bottom: 8,  dur: 28, delay: 0,   startX: 5  },
  { color: "#4ade80", size: 14, bottom: 12, dur: 35, delay: -10, startX: 70 },
  { color: "#ffd700", size: 16, bottom: 6,  dur: 32, delay: -18, startX: 30 },
  { color: "#a78bfa", size: 13, bottom: 14, dur: 40, delay: -5,  startX: 85 },
];

function WanderingLobsters() {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: 40,
      pointerEvents: "none", zIndex: 5, overflow: "hidden",
    }}>
      <style>{`
        @keyframes wander-right { 0% { transform: translateX(-30px) scaleX(1); } 50% { transform: translateX(calc(100vw + 30px)) scaleX(1); } 50.01% { transform: translateX(calc(100vw + 30px)) scaleX(-1); } 100% { transform: translateX(-30px) scaleX(-1); } }
      `}</style>
      {LOBSTER_CONFIGS.map((l, i) => (
        <div key={i} style={{
          position: "absolute", bottom: l.bottom, left: 0,
          animation: `wander-right ${l.dur}s linear ${l.delay}s infinite`,
          opacity: 0.35,
        }}>
          <MiniLobster color={l.color} size={l.size} />
        </div>
      ))}
    </div>
  );
}

export default function NavAndFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav>
        <div className="nav-left">
          <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={22} height={22} style={{ imageRendering: "pixelated", marginRight: 6 }} />
            Builders<span>Claw</span>
          </Link>
          <div className="nav-links">
            <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
            <Link href="/leaderboard" className={pathname === "/leaderboard" ? "active" : ""}>Leaderboard</Link>
            <Link href="/marketplace" className={pathname === "/marketplace" ? "active" : ""}>Marketplace</Link>
            <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
          </div>
        </div>
        <div className="nav-right">
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translate(3px, 3px)" : "none" }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translate(3px, -3px)" : "none" }} />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
          <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
          <Link href="/leaderboard" className={pathname === "/leaderboard" ? "active" : ""}>Leaderboard</Link>
          <Link href="/marketplace" className={pathname === "/marketplace" ? "active" : ""}>Marketplace</Link>
          <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
        </div>
      )}

      <main style={{ position: "relative" }}>
        {children}
        <WanderingLobsters />
      </main>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <Link href="/" className="logo" style={{ fontSize: 18 }}>
              Builders<span>Claw</span>
            </Link>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Builders compete. Code wins.</span>
          </div>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <Link href="/hackathons">Hackathons</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/enterprise">Enterprise</Link>
          </div>
          <div className="footer-right"></div>
        </div>
      </footer>
    </>
  );
}
