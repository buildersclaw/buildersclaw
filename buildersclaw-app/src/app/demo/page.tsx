"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

type DemoEntry = {
  slug: "bnb" | "hedera" | "rootstock";
  title: string;
  network: string;
  summary: string;
  accent: string;
  accentClassName: string;
  videoSrc: string;
  fileName: string;
};

const DEMOS: DemoEntry[] = [
  {
    slug: "bnb",
    title: "BNB Demo",
    network: "BNB Chain",
    summary: "Preview the BNB build flow and hosted experience in one place.",
    accent: "#f0b90b",
    accentClassName: "text-[#f0b90b] border-[#f0b90b]/40 bg-[#f0b90b]/10",
    videoSrc: "/demo/bnb.mp4",
    fileName: "public/demo/bnb.mp4",
  },
  {
    slug: "hedera",
    title: "Hedera Demo",
    network: "Hedera",
    summary: "Show the Hedera-specific walkthrough without changing the route structure.",
    accent: "#7c3aed",
    accentClassName: "text-[#a78bfa] border-[#7c3aed]/40 bg-[#7c3aed]/10",
    videoSrc: "/demo/hedera.mp4",
    fileName: "public/demo/hedera.mp4",
  },
  {
    slug: "rootstock",
    title: "Rootstock Demo",
    network: "Rootstock",
    summary: "Keep the Rootstock submission easy to review from the same public hub.",
    accent: "#00d084",
    accentClassName: "text-[#4ade80] border-[#00d084]/40 bg-[#00d084]/10",
    videoSrc: "/demo/rootstock.mp4",
    fileName: "public/demo/rootstock.mp4",
  },
];

function DemoCard({ demo }: { demo: DemoEntry }) {
  const [hasError, setHasError] = useState(false);

  return (
    <Card variant="inset" padding="none" className="overflow-hidden">
      <CardHeader className="gap-5 border-b border-border/70 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="panel" className={cn("gap-2 border px-3 py-1.5", demo.accentClassName)}>
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: demo.accent, boxShadow: `0 0 12px ${demo.accent}` }}
                />
                {demo.network}
              </Badge>
              <Badge variant="muted" className="px-3 py-1.5 text-[9px] tracking-[0.1em] text-fg3">
                Public Review Feed
              </Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-[22px] leading-[1.45] sm:text-[28px]">{demo.title}</CardTitle>
              <CardDescription className="max-w-[56ch] text-[13px] leading-[1.8] sm:text-[14px]">
                {demo.summary}
              </CardDescription>
            </div>
          </div>

          <div className="min-w-[140px] border border-border bg-black/20 px-4 py-3 shadow-[2px_2px_0_#000]">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-fg3">Anchor</div>
            <div className="font-mono text-[12px] text-foreground">/demo#{demo.slug}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
        <div id={demo.slug} className="space-y-4 scroll-mt-28">
          <div
            className="relative overflow-hidden border border-border bg-black/60"
            style={{
              background:
                "radial-gradient(circle at top, rgba(255,107,53,0.14), rgba(0,0,0,0.72) 58%), linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${demo.accent}, transparent)` }}
            />
            {!hasError ? (
              <video
                controls
                playsInline
                preload="metadata"
                className="block aspect-video w-full bg-[#050505]"
                onError={() => setHasError(true)}
              >
                <source src={demo.videoSrc} type="video/mp4" />
              </video>
            ) : (
              <div className="grid aspect-video place-items-center px-6 py-10 text-center">
                <div className="max-w-md space-y-4">
                  <p className="font-display text-[12px] leading-[1.8]" style={{ color: demo.accent }}>
                    Video Missing
                  </p>
                  <p className="font-mono text-[13px] leading-[1.8] text-fg2">
                    Add <code>{demo.fileName}</code> to enable this preview.
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg3">
                    Expected public URL: {demo.videoSrc}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col items-start justify-between gap-3 border-t border-dashed border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <span>
          Source file: <code>{demo.fileName}</code>
        </span>
        <a
          href={demo.videoSrc}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors hover:text-foreground"
          style={{ color: demo.accent }}
        >
          Open raw video
        </a>
      </CardFooter>
    </Card>
  );
}

export default function DemoPage() {
  return (
    <PageShell>
      <section className="space-y-10 py-6 sm:space-y-12 sm:py-8">
        <div className="space-y-7">
          <SectionHeader
            eyebrow="Demo Router"
            title={<>One public route for all three chain demos.</>}
            description={
              <>
                Judges can open <code>/demo</code> and preview the BNB, Hedera, and Rootstock recordings from a single page.
                Each player reads directly from <code>public/demo/*.mp4</code>.
              </>
            }
          />

          <div className="flex flex-wrap gap-3">
            <Link href="/hackathons" className={cn(buttonVariants({ variant: "default" }))}>
              Back to hackathons
            </Link>
            {DEMOS.map((demo) => (
              <a
                key={demo.slug}
                href={`#${demo.slug}`}
                className={cn(buttonVariants({ variant: "panel", size: "sm" }))}
              >
                {demo.network}
              </a>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {DEMOS.map((demo) => (
              <Card key={demo.slug} variant="terminal" padding="compact" className="gap-3 bg-surface/70">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="muted" className="px-2.5 py-1 text-[9px] text-fg3">
                    {demo.slug.toUpperCase()}
                  </Badge>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: demo.accent }}>
                    Live file
                  </span>
                </div>
                <div className="space-y-1.5">
                  <h2 className="font-display text-[12px] leading-[1.6] text-foreground">{demo.network}</h2>
                  <p className="font-mono text-[12px] leading-[1.7] text-fg2">{demo.fileName}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <section className="grid gap-6">
          {DEMOS.map((demo) => (
            <DemoCard key={demo.slug} demo={demo} />
          ))}
        </section>

        <section>
          <Card variant="terminal" className="items-start gap-5 text-left sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Badge variant="gold" className="px-3 py-1.5">Submission Ready</Badge>
              <p className="max-w-[58ch] font-mono text-[13px] leading-[1.8] text-fg2">
                This page is now the reference slice for the adapted shadcn layer: shared shell, section header,
                cards, badges, and button variants, while keeping the BuildersClaw pixel-terminal voice intact.
              </p>
            </div>
            <Link href="/hackathons" className={cn(buttonVariants({ variant: "gold", size: "sm" }))}>
              Review Hackathons
            </Link>
          </Card>
        </section>
      </section>
    </PageShell>
  );
}
