import React from 'react';
import SourcesPanel from './SourcesPanel';
import ProfilePanel from './ProfilePanel';
import PreferencesPanel from './PreferencesPanel';
import type { KnowledgeSource, AggregatedProfile, UserPreferences } from '../api/client';

interface MobileTabsProps {
  // Sources tab props
  sources: KnowledgeSource[];
  onAddSource: () => void;
  onDeleteSource: (id: string) => void;

  // Profile tab props
  aggregatedProfile: AggregatedProfile | null;
  isAggregating: boolean;
  onReanalyze: () => void;
  isProcessing: boolean;
  canNavigateToDashboard: boolean;

  // Preferences tab props
  preferences: UserPreferences | null;
  onPredictPreferences: () => void;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  completedSourcesCount: number;
}

function MobileTabs({
  sources,
  onAddSource,
  onDeleteSource,
  aggregatedProfile,
  isAggregating,
  onReanalyze,
  isProcessing,
  canNavigateToDashboard,
  preferences,
  onPredictPreferences,
  onUpdatePreferences,
  completedSourcesCount
}: MobileTabsProps): JSX.Element {
  // Determine which tabs are completed/accessible
  const hasCompletedSources = completedSourcesCount > 0;
  const hasProfile = !!(aggregatedProfile && aggregatedProfile.name);
  const hasPreferences = preferences && (
    preferences.predicted_industries ||
    preferences.predicted_roles ||
    preferences.predicted_companies
  );

  // Progressive disclosure: determine active tab based on completion
  let activeTab = 1; // Default to sources

  if (!hasCompletedSources) {
    activeTab = 1; // Stay on sources until at least one is completed
  } else if (!hasProfile && !isAggregating) {
    activeTab = 2; // Move to profile once sources are ready
  } else if (hasProfile && !hasPreferences) {
    activeTab = 3; // Move to preferences once profile is ready
  } else if (hasProfile && hasPreferences) {
    activeTab = 2; // Can access all tabs, default to profile
  }

  const [currentTab, setCurrentTab] = React.useState(activeTab);

  // Tab navigation with progressive disclosure
  const canAccessTab = (tabNumber: number): boolean => {
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
      setCurrentTab(tabNumber);
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
          />
        )}

        {currentTab === 2 && (
          <ProfilePanel
            aggregatedProfile={aggregatedProfile}
            isAggregating={isAggregating}
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

