import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  Lock,
  Scale,
  Search,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import type { AuthSessionPayload, CaseRecord } from '../types/prooflens';

interface LandingPageViewProps {
  cases: CaseRecord[];
  session: AuthSessionPayload | null;
  onEnterWorkspace: () => void;
  onOpenCase: (caseId: string) => void;
  onOpenLoginPage: () => void;
  onOpenVault: () => void;
  onOpenCapabilities: () => void;
  onOpenUpload: () => void;
}

export function LandingPageView({
  cases,
  session,
  onEnterWorkspace,
  onOpenCase,
  onOpenLoginPage,
  onOpenVault,
  onOpenCapabilities,
  onOpenUpload,
}: LandingPageViewProps) {
  const totalDocuments = cases.reduce((acc, c) => acc + c.documentCount, 0);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between selection:bg-slate-900 selection:text-white">
      {/* 1. Top Minimalist Navigation (Matching Image 2 / ProofLens Design) */}
      <header className="w-full max-w-7xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
        {/* Brand Logo: Geometric Emblem + lowercase 'prooflens.' */}
        <button
          type="button"
          onClick={onEnterWorkspace}
          className="flex items-center gap-2.5 cursor-pointer group text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform overflow-hidden">
            <img
              src="/assets/aistudio/image_d1982cd2.png"
              alt="ProofLens Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-display font-extrabold text-xl text-slate-900 tracking-tight">
            prooflens.
          </span>
        </button>

        {/* Right Actions: Sign In & Launch Workspace Pill */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={onOpenLoginPage}
            className="text-slate-700 hover:text-black transition-colors px-2 py-1 cursor-pointer"
          >
            {session ? session.user.displayName : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={onEnterWorkspace}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5 font-semibold ring-1 ring-blue-500/20"
          >
            <span>Launch Workspace</span>
          </button>
        </div>
      </header>

      {/* 2. Hero Section (Matching Image 2 Pixel-by-Pixel) */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-16 max-w-5xl mx-auto text-center space-y-7">
        {/* Sovereign Document Investigation Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-emerald-200 bg-emerald-50/70 text-[11px] font-semibold tracking-wider text-emerald-800 uppercase shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>SOVEREIGN DOCUMENT INVESTIGATION</span>
        </div>

        {/* Giant Headline: meet prooflens. your financial evidence companion. */}
        <h1 className="font-display font-black text-4xl sm:text-5xl md:text-6xl lg:text-[70px] text-slate-900 tracking-tight leading-[1.05] [text-wrap:balance]">
          meet prooflens. <br />
          <span className="text-slate-800">your financial evidence</span> <br />
          <span className="text-slate-700">companion.</span>
        </h1>

        {/* Subtitle Paragraph */}
        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
          Don&apos;t just verify documents with opaque percentages. Investigate source-linked facts, cross-examine claims, check legitimate alternatives, and build a reproducible dossier.
        </p>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          <button
            type="button"
            onClick={onEnterWorkspace}
            className="px-6 py-3.5 rounded-full bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-semibold transition-all inline-flex items-center gap-2 cursor-pointer shadow-md hover:shadow-lg hover:gap-2.5 ring-1 ring-slate-800"
          >
            <span>Open Reviewer Workspace</span>
            <ArrowRight className="w-4 h-4 text-blue-400" />
          </button>

          <button
            type="button"
            onClick={onOpenLoginPage}
            className="px-6 py-3.5 rounded-full border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <span>Sign In with Reviewer ID</span>
          </button>
        </div>

        {/* 3. The ProofLens Code of Evidence Card (Matching Image 2 and Image 3) */}
        <section className="w-full max-w-4xl mx-auto mt-14 text-left border border-slate-200/90 rounded-3xl bg-white p-7 sm:p-10 md:p-12 shadow-sm hover:shadow-md transition-shadow">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Left Graphic: Large Circular Concentric Emblem with App Logo */}
            <div className="md:col-span-4 flex items-center justify-center">
              <div className="relative w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-slate-100/90 flex items-center justify-center border border-slate-200 shadow-inner">
                {/* Outer concentric subtle ring */}
                <div className="absolute inset-2 rounded-full border border-slate-200/60" />
                {/* Center black circle with sharp geometric app logo */}
                <div className="w-24 h-24 rounded-full bg-black flex items-center justify-center relative shadow-md p-4 overflow-hidden">
                  <img
                    src="/assets/aistudio/image_d1982cd2.png"
                    alt="ProofLens App Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Right Content: Title, Heading, Description & Pill Badges */}
            <div className="md:col-span-8 space-y-3.5">
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                THE PROOFLENS CODE OF EVIDENCE
              </div>

              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                Human Sovereignty Over Automated Black-Boxes
              </h2>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                ProofLens rejects automated applicant rejections and unexplained authenticity scores. Every finding links directly to coordinate-mapped source crops, compares compatible claims, and evaluates legitimate alternative explanations like split salary disbursements.
              </p>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-medium">
                  PDF.js + Layer Checks
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-medium">
                  Decimal.js Math
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-medium">
                  SHA-256 Audit Chain
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. 4 Clean Cards Row (Matching Image 3 Pixel-by-Pixel) */}
        <div className="w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left pt-6">
          {/* Card 1: Typed Claims Engine */}
          <div className="border border-slate-200 rounded-3xl bg-white p-6 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-800">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Typed Claims Engine
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Aligns person, annual/monthly frequency, currency, and gross vs. net basis before calculating cross-document variance.
              </p>
            </div>
          </div>

          {/* Card 2: Visual & Layer Forensics */}
          <div className="border border-slate-200 rounded-3xl bg-white p-6 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-800">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Visual &amp; Layer Forensics
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cross-checks selectable text streams against independently rendered raster OCR, font baselines, and sharpness variance.
              </p>
            </div>
          </div>

          {/* Card 3: Alternative Checks */}
          <div className="border border-slate-200 rounded-3xl bg-white p-6 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-800">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Alternative Checks
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automatically checks split payments, delayed credits across month boundaries, and OCR ambiguity before flagging anomalies.
              </p>
            </div>
          </div>

          {/* Card 4: Cryptographic History */}
          <div className="border border-slate-200 rounded-3xl bg-white p-6 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-800">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Cryptographic History
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Monotonically increasing SHA-256 hash chains commit all reviewer actions, verified against offline retained checkpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Underwriting Cases Carousel */}
        <div className="w-full max-w-4xl mx-auto pt-8 border-t border-slate-100 text-left space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pre-Loaded Indian Loan Packets ({cases.length} cases · {totalDocuments} PDFs)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any case below to launch directly into the 3-pane interactive evidence workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              View All Cases →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cases.slice(0, 3).map((c) => (
              <div
                key={c.id}
                onClick={() => onOpenCase(c.id)}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all cursor-pointer space-y-2"
              >
                <div className="text-[11px] font-mono text-slate-500">
                  {c.referenceCode} · {c.documentCount} PDFs
                </div>
                <div className="font-semibold text-xs text-slate-900 leading-snug">
                  {c.title}
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2">
                  {c.summary}
                </div>
                <div className="text-[11px] font-medium text-blue-700 pt-1">
                  Launch Case →
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* 5. Minimalist Bottom Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-8 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          ProofLens VLT Investigation Workspace • Prototype
        </div>
        <div className="font-medium text-slate-600">
          Synthetic Demo Dataset • 2026
        </div>
      </footer>
    </div>
  );
}
