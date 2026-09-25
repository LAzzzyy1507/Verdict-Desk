import React, { useState } from 'react';
import { DecisionRecord, DecisionCategory } from '../types';
import { apiService } from '../services/api';
import { storageService } from '../services/storage';
import { VerdictCard } from './VerdictCard';
import { ComparisonTable } from './ComparisonTable';
import { ReferencePoints } from './ReferencePoints';
import { Uncertainties } from './Uncertainties';
import { FollowUpInput } from './FollowUpInput';
import {
  Compass,
  Sparkles,
  SlidersHorizontal,
  Globe,
  Share2,
  RotateCcw,
  Bell,
  BellOff,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface ResearchViewProps {
  currentDecision: DecisionRecord | null;
  onDecisionCreated: (decision: DecisionRecord) => void;
  onOpenShare: (decision: DecisionRecord) => void;
  isOffline: boolean;
  onStartNew: () => void;
  onEnterDebate?: (topicData: { topic: string; sideA?: string; sideB?: string; context?: string }) => void;
}

export const ResearchView: React.FC<ResearchViewProps> = ({
  currentDecision,
  onDecisionCreated,
  onOpenShare,
  isOffline,
  onStartNew,
  onEnterDebate,
}) => {
  const [question, setQuestion] = useState('');
  const [constraints, setConstraints] = useState('');
  const [category, setCategory] = useState<DecisionCategory>('shopping');
  const [showConstraints, setShowConstraints] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [researchStage, setResearchStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const presets = [
    {
      title: 'M3 Air vs M3 Pro',
      q: 'Should I buy the M3 MacBook Air 16GB or M3 Pro 14" for computer science and everyday coding?',
      c: 'Budget under $1,800. Needs to last 4 years. Portable.',
      cat: 'shopping' as DecisionCategory,
    },
    {
      title: 'Chicago vs NYC Offer',
      q: 'Accept $155k Staff Consultant offer in Chicago or $180k Senior PM offer in NYC Manhattan?',
      c: 'Maximize net post-tax savings and maintain work-life balance.',
      cat: 'career' as DecisionCategory,
    },
    {
      title: 'UCLA vs CMU SCS',
      q: 'UCLA In-State ($15k/yr) vs Carnegie Mellon SCS ($65k/yr) for software engineering career?',
      c: 'Student loans required for CMU delta. Goal: top-tier tech or AI startup.',
      cat: 'academic' as DecisionCategory,
    },
    {
      title: 'Sony XM5 vs Bose Ultra',
      q: 'Sony WH-1000XM5 vs Bose QuietComfort Ultra for frequent flights and home office calls?',
      c: 'Prioritize best noise cancellation and long-term ear comfort.',
      cat: 'shopping' as DecisionCategory,
    },
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    triggerHaptic('light');
    setQuestion(p.q);
    setConstraints(p.c);
    setCategory(p.cat);
    setShowConstraints(true);
  };

  const executeResearch = async (
    qText: string,
    cText: string,
    catVal: DecisionCategory,
    followUp?: string
  ) => {
    if (!qText.trim() || isResearching) return;
    if (isOffline) {
      setErrorMessage('Network connection offline. Live search requires active internet access.');
      triggerHaptic('warning');
      return;
    }

    setIsResearching(true);
    setErrorMessage(null);
    triggerHaptic('medium');

    // Real-time stage progression directly driven by server search and inference events
    setResearchStage('Connecting to live Google Search grounding engine...');

    try {
      const decision = await apiService.researchDecisionStream(
        {
          question: qText.trim(),
          constraints: cText.trim() || undefined,
          category: catVal,
          followUpContext: followUp,
          previousVerdict: currentDecision ? currentDecision.verdict : undefined,
        },
        (progress) => {
          if (progress.stage) {
            setResearchStage(progress.stage);
          }
        }
      );

      storageService.saveDecision(decision);
      onDecisionCreated(decision);
      triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Decision research encountered an error. Please try again.');
      triggerHaptic('warning');
    } finally {
      setIsResearching(false);
      setResearchStage('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeResearch(question, constraints, category);
  };

  const handleFollowUp = (adjustmentText: string) => {
    if (!currentDecision) return;
    executeResearch(
      currentDecision.question,
      currentDecision.constraints,
      currentDecision.category,
      adjustmentText
    );
  };

  const handleRecheckCurrent = async () => {
    if (!currentDecision || isOffline) return;
    triggerHaptic('medium');
    setIsResearching(true);
    setResearchStage('Re-checking current web data for price or spec updates...');
    try {
      const { decision: updated } = await apiService.recheckDecision(currentDecision);
      storageService.saveDecision(updated);
      onDecisionCreated(updated);
      triggerHaptic('success');
    } catch (err: any) {
      alert(err.message || 'Failed to re-check decision.');
      triggerHaptic('warning');
    } finally {
      setIsResearching(false);
      setResearchStage('');
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Input Box Section */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-5 shadow-xs transition-colors">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900">
                <Compass className="w-4 h-4" />
              </span>
              <h2 className="font-brief-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                Decision Briefing Input
              </h2>
            </div>
            {currentDecision && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onStartNew();
                  setQuestion('');
                  setConstraints('');
                }}
                className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 font-medium"
              >
                + New Decision
              </button>
            )}
          </div>

          {/* Question Input */}
          <div>
            <label
              htmlFor="decision-question-input"
              className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5"
            >
              What decision are you weighing?
            </label>
            <textarea
              id="decision-question-input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Choose between Job Offer A ($140k in Austin) vs Job Offer B ($165k in Seattle)..."
              disabled={isResearching}
              required
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-600 resize-none transition-all leading-relaxed"
            />
          </div>

          {/* Category Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">Domain:</span>
            {(['shopping', 'career', 'academic', 'other'] as DecisionCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setCategory(cat);
                }}
                className={`text-xs px-2.5 py-1 rounded-full capitalize transition-colors ${
                  category === cat
                    ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Optional Constraints Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowConstraints(!showConstraints)}
              className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5 hover:text-stone-900 dark:hover:text-stone-100"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showConstraints ? 'Hide Constraints' : '+ Add Constraints (Budget, Deadline, Location, Must-Haves)'}</span>
              {showConstraints ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showConstraints && (
              <div className="mt-2.5 space-y-2 animate-in fade-in">
                <input
                  type="text"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder="e.g. Budget max $1,500; must have 16GB+ RAM; 3+ years warranty..."
                  disabled={isResearching}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all"
                />
              </div>
            )}
          </div>

          {/* Presets Row */}
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-400 font-mono">Quick test:</span>
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(p)}
                disabled={isResearching}
                className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors"
              >
                {p.title}
              </button>
            ))}
          </div>

          {/* Submit CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!question.trim() || isResearching}
              className="w-full py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-stone-50 dark:text-stone-900 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-xs"
            >
              {isResearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Researching Live Web...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Research & Deliver Verdict</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Research Activity Indicator */}
        {isResearching && (
          <div className="mt-4 p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#1A1C20] flex items-center gap-3 animate-pulse">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
            <div>
              <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
                Live Internet Grounding Active
              </p>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 font-sf-sans">
                {researchStage || 'Querying real-time market data...'}
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div>
              <span className="font-semibold">Unable to complete research: </span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* Rendered Analyst Briefing */}
      {currentDecision && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* Briefing Title and Meta Bar */}
          <div className="flex items-center justify-between px-1">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500 font-semibold block">
                Executive Analyst Briefing
              </span>
              <h2 className="font-brief-serif text-xl md:text-2xl font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                {currentDecision.title}
              </h2>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onOpenShare(currentDecision);
                }}
                className="p-2 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors"
                title="Share Briefing"
                aria-label="Share Briefing"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleRecheckCurrent}
                disabled={isResearching || isOffline}
                className="p-2 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors disabled:opacity-40"
                title="Re-check against live web"
                aria-label="Re-check against live web"
              >
                <RotateCcw className={`w-4 h-4 ${isResearching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Web Sources Grounding Ribbon */}
          {currentDecision.webSources && currentDecision.webSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              <span className="text-[11px] font-mono text-stone-400 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Grounded via:
              </span>
              {currentDecision.webSources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-[11px] transition-colors"
                >
                  <span className="truncate max-w-[160px]">{source.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 text-stone-400" />
                </a>
              ))}
            </div>
          )}

          {/* 1. Verdict Card (Highest visual hierarchy, single pick, reserved accent) */}
          <VerdictCard
            verdict={currentDecision.verdict}
            category={currentDecision.category}
            onEnterDebate={
              onEnterDebate
                ? () => {
                    const topOther = currentDecision.options.find((o) => !o.isWinner);
                    onEnterDebate({
                      topic: currentDecision.question,
                      sideA: currentDecision.verdict.recommendedOption,
                      sideB: topOther?.name || 'Top Competitor',
                      context: currentDecision.constraints,
                    });
                  }
                : undefined
            }
          />

          {/* 2. Comparison Matrix (Stripped to deciding factors, winner marked) */}
          <ComparisonTable options={currentDecision.options} />

          {/* 3. Reference Points (Contextual baseline facts, neutral cards) */}
          <ReferencePoints points={currentDecision.referencePoints} />

          {/* 4. Uncertainty Flags (Unresolved gaps, transparently flagged) */}
          <Uncertainties uncertainties={currentDecision.uncertainties} />

          {/* 5. Follow-Up Modifier ("What if...") */}
          <FollowUpInput
            onApplyFollowUp={handleFollowUp}
            isLoading={isResearching}
            previousFollowUps={currentDecision.followUps}
          />
        </div>
      )}
    </div>
  );
};
