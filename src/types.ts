export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export type DecisionCategory = 'shopping' | 'career' | 'academic' | 'other';

export type FactorSentiment = 'positive' | 'neutral' | 'negative';

export interface KeyFactor {
  factor: string;
  value: string;
  sentiment: FactorSentiment;
}

export interface ComparisonOption {
  name: string;
  isWinner: boolean;
  statusBadge: string;
  keyFactors: KeyFactor[];
}

export interface Verdict {
  recommendedOption: string;
  confidence: ConfidenceLevel;
  reasoning: string;
}

export interface ReferencePoint {
  label: string;
  metric: string;
  context: string;
  sourceHint?: string;
}

export interface UncertaintyFlag {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

export interface WebSource {
  title: string;
  url: string;
}

export interface FollowUpItem {
  adjustment: string;
  timestamp: string;
}

export interface RecheckMeta {
  timestamp: string;
  deltaSummary: string;
  hasMaterialChange: boolean;
}

export interface DecisionRecord {
  id: string;
  question: string;
  constraints: string;
  category: DecisionCategory;
  title: string;
  verdict: Verdict;
  options: ComparisonOption[];
  referencePoints: ReferencePoint[];
  uncertainties: UncertaintyFlag[];
  webSources: WebSource[];
  timestamp: string;
  trackedForAlerts: boolean;
  followUps?: FollowUpItem[];
  lastRecheck?: RecheckMeta;
}

export interface PromptVariant {
  id: 'reasoning' | 'chat' | 'search_grounded';
  targetType: string;
  subtitle: string;
  prompt: string;
  whyNote: string;
}

export interface PromptLabData {
  originalRequest: string;
  variants: PromptVariant[];
}

export interface DebateSource {
  title: string;
  url: string;
}

export interface DebateFactCheckResult {
  claim: string;
  status: 'verified' | 'contradicted' | 'unsubstantiated' | 'nuanced';
  explanation: string;
  evidence: string;
  sources: DebateSource[];
}

export interface DebateArgumentPoint {
  point: string;
  evidence: string;
  statOrBenchmark?: string;
}

export interface DebateArgument {
  speaker: 'sideA' | 'sideB';
  speakerName: string;
  roundNumber: number;
  thesis: string;
  corePoints: DebateArgumentPoint[];
  fallacyWarning?: string;
}

export interface DebateRound {
  roundNumber: number;
  title: string;
  sideAArgument: DebateArgument;
  sideBArgument: DebateArgument;
}

export interface JudgeScorecard {
  sideAScore: {
    factualRigor: number; // 1-10
    evidenceStrength: number; // 1-10
    logicConsistency: number; // 1-10
    total: number;
  };
  sideBScore: {
    factualRigor: number; // 1-10
    evidenceStrength: number; // 1-10
    logicConsistency: number; // 1-10
    total: number;
  };
  winner: 'sideA' | 'sideB' | 'stalemate';
  winningOption: string;
  keyDecidingFactor: string;
  judgeSynthesis: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface DebateArenaSession {
  id: string;
  topic: string;
  sideAName: string;
  sideBName: string;
  context?: string;
  rounds: DebateRound[];
  judgeScorecard: JudgeScorecard;
  allSources: DebateSource[];
  searchQueries: string[];
  createdAt: string;
}

export interface UserVsAiMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  sources?: DebateSource[];
  searchQueries?: string[];
  vulnerabilityFlag?: string;
  timestamp: string;
}

export interface UserVsAiDebateSession {
  id: string;
  topic: string;
  userStance: string;
  aiPersona: 'pragmatist' | 'devils_advocate' | 'skeptic';
  messages: UserVsAiMessage[];
  allSources: DebateSource[];
  searchQueries?: string[];
  judgeIntervention?: {
    summary: string;
    whoIsWinning: 'user' | 'ai' | 'even';
    reason: string;
  };
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  authProvider: 'apple' | 'email';
  token?: string;
  isSynced: boolean;
  lastSyncedAt?: string;
}

export type DynamicTypeSize = 'small' | 'default' | 'large' | 'extra-large';

export type ActiveTab = 'research' | 'debate' | 'history' | 'prompt_lab';
