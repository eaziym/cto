import React from 'react';
import SourcesPanel from './SourcesPanel';
import ProfilePanel from './ProfilePanel';
import PreferencesPanel from './PreferencesPanel';
import type { KnowledgeSource, AggregatedProfile, UserPreferences } from '../api/client';
import type { StreamProgress } from '../hooks/useResumeStream';
import type { AggregateProgress } from '../hooks/useAggregateStream';

interface MobileTabsProps {
  // Sources tab props
  sources: KnowledgeSource[];
  onAddSource: () => void;
  onDeleteSource: (id: string) => void;

  // Profile tab props
  aggregatedProfile: AggregatedProfile | null;
  isAggregating: boolean;
  aggregateProgress?: AggregateProgress;
  onReanalyze: () => void;
  isProcessing: boolean;
  canNavigateToDashboard: boolean;

  // Preferences tab props
  preferences: UserPreferences | null;
  onPredictPreferences: () => void;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  completedSourcesCount: number;

  // Streaming props
  streamingSourceId?: string | null;
  streamingProgress?: StreamProgress | null;

  // Onboarding tour props
  isTourActive?: boolean;
  tourTab?: number;
}

function MobileTabs({
  sources,
  onAddSource,
  onDeleteSource,
  aggregatedProfile,
  isAggregating,
  aggregateProgress,
  onReanalyze,
  isProcessing,
  canNavigateToDashboard,
  preferences,
  onPredictPreferences,
  onUpdatePreferences,
  completedSourcesCount,
  streamingSourceId,
  streamingProgress,
  isTourActive = false,
  tourTab
}: MobileTabsProps): JSX.Element {
  // Determine which tabs are completed/accessible
  const hasCompletedSources = completedSourcesCount > 0;
  const hasProfile = !!(aggregatedProfile && aggregatedProfile.name);
  const hasPreferences = preferences && (
    preferences.predicted_industries ||
    preferences.predicted_roles ||
    preferences.predicted_companies
  );

  // Track if we're currently streaming
  const isStreaming = streamingSourceId && streamingProgress && streamingProgress.status !== 'idle' && streamingProgress.status !== 'complete';

  // Initialize tab state - check sessionStorage first, then default to 1
  const [currentTab, setCurrentTab] = React.useState(() => {
    const saved = sessionStorage.getItem('mobileCurrentTab');
    return saved ? parseInt(saved, 10) : 1;
  });

  // Persist tab changes to sessionStorage
  const handleSetCurrentTab = (tab: number) => {
    setCurrentTab(tab);
    sessionStorage.setItem('mobileCurrentTab', tab.toString());
  };

  // Update tab when tour is active and tourTab changes
  React.useEffect(() => {
    if (isTourActive && tourTab) {
      handleSetCurrentTab(tourTab);
    }
  }, [isTourActive, tourTab]);

  // Track the previous streaming status to detect when it transitions to complete
  const prevStreamingStatusRef = React.useRef<string | undefined>();
  
  // When streaming completes, switch to profile tab
  React.useEffect(() => {
    const currentStatus = streamingProgress?.status;
    const prevStatus = prevStreamingStatusRef.current;
    
    // Only switch if streaming just completed (transitioned from non-complete to complete)
    if (
      currentStatus === 'complete' && 
      prevStatus && 
      prevStatus !== 'idle' && 
      prevStatus !== 'complete' &&
      currentTab === 1
    ) {
      // Wait a moment for the UI to update, then switch to profile tab
      const timer = setTimeout(() => {
        handleSetCurrentTab(2);
      }, 500);
      
      // Update ref for next comparison
      prevStreamingStatusRef.current = currentStatus;
      return () => clearTimeout(timer);
    }
    
    // Update ref
    prevStreamingStatusRef.current = currentStatus;
  }, [streamingProgress?.status, currentTab]);

  // Tab navigation with progressive disclosure
  const canAccessTab = (tabNumber: number): boolean => {
    // During tour, all tabs are accessible
    if (isTourActive) return true;

    switch (tabNumber) {
      case 1: return true; // Sources always accessible
      case 2: return hasCompletedSources; // Profile requires completed sources
      case 3: return hasProfile; // Preferences requires profile
      default: return false;
    }
  };

  const getTabStatus = (tabNumber: number): 'completed' | 'active' | 'locked' => {
    switch (tabNumber) {
      case 1: return hasCompletedSources ? 'completed' : 'active';
      case 2: return hasProfile ? 'completed' : (hasCompletedSources ? 'active' : 'locked');
      case 3: return hasPreferences ? 'completed' : (hasProfile ? 'active' : 'locked');
      default: return 'locked';
    }
  };

  const handleTabClick = (tabNumber: number) => {
    if (canAccessTab(tabNumber)) {
      handleSetCurrentTab(tabNumber);
    }
  };

  const tabs = [
    { id: 1, label: 'Sources', subtitle: 'Add your information' },
    { id: 2, label: 'Profile', subtitle: 'Review & edit' },
    { id: 3, label: 'Interests', subtitle: 'Set preferences' }
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 h-16 flex items-center">
        <div className="flex items-center justify-between w-full">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const canAccess = canAccessTab(tab.id);

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                disabled={!canAccess}
                className={`flex-1 px-3 py-2 text-center transition-colors ${
                  isActive
                    ? 'border-b-2 border-brand-500 text-brand-600'
                    : canAccess
                    ? 'text-gray-700 hover:text-gray-900'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-xs opacity-75">{tab.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {currentTab === 1 && (
          <SourcesPanel
            sources={sources}
            onAddSource={onAddSource}
            onDeleteSource={onDeleteSource}
            isCollapsed={false}
            onToggleCollapse={() => {}}
            streamingSourceId={streamingSourceId}
            streamingProgress={streamingProgress}
          />
        )}

        {currentTab === 2 && (
          <ProfilePanel
            aggregatedProfile={aggregatedProfile}
            isAggregating={isAggregating}
            aggregateProgress={aggregateProgress}
          />
        )}

        {currentTab === 3 && (
          <PreferencesPanel
            preferences={preferences}
            onPredictPreferences={onPredictPreferences}
            onUpdatePreferences={onUpdatePreferences}
            isProcessing={isProcessing}
            completedSourcesCount={completedSourcesCount}
            isCollapsed={false}
            onToggleCollapse={() => {}}
            canNavigateToDashboard={canNavigateToDashboard}
            onReanalyze={onReanalyze}
          />
        )}
      </div>
    </div>
  );
}

export default MobileTabs;

