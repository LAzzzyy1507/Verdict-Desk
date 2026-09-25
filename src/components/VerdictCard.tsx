import React from 'react';
import { Verdict } from '../types';
import { CheckCircle2, ShieldAlert, Sparkles, Swords } from 'lucide-react';

interface VerdictCardProps {
  verdict: Verdict;
  category?: string;
  onEnterDebate?: () => void;
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ verdict, category, onEnterDebate }) => {
  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case 'High':
        return {
          bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
          label: 'High Confidence',
        };
      case 'Medium':
        return {
          bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          label: 'Medium Confidence',
        };
      default:
        return {
          bg: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700',
          label: 'Low Confidence',
        };
    }
  };

  const badge = getConfidenceBadge(verdict.confidence);

  return (
    <article
      id="verdict-card"
      aria-label="Decisive Verdict Recommendation"
      className="relative overflow-hidden rounded-2xl border-2 border-orange-600 dark:border-orange-500 bg-orange-50/40 dark:bg-[#1A1512] p-5 md:p-6 shadow-xs transition-all"
    >
      {/* Accent Ribbon Label (Strictly reserved for Verdict) */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-600 dark:bg-orange-500 text-white font-bold text-xs shadow-xs">
            ★
          </span>
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-orange-950 dark:text-orange-200">
            Official Verdict
          </span>
          {category && (
            <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-200/60 dark:bg-orange-950/60 text-orange-900 dark:text-orange-300 font-medium">
              {category}
            </span>
          )}
        </div>

        {/* Confidence Level */}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {badge.label}
        </span>
      </div>

      {/* Recommended Option Title */}
      <h3 className="font-brief-serif text-2xl md:text-3xl font-bold text-stone-950 dark:text-stone-50 tracking-tight leading-snug mt-2">
        {verdict.recommendedOption}
      </h3>

      {/* Decisive Executive Reasoning */}
      <p className="mt-3.5 text-base md:text-lg leading-relaxed text-stone-800 dark:text-stone-200 font-sf-sans antialiased border-l-2 border-orange-600/40 dark:border-orange-500/40 pl-3.5">
        {verdict.reasoning}
      </p>

      {/* Challenge in Debate Button */}
      {onEnterDebate && (
        <div className="mt-3.5">
          <button
            type="button"
            onClick={onEnterDebate}
            className="w-full py-2 px-3 rounded-xl bg-orange-600/10 hover:bg-orange-600/20 dark:bg-orange-950/40 dark:hover:bg-orange-900/60 text-orange-900 dark:text-orange-200 border border-orange-300 dark:border-orange-800/80 font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
          >
            <Swords className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Challenge this Verdict in the Debate Arena (Live Google Grounded)</span>
          </button>
        </div>
      )}

      {/* Grounded Assurance Footer */}
      <div className="mt-4 pt-3 border-t border-orange-200/60 dark:border-orange-900/40 flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-orange-600 dark:text-orange-500" />
          Single-outcome synthesis • Zero hedging
        </span>
        <span className="font-mono text-[11px]">Decisive pick</span>
      </div>
    </article>
  );
};
