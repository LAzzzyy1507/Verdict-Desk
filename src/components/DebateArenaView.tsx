import React, { useState, useEffect, useRef } from 'react';
import {
  DebateArenaSession,
  DebateFactCheckResult,
  DecisionRecord,
  ActiveTab,
} from '../types';
import { apiService, OfflineException } from '../services/api';
import { storageService } from '../services/storage';
import { triggerHaptic } from '../utils/haptics';
import {
  Swords,
  Scale,
  Search,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Send,
  User,
  Bot,
  CheckCircle2,
  Bookmark,
  Share2,
  ChevronDown,
  ChevronUp,
  Flame,
  HelpCircle,
  Award,
  Zap,
} from 'lucide-react';

interface DebateArenaViewProps {
  initialTopic?: {
    topic: string;
    sideA?: string;
    sideB?: string;
    context?: string;
  } | null;
  onSaveToVault?: (decision: DecisionRecord) => void;
  isOffline: boolean;
  onNavigateTab?: (tab: ActiveTab) => void;
}

export const DebateArenaView: React.FC<DebateArenaViewProps> = ({
  initialTopic,
  onSaveToVault,
  isOffline,
  onNavigateTab,
}) => {
  // Mode: 'arena' (AI vs AI + Judge) or 'spar' (User vs AI Cross-Examination)
  const [mode, setMode] = useState<'arena' | 'spar'>('arena');

  // Arena Mode State
  const [topic, setTopic] = useState(initialTopic?.topic || '');
  const [sideAName, setSideAName] = useState(initialTopic?.sideA || '');
  const [sideBName, setSideBName] = useState(initialTopic?.sideB || '');
  const [context, setContext] = useState(initialTopic?.context || '');
  const [isDebating, setIsDebating] = useState(false);
  const [debateStage, setDebateStage] = useState('');
  const [currentDebate, setCurrentDebate] = useState<DebateArenaSession | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showGroundingInspector, setShowGroundingInspector] = useState(false);

  // Spar Mode State (User vs AI)
  const [sparPersona, setSparPersona] = useState<'pragmatist' | 'devils_advocate' | 'skeptic'>('pragmatist');
  const [sparTopic, setSparTopic] = useState(initialTopic?.topic || '');
  const [sparUserStance, setSparUserStance] = useState('');
  const [sparInput, setSparInput] = useState('');
  const [sparMessages, setSparMessages] = useState<
    Array<{
      id: string;
      sender: 'user' | 'ai';
      text: string;
      vulnerabilityFlag?: string;
      judgeAssessment?: any;
      sources?: { title: string; url: string }[];
      searchQueries?: string[];
      timestamp: string;
    }>
  >([]);
  const [isSparring, setIsSparring] = useState(false);
  const sparEndRef = useRef<HTMLDivElement>(null);

  // Fact-Check Modal State
  const [factCheckClaim, setFactCheckClaim] = useState<string | null>(null);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [factCheckResult, setFactCheckResult] = useState<DebateFactCheckResult | null>(null);

  // Pre-load initial topic if provided
  useEffect(() => {
    if (initialTopic) {
      if (initialTopic.topic) {
        setTopic(initialTopic.topic);
        setSparTopic(initialTopic.topic);
      }
      if (initialTopic.sideA) setSideAName(initialTopic.sideA);
      if (initialTopic.sideB) setSideBName(initialTopic.sideB);
      if (initialTopic.context) setContext(initialTopic.context);
    }
  }, [initialTopic]);

  useEffect(() => {
    if (sparEndRef.current) {
      sparEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sparMessages, isSparring]);

  const debatePresets = [
    {
      title: 'M3 Air vs Framework 13',
      topic: 'Buy M3 MacBook Air 16GB vs Framework Laptop 13 AMD for engineering & daily use',
      sideA: 'MacBook Air M3',
      sideB: 'Framework Laptop 13',
      context: 'Needs 8h+ battery, terminal workflow, long-term 4-year durability.',
    },
    {
      title: 'Series B vs Big Tech',
      topic: 'Staff Engineer at Series B Startup ($160k + 0.3% equity) vs L6 Senior at Big Tech ($360k liquid)',
      sideA: 'Series B Startup',
      sideB: 'Big Tech Senior',
      context: 'Goal: Maximize 5-year wealth creation and career autonomy.',
    },
    {
      title: 'Home Mortgage vs Rent + Index',
      topic: 'Purchase 1st Single-Family Home with 6.8% mortgage in 2026 vs Rent + S&P 500 DCA',
      sideA: 'Buy Home (Mortgage)',
      sideB: 'Rent & Max Index Funds',
      context: '5-year timeframe in metro suburb, $120k down payment saved.',
    },
    {
      title: 'Postgres RDS vs Supabase',
      topic: 'Deploy self-managed PostgreSQL on AWS RDS vs Supabase / Serverless DB for new SaaS',
      sideA: 'Standard RDS Postgres',
      sideB: 'Supabase Serverless',
      context: 'Small 3-person dev team, expecting 50k monthly active users.',
    },
  ];

  const handleApplyPreset = (p: typeof debatePresets[0]) => {
    triggerHaptic('light');
    setTopic(p.topic);
    setSideAName(p.sideA);
    setSideBName(p.sideB);
    setContext(p.context);
  };

  const handleExecuteArena = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim() || isDebating) return;

    if (isOffline) {
      setErrorMessage('Network connection offline. Live search grounding requires active internet access.');
      triggerHaptic('warning');
      return;
    }

    setIsDebating(true);
    setErrorMessage(null);
    setCurrentDebate(null);
    setIsSaved(false);
    triggerHaptic('medium');

    setDebateStage('Connecting to Google Search grounding engine...');

    const stages = [
      'Executing live Google queries for verified 2026 specs & prices...',
      'Formulating Side A thesis & grounding benchmarks...',
      'Synthesizing Side B adversarial rebuttal & counter-evidence...',
      'Convening Verdict Desk Presiding Judge for scorecards & final ruling...',
    ];
    let stageIdx = 0;
    const interval = setInterval(() => {
      stageIdx = (stageIdx + 1) % stages.length;
      setDebateStage(stages[stageIdx]);
    }, 2800);

    try {
      const debateResult = await apiService.runDebateArena({
        topic: topic.trim(),
        sideAName: sideAName.trim() || undefined,
        sideBName: sideBName.trim() || undefined,
        context: context.trim() || undefined,
      });

      clearInterval(interval);
      setCurrentDebate(debateResult);
      triggerHaptic('success');
    } catch (err: any) {
      clearInterval(interval);
      console.error('Debate Arena execution error:', err);
      setErrorMessage(err.message || 'Failed to complete Google-grounded debate.');
      triggerHaptic('warning');
    } finally {
      setIsDebating(false);
    }
  };

  const handleSaveDebateToVault = () => {
    if (!currentDebate) return;
    triggerHaptic('light');

    // Create a synthesized DecisionRecord from the debate outcome
    const winnerName =
      currentDebate.judgeScorecard.winner === 'sideA'
        ? currentDebate.sideAName
        : currentDebate.judgeScorecard.winner === 'sideB'
        ? currentDebate.sideBName
        : currentDebate.judgeScorecard.winningOption;

    const newRecord: DecisionRecord = {
      id: 'vd_deb_' + Date.now(),
      question: currentDebate.topic,
      constraints: currentDebate.context || 'Adversarial Debate Arena Match',
      category: 'other',
      title: `${currentDebate.topic}`,
      verdict: {
        recommendedOption: winnerName,
        confidence: currentDebate.judgeScorecard.confidence || 'High',
        reasoning: `${currentDebate.judgeScorecard.winningOption} won by decision: ${currentDebate.judgeScorecard.keyDecidingFactor}. ${currentDebate.judgeScorecard.judgeSynthesis}`,
      },
      options: [
        {
          name: currentDebate.sideAName,
          isWinner: currentDebate.judgeScorecard.winner === 'sideA',
          statusBadge: `Score: ${currentDebate.judgeScorecard.sideAScore.total}/30`,
          keyFactors: [
            {
              factor: 'Factual Rigor',
              value: `${currentDebate.judgeScorecard.sideAScore.factualRigor}/10`,
              sentiment: currentDebate.judgeScorecard.sideAScore.factualRigor >= 7 ? 'positive' : 'neutral',
            },
            {
              factor: 'Evidence Strength',
              value: `${currentDebate.judgeScorecard.sideAScore.evidenceStrength}/10`,
              sentiment: currentDebate.judgeScorecard.sideAScore.evidenceStrength >= 7 ? 'positive' : 'neutral',
            },
          ],
        },
        {
          name: currentDebate.sideBName,
          isWinner: currentDebate.judgeScorecard.winner === 'sideB',
          statusBadge: `Score: ${currentDebate.judgeScorecard.sideBScore.total}/30`,
          keyFactors: [
            {
              factor: 'Factual Rigor',
              value: `${currentDebate.judgeScorecard.sideBScore.factualRigor}/10`,
              sentiment: currentDebate.judgeScorecard.sideBScore.factualRigor >= 7 ? 'positive' : 'neutral',
            },
            {
              factor: 'Evidence Strength',
              value: `${currentDebate.judgeScorecard.sideBScore.evidenceStrength}/10`,
              sentiment: currentDebate.judgeScorecard.sideBScore.evidenceStrength >= 7 ? 'positive' : 'neutral',
            },
          ],
        },
      ],
      referencePoints: [
        {
          label: 'Deciding Factor',
          metric: currentDebate.judgeScorecard.keyDecidingFactor,
          context: 'Decisive tipping point established through Google Search verification.',
          sourceHint: 'Google Search Grounding',
        },
      ],
      uncertainties: [],
      webSources: currentDebate.allSources.slice(0, 6),
      timestamp: new Date().toISOString(),
      trackedForAlerts: false,
    };

    const updated = storageService.saveDecision(newRecord);
    if (onSaveToVault) {
      onSaveToVault(newRecord);
    }
    setIsSaved(true);
    triggerHaptic('success');
  };

  // Sparring Mode Handlers (User vs AI)
  const handleStartSparringFromWinner = (winnerOption: string) => {
    setMode('spar');
    setSparTopic(topic || currentDebate?.topic || 'Debate Resolution');
    setSparUserStance(`I prefer ${winnerOption} based on the debate verdict.`);
    setSparMessages([
      {
        id: 'init_ai',
        sender: 'ai',
        text: `You are endorsing **${winnerOption}**. I am now loaded as **The ${
          sparPersona === 'pragmatist'
            ? 'Ruthless Pragmatist'
            : sparPersona === 'devils_advocate'
            ? "Devil's Advocate"
            : 'Technical Skeptic'
        }**. Lay out your strongest argument or defense for this choice, and I will cross-examine it against real-time Google Search data.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSendSparMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sparInput.trim() || isSparring) return;

    if (isOffline) {
      setErrorMessage('Network connection offline. Live search grounding requires active internet access.');
      triggerHaptic('warning');
      return;
    }

    const userText = sparInput.trim();
    setSparInput('');
    const userMsg = {
      id: 'usr_' + Date.now(),
      sender: 'user' as const,
      text: userText,
      timestamp: new Date().toISOString(),
    };

    const newHistory = [...sparMessages, userMsg];
    setSparMessages(newHistory);
    setIsSparring(true);
    triggerHaptic('light');

    try {
      const response = await apiService.sendDebateTurn({
        topic: sparTopic || topic || 'Decision Dilemma',
        userStance: sparUserStance || undefined,
        aiPersona: sparPersona,
        userMessage: userText,
        history: newHistory.slice(-8),
      });

      setSparMessages((prev) => [
        ...prev,
        {
          id: response.id || 'ai_' + Date.now(),
          sender: 'ai',
          text: response.text,
          vulnerabilityFlag: response.vulnerabilityFlag,
          judgeAssessment: response.judgeAssessment,
          sources: response.sources || [],
          searchQueries: response.searchQueries || [],
          timestamp: new Date().toISOString(),
        },
      ]);
      triggerHaptic('medium');
    } catch (err: any) {
      console.error('Sparring turn failed:', err);
      setErrorMessage(err.message || 'Failed to generate debater counter-argument.');
    } finally {
      setIsSparring(false);
    }
  };

  // Fact-Check Trigger
  const handleOpenFactCheck = async (claimText: string) => {
    triggerHaptic('light');
    setFactCheckClaim(claimText);
    setFactCheckResult(null);
    setIsFactChecking(true);

    try {
      const res = await apiService.factCheckClaim({
        claim: claimText,
        topic: topic || sparTopic || undefined,
      });
      setFactCheckResult(res);
      triggerHaptic('success');
    } catch (err: any) {
      console.error('Fact-check failed:', err);
      setErrorMessage(err.message || 'Failed to complete Google fact-check.');
    } finally {
      setIsFactChecking(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-12">
      {/* Header Banner with Google Search Grounding Badge */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80 dark:border-stone-800/80">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-600 text-white shadow-xs">
              <Swords className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-brief-serif text-xl md:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                  Debate Arena
                </h1>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 font-bold border border-orange-200 dark:border-orange-800">
                  Adversarial Engine
                </span>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400 font-sf-sans mt-0.5">
                Stress-test any dilemma with live Google Search Grounding & presiding judicial scorecard.
              </p>
            </div>
          </div>

          {/* Google Search Grounding Callout */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300 text-xs font-medium shrink-0">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span className="font-semibold">Google Search Grounded</span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 mt-4 bg-stone-100 dark:bg-stone-900/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMode('arena');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'arena'
                ? 'bg-white dark:bg-[#1E2024] text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            Arena Clash (AI vs AI + Judge)
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMode('spar');
              if (sparMessages.length === 0) {
                setSparMessages([
                  {
                    id: 'init_welcome',
                    sender: 'ai',
                    text: `State your decision, purchase dilemma, or career proposal. I will challenge your premise using real-time Google Search data, exposing uncalculated depreciation, hidden trade-offs, and empirical benchmarks.`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'spar'
                ? 'bg-white dark:bg-[#1E2024] text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            Spar with AI (Cross-Examination)
          </button>
        </div>
      </div>

      {/* Mode A: Arena Clash (AI vs AI + Presiding Judge) */}
      {mode === 'arena' && (
        <div className="space-y-5">
          {/* Arena Input Form */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-5 shadow-xs transition-colors">
            <form onSubmit={handleExecuteArena} className="space-y-4">
              <div>
                <label
                  htmlFor="arena-topic-input"
                  className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5"
                >
                  Debate Topic or Decision Matchup
                </label>
                <textarea
                  id="arena-topic-input"
                  rows={2}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. M3 MacBook Air 16GB vs Framework Laptop 13 AMD for engineering, or Series B Startup vs Big Tech Senior..."
                  disabled={isDebating}
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 resize-none transition-all leading-relaxed"
                />
              </div>

              {/* Side A & Side B Candidates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="side-a-input"
                    className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1"
                  >
                    Side A (Champion / Option 1)
                  </label>
                  <input
                    id="side-a-input"
                    type="text"
                    value={sideAName}
                    onChange={(e) => setSideAName(e.target.value)}
                    placeholder="e.g. MacBook Air M3"
                    disabled={isDebating}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="side-b-input"
                    className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1"
                  >
                    Side B (Challenger / Option 2)
                  </label>
                  <input
                    id="side-b-input"
                    type="text"
                    value={sideBName}
                    onChange={(e) => setSideBName(e.target.value)}
                    placeholder="e.g. Framework Laptop 13"
                    disabled={isDebating}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>

              {/* Context / Constraints */}
              <div>
                <label
                  htmlFor="context-input"
                  className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1"
                >
                  Context, Priorities, or Personal Constraints (Optional)
                </label>
                <input
                  id="context-input"
                  type="text"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. 8h battery critical, travel often, care about resale value after 3 years..."
                  disabled={isDebating}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                />
              </div>

              {/* Debate Presets Pills */}
              <div className="pt-1">
                <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">
                  High-Stakes Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {debatePresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      disabled={isDebating}
                      className="text-xs px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#1A1C20] text-stone-700 dark:text-stone-300 hover:border-orange-500/50 transition-colors"
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Launch Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isDebating || !topic.trim() || isOffline}
                  className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                >
                  {isDebating ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      <span>{debateStage || 'Conducting Google Search Grounded Debate...'}</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-4 h-4" />
                      <span>Start Live Adversarial Debate Clash</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Error Message */}
            {errorMessage && (
              <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Active Debate Clash Output */}
          {currentDebate && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Presiding Judge Verdict Card (Prominently at the Top) */}
              <div className="rounded-2xl border-2 border-orange-600 dark:border-orange-500 bg-orange-50/50 dark:bg-[#1C1613] p-5 md:p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-orange-600 text-white">
                      <Scale className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-orange-950 dark:text-orange-200">
                      Verdict Desk Judicial Ruling
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {currentDebate.judgeScorecard.confidence} Confidence Ruling
                  </span>
                </div>

                <div className="mt-2">
                  <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">Decisive Winner:</span>
                  <h2 className="font-brief-serif text-2xl md:text-3xl font-extrabold text-stone-950 dark:text-stone-50 tracking-tight mt-0.5">
                    {currentDebate.judgeScorecard.winningOption}
                  </h2>
                </div>

                {/* Scorecard Metric Grid */}
                <div className="grid grid-cols-2 gap-3 mt-4 p-3.5 rounded-xl bg-white/80 dark:bg-[#151619]/90 border border-orange-200/80 dark:border-orange-900/40">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {currentDebate.sideAName}
                      </span>
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {currentDebate.judgeScorecard.sideAScore.total}/30
                      </span>
                    </div>
                    <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-orange-600 h-full rounded-full transition-all"
                        style={{ width: `${(currentDebate.judgeScorecard.sideAScore.total / 30) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-stone-500 mt-1">
                      Factual: {currentDebate.judgeScorecard.sideAScore.factualRigor}/10 • Evidence:{' '}
                      {currentDebate.judgeScorecard.sideAScore.evidenceStrength}/10
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {currentDebate.sideBName}
                      </span>
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {currentDebate.judgeScorecard.sideBScore.total}/30
                      </span>
                    </div>
                    <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-stone-700 dark:bg-stone-400 h-full rounded-full transition-all"
                        style={{ width: `${(currentDebate.judgeScorecard.sideBScore.total / 30) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-stone-500 mt-1">
                      Factual: {currentDebate.judgeScorecard.sideBScore.factualRigor}/10 • Evidence:{' '}
                      {currentDebate.judgeScorecard.sideBScore.evidenceStrength}/10
                    </p>
                  </div>
                </div>

                {/* Deciding Factor */}
                <div className="mt-3.5 p-3 rounded-xl bg-orange-100/70 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 text-xs">
                  <span className="font-bold text-orange-950 dark:text-orange-200 uppercase tracking-wider text-[10px] block mb-0.5">
                    Decisive Tipping Point:
                  </span>
                  <p className="text-orange-900 dark:text-orange-100 font-medium">
                    {currentDebate.judgeScorecard.keyDecidingFactor}
                  </p>
                </div>

                {/* Synthesis */}
                <p className="mt-3.5 text-sm md:text-base leading-relaxed text-stone-800 dark:text-stone-200 border-l-2 border-orange-500 pl-3">
                  {currentDebate.judgeScorecard.judgeSynthesis}
                </p>

                {/* Action Bar */}
                <div className="mt-4 pt-3 border-t border-orange-200/80 dark:border-orange-900/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDebateToVault}
                      disabled={isSaved}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      {isSaved ? 'Saved to Decision Vault' : 'Save Ruling to Vault'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartSparringFromWinner(currentDebate.judgeScorecard.winningOption)}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Flame className="w-3.5 h-3.5 text-rose-600" />
                      Spar with AI on this Ruling
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-stone-500">
                    Audited with Google Search
                  </span>
                </div>
              </div>

              {/* Google Search Grounding Inspector Accordion */}
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-[#121620] p-4">
                <button
                  type="button"
                  onClick={() => setShowGroundingInspector(!showGroundingInspector)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
                        Google Search Grounding Inspector
                      </span>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        {currentDebate.searchQueries?.length || 0} live queries executed •{' '}
                        {currentDebate.allSources?.length || 0} cited web sources
                      </span>
                    </div>
                  </div>
                  {showGroundingInspector ? (
                    <ChevronUp className="w-4 h-4 text-stone-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-500" />
                  )}
                </button>

                {showGroundingInspector && (
                  <div className="mt-3 pt-3 border-t border-blue-200/80 dark:border-blue-900/50 space-y-3">
                    {/* Live Queries */}
                    {currentDebate.searchQueries && currentDebate.searchQueries.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-blue-800 dark:text-blue-300 font-bold block mb-1.5">
                          Executed Google Queries:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {currentDebate.searchQueries.map((query, qIdx) => (
                            <span
                              key={qIdx}
                              className="text-[11px] px-2.5 py-1 rounded-md bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 border border-blue-200 dark:border-blue-900 font-mono"
                            >
                              "{query}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cited Sources */}
                    {currentDebate.allSources && currentDebate.allSources.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-blue-800 dark:text-blue-300 font-bold block mb-1.5">
                          Verified Grounding Sources:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {currentDebate.allSources.map((source, sIdx) => (
                            <a
                              key={sIdx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-blue-500 text-xs text-stone-700 dark:text-stone-300 transition-colors"
                            >
                              <span className="truncate pr-2 font-medium">{source.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Debate Rounds Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-brief-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                    Round-by-Round Adversarial Transcript
                  </h3>
                  <span className="text-xs text-stone-500">2 Structured Rounds</span>
                </div>

                {currentDebate.rounds?.map((round, rIdx) => (
                  <div
                    key={rIdx}
                    className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-5 shadow-xs space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                        {round.title || `Round ${round.roundNumber}`}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        Google Search Verified
                      </span>
                    </div>

                    {/* Side A Argument */}
                    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-950 dark:text-blue-300">
                          {round.sideAArgument.speakerName || currentDebate.sideAName}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          Advocate A
                        </span>
                      </div>
                      <p className="text-xs md:text-sm font-semibold text-stone-900 dark:text-stone-100 italic">
                        "{round.sideAArgument.thesis}"
                      </p>

                      <div className="space-y-2 mt-2">
                        {round.sideAArgument.corePoints?.map((pt, pIdx) => (
                          <div
                            key={pIdx}
                            className="p-2.5 rounded-lg bg-white dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-stone-800 dark:text-stone-200">
                                {pt.point}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleOpenFactCheck(`${pt.point}: ${pt.evidence}`)}
                                title="Fact-Check this claim with Google Search"
                                className="shrink-0 p-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                              >
                                <Search className="w-2.5 h-2.5" />
                                Fact-Check
                              </button>
                            </div>
                            <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                              {pt.evidence}
                            </p>
                            {pt.statOrBenchmark && (
                              <span className="inline-block mt-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                                Benchmark: {pt.statOrBenchmark}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Side B Argument */}
                    <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/20 dark:bg-purple-950/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-950 dark:text-purple-300">
                          {round.sideBArgument.speakerName || currentDebate.sideBName}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                          Challenger B
                        </span>
                      </div>
                      <p className="text-xs md:text-sm font-semibold text-stone-900 dark:text-stone-100 italic">
                        "{round.sideBArgument.thesis}"
                      </p>

                      <div className="space-y-2 mt-2">
                        {round.sideBArgument.corePoints?.map((pt, pIdx) => (
                          <div
                            key={pIdx}
                            className="p-2.5 rounded-lg bg-white dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-stone-800 dark:text-stone-200">
                                {pt.point}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleOpenFactCheck(`${pt.point}: ${pt.evidence}`)}
                                title="Fact-Check this claim with Google Search"
                                className="shrink-0 p-1 text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
                              >
                                <Search className="w-2.5 h-2.5" />
                                Fact-Check
                              </button>
                            </div>
                            <p className="text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                              {pt.evidence}
                            </p>
                            {pt.statOrBenchmark && (
                              <span className="inline-block mt-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                                Benchmark: {pt.statOrBenchmark}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode B: Spar with AI Debater (User vs AI Cross-Examination) */}
      {mode === 'spar' && (
        <div className="space-y-4">
          {/* Persona Configuration Card */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-5 shadow-xs space-y-4">
            <div>
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                Select Your AI Sparring Opponent:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'pragmatist' as const,
                    name: 'The Pragmatist',
                    desc: 'Focuses on ROI, hidden depreciation & real costs.',
                    icon: Zap,
                  },
                  {
                    id: 'devils_advocate' as const,
                    name: "Devil's Advocate",
                    desc: 'Attacks assumptions and finds edge-case risks.',
                    icon: Flame,
                  },
                  {
                    id: 'skeptic' as const,
                    name: 'Technical Skeptic',
                    desc: 'Demands benchmarks, specs & thermal data.',
                    icon: Scale,
                  },
                ].map((persona) => {
                  const Icon = persona.icon;
                  const isSelected = sparPersona === persona.id;
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSparPersona(persona.id);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-orange-600 bg-orange-50/50 dark:bg-orange-950/30'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon
                          className={`w-4 h-4 ${
                            isSelected ? 'text-orange-600' : 'text-stone-500'
                          }`}
                        />
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          {persona.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-tight">
                        {persona.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sparring Topic Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="spar-topic-input"
                  className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1"
                >
                  Topic / Premise
                </label>
                <input
                  id="spar-topic-input"
                  type="text"
                  value={sparTopic}
                  onChange={(e) => setSparTopic(e.target.value)}
                  placeholder="e.g. Buying M3 Air or taking Series B offer..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label
                  htmlFor="spar-stance-input"
                  className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1"
                >
                  Your Initial Stance (Optional)
                </label>
                <input
                  id="spar-stance-input"
                  type="text"
                  value={sparUserStance}
                  onChange={(e) => setSparUserStance(e.target.value)}
                  placeholder="e.g. I want to buy the M3 Air 16GB because it has great battery"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
            </div>
          </div>

          {/* Sparring Message Transcript */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] p-4 shadow-xs space-y-4 min-h-[350px] max-h-[500px] overflow-y-auto">
            {sparMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-orange-600 text-white rounded-br-xs'
                      : 'bg-stone-100 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Vulnerability Flag Alert on AI response */}
                  {msg.vulnerabilityFlag && (
                    <div className="mt-2.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <div>
                        <span className="font-bold">Vulnerability Detected: </span>
                        <span>{msg.vulnerabilityFlag}</span>
                      </div>
                    </div>
                  )}

                  {/* Judge Assessment Score delta */}
                  {msg.judgeAssessment && (
                    <div className="mt-2 text-[10px] font-mono text-stone-500 dark:text-stone-400 flex items-center justify-between">
                      <span>Interim Momentum: {msg.judgeAssessment.whoIsWinning.toUpperCase()}</span>
                      <span>{msg.judgeAssessment.scoreDelta}</span>
                    </div>
                  )}

                  {/* Google Sources cited */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700/60 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="text-stone-400 font-mono">Google Grounded:</span>
                      {msg.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-1.5 py-0.5 rounded bg-white dark:bg-stone-900 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                        >
                          <span className="truncate max-w-[120px]">{s.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-stone-300 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isSparring && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-stone-50 dark:bg-stone-900/60 text-xs text-stone-500 animate-pulse">
                <Bot className="w-4 h-4 animate-spin text-orange-600" />
                <span>Searching Google for empirical counter-arguments & benchmarks...</span>
              </div>
            )}
            <div ref={sparEndRef} />
          </div>

          {/* Quick Challenge Prompts */}
          <div className="flex flex-wrap gap-1.5">
            {[
              'What about the 3-year resale value depreciation?',
              'Recent tests show battery life is fine under load though.',
              'The warranty and customer support make up for the price delta.',
              'The opportunity cost of not doing this is much higher.',
            ].map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSparInput(promptText);
                  triggerHaptic('light');
                }}
                disabled={isSparring}
                className="text-[11px] px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#151619] text-stone-600 dark:text-stone-300 hover:border-orange-500 transition-colors"
              >
                + {promptText}
              </button>
            ))}
          </div>

          {/* Message Input Box */}
          <form onSubmit={handleSendSparMessage} className="flex gap-2">
            <input
              type="text"
              value={sparInput}
              onChange={(e) => setSparInput(e.target.value)}
              placeholder="State your counter-argument or defense..."
              disabled={isSparring || isOffline}
              className="flex-1 px-4 py-2.5 text-xs md:text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151619] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
            />
            <button
              type="submit"
              disabled={isSparring || !sparInput.trim() || isOffline}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Counter</span>
            </button>
          </form>
        </div>
      )}

      {/* Fact-Check Modal / Drawer */}
      {factCheckClaim && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1A1C20] border border-stone-200 dark:border-stone-800 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  <Search className="w-4 h-4" />
                </span>
                <h3 className="font-brief-serif text-base font-bold text-stone-900 dark:text-stone-100">
                  Google Search Fact-Check
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFactCheckClaim(null)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 text-xs">
              <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider block mb-0.5">
                Target Claim:
              </span>
              <p className="font-medium text-stone-800 dark:text-stone-200 italic">
                "{factCheckClaim}"
              </p>
            </div>

            {isFactChecking ? (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                <RotateCcw className="w-6 h-6 text-blue-600 animate-spin" />
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  Scanning Google Search index for empirical verification...
                </p>
              </div>
            ) : factCheckResult ? (
              <div className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                      factCheckResult.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                        : factCheckResult.status === 'contradicted'
                        ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {factCheckResult.status === 'verified' ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    Status: {factCheckResult.status}
                  </span>
                  <span className="text-[11px] font-mono text-stone-500">
                    Google Grounded
                  </span>
                </div>

                {/* Explanation */}
                <p className="text-xs leading-relaxed text-stone-800 dark:text-stone-200">
                  {factCheckResult.explanation}
                </p>

                {/* Evidence */}
                {factCheckResult.evidence && (
                  <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs">
                    <span className="font-semibold text-blue-950 dark:text-blue-300 block mb-1">
                      Discovered Evidence & Numbers:
                    </span>
                    <p className="text-stone-700 dark:text-stone-300">{factCheckResult.evidence}</p>
                  </div>
                )}

                {/* Sources */}
                {factCheckResult.sources && factCheckResult.sources.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                      Verified Sources:
                    </span>
                    <div className="space-y-1">
                      {factCheckResult.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-900 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span className="truncate pr-2">{s.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setFactCheckClaim(null)}
                className="w-full py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold text-xs transition-colors"
              >
                Close Fact-Check
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
