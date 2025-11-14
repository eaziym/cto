import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight, ChevronDown, CheckCircle2, ArrowRight, User, Briefcase } from 'lucide-react';
import type { UserPreferences } from '../api/client';

interface PreferencesPanelProps {
  preferences: UserPreferences | null;
  onPredictPreferences: () => void;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  isProcessing: boolean;
  completedSourcesCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  canNavigateToDashboard: boolean;
  onReanalyze: () => void;
}

function PreferencesPanel({
  preferences,
  onPredictPreferences,
  onUpdatePreferences,
  isProcessing,
  completedSourcesCount,
  isCollapsed,
  onToggleCollapse,
  canNavigateToDashboard,
  onReanalyze
}: PreferencesPanelProps): JSX.Element {
  const hasPreferences = preferences && (
    preferences.predicted_industries ||
    preferences.predicted_roles ||
    preferences.predicted_companies
  );

  if (isCollapsed) {
    return (
      <div className="h-full bg-white border-l border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            title="Expand preferences panel"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
        </div>
        <div className="p-2 space-y-2">
          <div className="w-full flex items-center justify-center p-2 bg-purple-50 rounded-lg" title="Your Interests">
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>

          {/* Show interest indicators */}
          {hasPreferences && (
            <>
              {preferences.confirmed_industries && preferences.confirmed_industries.length > 0 && (
                <div
                  className="w-full p-2 bg-purple-50 rounded-lg text-center"
                  title={`Industries (${preferences.confirmed_industries.length}): ${preferences.confirmed_industries.slice(0, 3).join(', ')}${preferences.confirmed_industries.length > 3 ? ' +more' : ''}`}
                >
                  <Briefcase className="h-4 w-4 text-purple-600 mx-auto" />
                </div>
              )}

              {preferences.confirmed_roles && preferences.confirmed_roles.length > 0 && (
                <div
                  className="w-full p-2 bg-blue-50 rounded-lg text-center"
                  title={`Roles (${preferences.confirmed_roles.length}): ${preferences.confirmed_roles.slice(0, 3).join(', ')}${preferences.confirmed_roles.length > 3 ? ' +more' : ''}`}
                >
                  <User className="h-4 w-4 text-blue-600 mx-auto" />
                </div>
              )}

              {preferences.confirmed_companies && preferences.confirmed_companies.length > 0 && (
                <div
                  className="w-full p-2 bg-green-50 rounded-lg text-center"
                  title={`Companies (${preferences.confirmed_companies.length}): ${preferences.confirmed_companies.slice(0, 3).join(', ')}${preferences.confirmed_companies.length > 3 ? ' +more' : ''}`}
                >
                  <Briefcase className="h-4 w-4 text-green-600 mx-auto" />
                </div>
              )}
            </>
          )}

          {canNavigateToDashboard && (
            <div className="mt-4 pt-2 border-t border-gray-200">
              <Link
                to="/jobs"
                className="w-full flex items-center justify-center p-2 bg-brand-600 rounded-lg text-white hover:bg-brand-700 transition-colors"
                title="View Matched Jobs"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white border-l border-gray-200 flex flex-col" data-tour="preferences-panel">
      <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-medium text-gray-900">Your Interests</h3>
          <div className="flex items-center space-x-1">
            <button
              onClick={onReanalyze}
              disabled={isProcessing || completedSourcesCount === 0}
              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh insights"
            >
              <Sparkles className="h-3 w-3" />
            </button>
            <button
              onClick={onToggleCollapse}
              className="hidden lg:block p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Collapse preferences panel"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {hasPreferences ? (
          <div className="space-y-6">
            {/* Industries */}
            {preferences.predicted_industries && preferences.predicted_industries.length > 0 && (
              <PreferenceSelector
                title="Industries"
                predictions={preferences.predicted_industries}
                confirmed={preferences.confirmed_industries || []}
                onUpdate={(items) => onUpdatePreferences({ confirmed_industries: items })}
                color="purple"
              />
            )}

            {/* Roles */}
            {preferences.predicted_roles && preferences.predicted_roles.length > 0 && (
              <PreferenceSelector
                title="Roles"
                predictions={preferences.predicted_roles}
                confirmed={preferences.confirmed_roles || []}
                onUpdate={(items) => onUpdatePreferences({ confirmed_roles: items })}
                color="blue"
              />
            )}

            {/* Companies */}
            {preferences.predicted_companies && preferences.predicted_companies.length > 0 && (
              <PreferenceSelector
                title="Companies"
                predictions={preferences.predicted_companies}
                confirmed={preferences.confirmed_companies || []}
                onUpdate={(items) => onUpdatePreferences({ confirmed_companies: items })}
                color="green"
              />
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Sparkles className="mx-auto mb-4 h-12 w-12 text-purple-400" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">Discover Your Interests</h4>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Let us analyze your profile and suggest career interests based on your experience and skills.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 space-y-3">
        {canNavigateToDashboard ? (
          <Link
            to="/jobs"
            className="w-full flex items-center justify-center space-x-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 hover:text-white"
          >
            <span>Matched Jobs</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-600 mb-1">Complete your profile to unlock</p>
            <div className="text-xs text-gray-500">Add more sources or set preferences</div>
          </div>
        )}

      </div>
    </div>
  );
}

interface PreferenceSelectorProps {
  title: string;
  predictions: Array<{ name: string; confidence: number; reasoning: string }>;
  confirmed: string[];
  onUpdate: (items: string[]) => void;
  color: 'purple' | 'blue' | 'green';
}

function PreferenceSelector({
  title,
  predictions,
  confirmed,
  onUpdate,
  color = 'blue',
}: PreferenceSelectorProps): JSX.Element {
  const [selectedItems, setSelectedItems] = useState<string[]>(confirmed || []);
  const [isExpanded, setIsExpanded] = useState(true);

  // Sync local state when confirmed prop changes (e.g., after regeneration)
  useEffect(() => {
    setSelectedItems(confirmed || []);
  }, [confirmed]);

  const toggleItem = (itemName: string) => {
    const newSelected = selectedItems.includes(itemName)
      ? selectedItems.filter((i) => i !== itemName)
      : [...selectedItems, itemName];
    setSelectedItems(newSelected);
    onUpdate(newSelected);
  };

  const colorClasses = {
    purple: {
      selected: 'border-purple-500 bg-purple-50 text-purple-800',
      unselected: 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50',
      check: 'text-purple-600',
    },
    blue: {
      selected: 'border-blue-500 bg-blue-50 text-blue-800',
      unselected: 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50',
      check: 'text-blue-600',
    },
    green: {
      selected: 'border-green-500 bg-green-50 text-green-800',
      unselected: 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:bg-green-50',
      check: 'text-green-600',
    },
  };

  const classes = colorClasses[color];

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full mb-3 flex items-center justify-between text-left hover:bg-gray-50 p-2 rounded transition-colors"
      >
        <h4 className="text-sm font-medium text-gray-700">{title}</h4>
        <div className="text-gray-400 hover:text-gray-600 transition-colors">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-1.5">
          {predictions.slice(0, 5).map((pred) => {
            const isSelected = selectedItems.includes(pred.name);
            return (
              <button
                key={pred.name}
                onClick={() => toggleItem(pred.name)}
                className={`group w-full text-left flex items-start justify-between space-x-2 rounded border p-2 text-xs transition ${
                  isSelected ? classes.selected : classes.unselected
                }`}
                title={`${pred.reasoning} (${Math.round(pred.confidence * 100)}% confidence)`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{pred.name}</div>
                  <div className="text-xs opacity-75 mt-0.5 line-clamp-1">{pred.reasoning}</div>
                  <div className="text-xs opacity-60">{Math.round(pred.confidence * 100)}% confidence</div>
                </div>
                {isSelected && (
                  <CheckCircle2 className={`h-3 w-3 mt-0.5 flex-shrink-0 ${classes.check}`} />
                )}
              </button>
            );
          })}

          {selectedItems.length > 0 && (
            <p className="mt-3 text-xs text-gray-500 text-center">
              {selectedItems.length} selected
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default PreferencesPanel;