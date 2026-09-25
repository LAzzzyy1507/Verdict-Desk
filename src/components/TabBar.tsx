import React from 'react';
import { ActiveTab } from '../types';
import { Compass, Swords, Clock, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface TabBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  historyCount: number;
}

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onChangeTab,
  historyCount,
}) => {
  const tabs = [
    {
      id: 'research' as ActiveTab,
      label: 'Research',
      icon: Compass,
      badge: null,
    },
    {
      id: 'debate' as ActiveTab,
      label: 'Debate',
      icon: Swords,
      badge: null,
    },
    {
      id: 'history' as ActiveTab,
      label: 'History',
      icon: Clock,
      badge: historyCount > 0 ? historyCount : null,
    },
    {
      id: 'prompt_lab' as ActiveTab,
      label: 'Prompt Lab',
      icon: Sparkles,
      badge: null,
    },
  ];

  return (
    <nav
      aria-label="App Navigation"
      className="fixed bottom-0 left-0 right-0 z-30 bg-[#FBFBFA]/90 dark:bg-[#121316]/90 backdrop-blur-lg border-t border-stone-200/80 dark:border-stone-800/80 pb-safe transition-colors"
    >
      <div className="max-w-md mx-auto px-4 flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => {
                if (!isActive) {
                  triggerHaptic('light');
                  onChangeTab(tab.id);
                }
              }}
              aria-selected={isActive}
              role="tab"
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive
                  ? 'text-stone-900 dark:text-stone-100 font-semibold'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.25]' : 'stroke-[1.75]'
                  }`}
                />
                {tab.badge !== null && (
                  <span className="absolute -top-1 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 text-[10px] font-mono font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1 leading-none font-sf-sans">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-stone-900 dark:bg-stone-100 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
