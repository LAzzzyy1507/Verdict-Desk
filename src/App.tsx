import React, { useState, useEffect } from 'react';
import {
  ActiveTab,
  DecisionRecord,
  UserAccount,
  DynamicTypeSize,
} from './types';
import { storageService } from './services/storage';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { ResearchView } from './components/ResearchView';
import { HistoryView } from './components/HistoryView';
import { PromptLabView } from './components/PromptLabView';
import { DebateArenaView } from './components/DebateArenaView';
import { ShareSheetModal } from './components/ShareSheetModal';
import { AccountModal } from './components/AccountModal';
import { DynamicTypeSlider } from './components/DynamicTypeSlider';
import { ShortcutsModal } from './components/ShortcutsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('research');
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [currentDecision, setCurrentDecision] = useState<DecisionRecord | null>(null);
  const [debateTopicData, setDebateTopicData] = useState<{
    topic: string;
    sideA?: string;
    sideB?: string;
    context?: string;
  } | null>(null);

  // App Theme & Preferences
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('verdict_desk_theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [dynamicType, setDynamicType] = useState<DynamicTypeSize>(() =>
    storageService.getDynamicType()
  );

  // Cloud & Account
  const [account, setAccount] = useState<UserAccount | null>(() =>
    storageService.getAccount()
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // Offline Status
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    storageService.isOfflineOverride() || (typeof navigator !== 'undefined' && !navigator.onLine)
  );

  // Modals
  const [shareDecision, setShareDecision] = useState<DecisionRecord | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isDynamicTypeOpen, setIsDynamicTypeOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Initialize storage & theme
  useEffect(() => {
    const list = storageService.getDecisions();
    setDecisions(list);
    if (list.length > 0 && !currentDecision) {
      setCurrentDecision(list[0]);
    }

    // Apply Dynamic Type
    storageService.setDynamicType(dynamicType);

    // Network status listener
    const handleOnline = () => {
      if (!storageService.isOfflineOverride()) setIsOffline(false);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial Cloud Sync attempt if user was logged in
    if (account) {
      storageService.pullFromCloud().then((cloudData) => {
        if (cloudData && cloudData.length > 0) {
          setDecisions(cloudData);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync dark mode class with html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('verdict_desk_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('verdict_desk_theme', 'light');
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handleToggleOffline = () => {
    const nextState = !isOffline;
    setIsOffline(nextState);
    storageService.setOfflineOverride(nextState);
  };

  const handleSelectDynamicType = (size: DynamicTypeSize) => {
    setDynamicType(size);
    storageService.setDynamicType(size);
  };

  const handleDecisionCreated = (decision: DecisionRecord) => {
    const updated = storageService.saveDecision(decision);
    setDecisions(updated);
    setCurrentDecision(decision);
  };

  const handleSelectDecision = (decision: DecisionRecord) => {
    setCurrentDecision(decision);
    setActiveTab('research');
  };

  const handleUpdateDecision = (decision: DecisionRecord) => {
    const updated = storageService.saveDecision(decision);
    setDecisions(updated);
    if (currentDecision?.id === decision.id) {
      setCurrentDecision(decision);
    }
  };

  const handleDeleteDecision = (id: string) => {
    const updated = storageService.deleteDecision(id);
    setDecisions(updated);
    if (currentDecision?.id === id) {
      setCurrentDecision(updated[0] || null);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await storageService.syncWithCloudIfLoggedIn(decisions);
      const acc = storageService.getAccount();
      setAccount(acc);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (newAccount: UserAccount) => {
    storageService.saveAccount(newAccount);
    setAccount(newAccount);
    storageService.syncWithCloudIfLoggedIn(decisions);
  };

  const handleLogout = async () => {
    await storageService.logoutAccount();
    setAccount(null);
  };

  const handleRunLastDecisionAgain = () => {
    if (decisions.length > 0) {
      setCurrentDecision(decisions[0]);
      setActiveTab('research');
    }
  };

  const handleStartNewDecision = () => {
    setCurrentDecision(null);
    setActiveTab('research');
  };

  const handleEnterDebate = (topicData: {
    topic: string;
    sideA?: string;
    sideB?: string;
    context?: string;
  }) => {
    setDebateTopicData(topicData);
    setActiveTab('debate');
  };

  return (
    <div className="min-h-screen bg-[#F8F8F7] dark:bg-[#0E0F12] text-stone-900 dark:text-stone-100 flex flex-col font-sf-sans selection:bg-orange-100 dark:selection:bg-orange-950 transition-colors">
      {/* Top Navigation & Status Bar */}
      <Header
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        account={account}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenDynamicType={() => setIsDynamicTypeOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        isOffline={isOffline}
        onToggleOffline={handleToggleOffline}
        dynamicType={dynamicType}
      />

      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="bg-amber-100 dark:bg-amber-950/80 border-b border-amber-300 dark:border-amber-900 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200 font-medium">
          Offline Mode Active — Viewing locally cached briefs. Tap "Offline Mode" in header to toggle live search.
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-20">
        {activeTab === 'research' && (
          <ResearchView
            currentDecision={currentDecision}
            onDecisionCreated={handleDecisionCreated}
            onOpenShare={(d) => setShareDecision(d)}
            isOffline={isOffline}
            onStartNew={handleStartNewDecision}
            onEnterDebate={handleEnterDebate}
          />
        )}

        {activeTab === 'debate' && (
          <DebateArenaView
            initialTopic={debateTopicData}
            onSaveToVault={handleDecisionCreated}
            isOffline={isOffline}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            decisions={decisions}
            onSelectDecision={handleSelectDecision}
            onUpdateDecision={handleUpdateDecision}
            onDeleteDecision={handleDeleteDecision}
            isOffline={isOffline}
          />
        )}

        {activeTab === 'prompt_lab' && <PromptLabView />}
      </main>

      {/* Bottom iOS Tab Bar */}
      <TabBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        historyCount={decisions.length}
      />

      {/* Modals & Sheets */}
      {shareDecision && (
        <ShareSheetModal
          decision={shareDecision}
          isOpen={Boolean(shareDecision)}
          onClose={() => setShareDecision(null)}
        />
      )}

      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        account={account}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSyncNow={handleSyncNow}
        isSyncing={isSyncing}
        decisionCount={decisions.length}
      />

      <DynamicTypeSlider
        isOpen={isDynamicTypeOpen}
        onClose={() => setIsDynamicTypeOpen(false)}
        currentSize={dynamicType}
        onSelectSize={handleSelectDynamicType}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        lastDecision={decisions[0]}
        onRunLastDecisionAgain={handleRunLastDecisionAgain}
        onStartNewDecision={handleStartNewDecision}
      />
    </div>
  );
}
