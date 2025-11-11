import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchKnowledgeSources,
  deleteKnowledgeSource,
  fetchUserPreferences,
  predictPreferences,
  updateUserPreferences,
  fetchAggregatedProfile,
  type KnowledgeSource,
  type UserPreferences,
  type AggregatedProfile,
} from '../api/client';
import OnboardingTour from '../components/OnboardingTour';
import SourcesPanel from '../components/SourcesPanel';
import ProfilePanel from '../components/ProfilePanel';
import PreferencesPanel from '../components/PreferencesPanel';
import MobileTabs from '../components/MobileTabs';
import AddSourceModal from '../components/AddSourceModal';
import { useProfileStore } from '../store/profile';

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [aggregatedProfile, setAggregatedProfile] = useState<AggregatedProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [completedSourcesCount, setCompletedSourcesCount] = useState(0);
  const [isAggregating, setIsAggregating] = useState(false);

  // Panel collapse states for desktop
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [preferencesCollapsed, setPreferencesCollapsed] = useState(false);

  // Onboarding tour state
  const hasCompletedOnboarding = useProfileStore((state) => state.hasCompletedOnboarding);
  const completeOnboarding = useProfileStore((state) => state.completeOnboarding);
  const loadProfileFromDB = useProfileStore((state) => state.loadProfileFromDB);
  const profile = useProfileStore((state) => state.profile);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const [tourMobileTab, setTourMobileTab] = useState(1);

  // Show onboarding tour for new users (0 sources, hasn't completed onboarding)
  useEffect(() => {
    if (!isLoading && sources.length === 0 && !hasCompletedOnboarding) {
      setShowOnboardingTour(true);
    }
  }, [isLoading, sources.length, hasCompletedOnboarding]);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh when there are processing sources
  useEffect(() => {
    const hasProcessingSources = sources.some(
      (s) => s.processing_status === 'pending' || s.processing_status === 'processing'
    );

    if (!hasProcessingSources) return;

    // Poll every 3 seconds
    const interval = setInterval(() => {
      fetchKnowledgeSources().then((data) => {
        setSources(data.sources);
      }).catch(console.error);
    }, 3000);

    return () => clearInterval(interval);
  }, [sources]);

  // Refresh aggregated profile when completed sources count changes
  useEffect(() => {
    const currentCompletedCount = sources.filter(s => s.processing_status === 'completed').length;

    console.log(`[AGGREGATION EFFECT] Current: ${currentCompletedCount}, Stored: ${completedSourcesCount}, isAggregating: ${isAggregating}`);

    // Don't aggregate if there are no completed sources (new user with no uploads)
    if (currentCompletedCount === 0) {
      console.log('[AGGREGATION EFFECT] No completed sources, skipping aggregation');
      setIsAggregating(false);
      return;
    }

    // Only fetch if count actually changed (source completed or deleted)
    if (currentCompletedCount > 0 && currentCompletedCount !== completedSourcesCount) {
      console.log(`[AGGREGATION EFFECT] Completed sources changed: ${completedSourcesCount} → ${currentCompletedCount}, fetching updated aggregated profile...`);
      setCompletedSourcesCount(currentCompletedCount);
      setIsAggregating(true);

      // Store the current timestamp to detect when profile is updated
      const startTime = aggregatedProfile?.updated_at;
      console.log(`[AGGREGATION EFFECT] Starting poll, current profile timestamp: ${startTime}`);

      // Poll for the fresh aggregated profile (backend regenerates async)
      // Keep polling until we get a profile with a newer timestamp
      const pollForProfile = async (attempts = 0): Promise<void> => {
        try {
          const data = await fetchAggregatedProfile();

          // Check if the aggregated profile has been updated (timestamp changed)
          const profileTimestamp = data.aggregated_profile?.updated_at;
          const profileSourceCount = data.aggregated_profile?.sources?.length || 0;

          console.log(`[POLL ${attempts + 1}] Profile timestamp: ${profileTimestamp}, sources: ${profileSourceCount}, expecting ${currentCompletedCount} sources`);

          // Profile is updated if timestamp changed OR source count matches
          const timestampChanged = profileTimestamp && profileTimestamp !== startTime;
          const sourceCountMatches = profileSourceCount === currentCompletedCount;

          if (timestampChanged || sourceCountMatches) {
            // Profile is up to date
            console.log(`[POLL ${attempts + 1}] ✅ Got updated aggregated profile (timestamp: ${timestampChanged ? 'changed' : 'same'}, sources: ${profileSourceCount})`);
            setAggregatedProfile(data.aggregated_profile);
            setIsAggregating(false);

            // Reload profile from DB to update skills and unlock navigation
            console.log('[POLL] Reloading profile to sync skills...');
            loadProfileFromDB().catch(err => {
              console.error('[POLL] Failed to reload profile:', err);
            });
          } else if (attempts < 20) {
            // Profile not updated yet, retry after 3 seconds
            console.log(`[POLL ${attempts + 1}] ⏳ Waiting for profile update...`);
            setTimeout(() => pollForProfile(attempts + 1), 3000);
          } else {
            // Timeout - use whatever we got
            console.warn(`[POLL ${attempts + 1}] ⚠️ Timed out waiting for aggregated profile update (waited ${attempts * 3}s), using current profile`);
            setAggregatedProfile(data.aggregated_profile);
            setIsAggregating(false);

            // Still reload profile to get any skills that were updated
            console.log('[POLL] Reloading profile after timeout...');
            loadProfileFromDB().catch(err => {
              console.error('[POLL] Failed to reload profile:', err);
            });
          }
        } catch (error) {
          console.error(`[POLL ${attempts + 1}] Error:`, error);
          if (attempts < 20) {
            // Retry on error
            setTimeout(() => pollForProfile(attempts + 1), 3000);
          } else {
            console.error('[POLL] Failed to fetch aggregated profile after multiple attempts');
            setIsAggregating(false);
          }
        }
      };

      // Start polling after a 2 second delay to give backend time to start aggregation
      console.log('[AGGREGATION EFFECT] Starting poll in 2 seconds...');
      setTimeout(() => pollForProfile(), 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, completedSourcesCount]); // Removed aggregatedProfile?.updated_at to prevent infinite loop

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sourcesData, prefsData, aggregatedData] = await Promise.all([
        fetchKnowledgeSources(),
        fetchUserPreferences(),
        fetchAggregatedProfile(),
      ]);

      // Check for multiple resume sources and keep only the latest
      const resumeSources = sourcesData.sources.filter((s) => s.source_type === 'resume');
      if (resumeSources.length > 1) {
        // Sort by creation date, newest first
        resumeSources.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Delete all but the latest
        const toDelete = resumeSources.slice(1);
        await Promise.all(toDelete.map((s) => deleteKnowledgeSource(s.id)));

        // Update sources list to reflect deletions
        const remainingSources = sourcesData.sources.filter(
          (s) => !toDelete.find((d) => d.id === s.id)
        );
        setSources(remainingSources);
      } else {
        setSources(sourcesData.sources);
      }

      console.log('Preferences data received:', prefsData);
      console.log('Preferences object:', prefsData.preferences);
      setPreferences(prefsData.preferences);
      setAggregatedProfile(aggregatedData.aggregated_profile);

      // Track completed sources count for triggering aggregation refresh
      const newCompletedCount = sourcesData.sources.filter(s => s.processing_status === 'completed').length;
      if (newCompletedCount !== completedSourcesCount) {
        setCompletedSourcesCount(newCompletedCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setIsAggregating(false); // Clear aggregating state on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source?')) return;

    try {
      console.log('[DELETE] Setting isAggregating=true');
      // Set aggregating state immediately when we start deletion
      setIsAggregating(true);
      await deleteKnowledgeSource(id);
      console.log('[DELETE] API call completed, updating sources list');
      setSources(sources.filter((s) => s.id !== id));
      console.log('[DELETE] Sources updated, useEffect should fire to poll for new profile');
      // Don't set isAggregating to false - the useEffect will handle it when polling completes
    } catch (err) {
      console.error('[DELETE] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete source');
      setIsAggregating(false);
    }
  };

  const handlePredictPreferences = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const { preferences: newPrefs } = await predictPreferences();
      setPreferences(newPrefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to predict preferences');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdatePreferences = async (updates: Partial<UserPreferences>) => {
    try {
      const { preferences: updatedPrefs } = await updateUserPreferences(updates);
      setPreferences(updatedPrefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    }
  };

  const handleAddSourceSuccess = () => {
    setIsAggregating(true); // Show loading overlay before refreshing
    loadData();
  };

  const handleAddSourceError = (message: string) => {
    setError(message);
    setIsAggregating(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading your knowledge base...</p>
        </div>
      </div>
    );
  }

  const completedSources = sources.filter((s) => s.processing_status === 'completed');

  // Check if profile is activated (saved to DB with resume)
  // Must have a real ID (not 'local-user') and skills
  const isProfileActivated = !!(
    profile &&
    profile.id &&
    profile.id !== 'local-user' &&
    profile.skills &&
    profile.skills.length > 0
  );

  return (
    <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
      {/* Error Display */}
      {error && (
        <div className="border-b bg-red-50 p-3 flex-shrink-0">
          <div className="text-red-700 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Sources Panel */}
        <div className={`transition-all duration-300 ${sourcesCollapsed ? 'w-16' : 'w-80'} flex-shrink-0`}>
          <SourcesPanel
            sources={sources}
            onAddSource={() => setShowAddModal(true)}
            onDeleteSource={handleDelete}
            isCollapsed={sourcesCollapsed}
            onToggleCollapse={() => setSourcesCollapsed(!sourcesCollapsed)}
          />
        </div>

        {/* Profile Panel */}
        <div className="flex-1 min-w-0">
          <ProfilePanel
            aggregatedProfile={aggregatedProfile}
            isAggregating={isAggregating}
            onProfileUpdate={setAggregatedProfile}
          />
        </div>

        {/* Preferences Panel */}
        <div className={`transition-all duration-300 ${preferencesCollapsed ? 'w-16' : 'w-80'} flex-shrink-0`}>
          <PreferencesPanel
            preferences={preferences}
            onPredictPreferences={handlePredictPreferences}
            onUpdatePreferences={handleUpdatePreferences}
            isProcessing={isProcessing}
            completedSourcesCount={completedSources.length}
            isCollapsed={preferencesCollapsed}
            onToggleCollapse={() => setPreferencesCollapsed(!preferencesCollapsed)}
            canNavigateToDashboard={isProfileActivated}
            onReanalyze={handlePredictPreferences}
          />
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden flex-1 min-h-0">
        <MobileTabs
          sources={sources}
          onAddSource={() => setShowAddModal(true)}
          onDeleteSource={handleDelete}
          aggregatedProfile={aggregatedProfile}
          isAggregating={isAggregating}
          onReanalyze={handlePredictPreferences}
          isProcessing={isProcessing}
          canNavigateToDashboard={isProfileActivated}
          preferences={preferences}
          onPredictPreferences={handlePredictPreferences}
          onUpdatePreferences={handleUpdatePreferences}
          completedSourcesCount={completedSources.length}
          isTourActive={showOnboardingTour}
          tourTab={tourMobileTab}
        />
      </div>

      {/* Add Source Modal */}
      <AddSourceModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setError(null);
        }}
        onSuccess={handleAddSourceSuccess}
        onError={handleAddSourceError}
      />

      {/* Onboarding Tour for New Users */}
      <OnboardingTour
        steps={[
          {
            target: '[data-tour="add-source-button"]',
            title: 'Welcome! Let\'s Get You Set Up',
            content: 'Click here to add your first piece of the puzzle—your resume, LinkedIn profile, GitHub projects, or anything else that tells your story. The more you add, the better we understand what makes you unique!',
            position: 'bottom',
            mobileTab: 1, // Sources tab
          },
          {
            target: '[data-tour="sources-section"]',
            title: 'Your Collection Grows Here',
            content: 'Everything you add shows up in this panel. We\'ll process each source to pull out the important bits. Don\'t worry—you can always check what we found, delete things, or add more whenever you want.',
            position: 'top',
            mobileTab: 1, // Sources tab
          },
          {
            target: '[data-tour="aggregated-profile"]',
            title: 'Meet the Complete You',
            content: 'Once we process your sources, this is where the magic happens. We combine everything into one comprehensive profile—all your experience, skills, education, and projects in one place. Think of it as your professional highlight reel!',
            position: 'top',
            mobileTab: 2, // Profile tab
          },
          {
            target: '[data-tour="preferences-panel"]',
            title: 'What Are You Looking For?',
            content: 'Based on your background, we\'ll suggest industries, roles, and companies that might interest you. These are just smart guesses—you can customize them to match what you\'re actually looking for. It helps us find jobs you\'ll actually like!',
            position: 'left',
            mobileTab: 3, // Interests tab
          },
          {
            target: 'body',
            title: 'Ready to Roll!',
            content: 'That\'s the quick tour! Go ahead and add your first source to get started. Once your profile is ready, head over to the Jobs page and we\'ll show you opportunities that are actually worth your time.',
            position: 'top',
            mobileTab: 1, // Back to Sources tab
          },
        ]}
        isActive={showOnboardingTour}
        onComplete={() => {
          setShowOnboardingTour(false);
          completeOnboarding();
        }}
        onSkip={() => {
          setShowOnboardingTour(false);
          completeOnboarding();
        }}
        onMobileTabChange={setTourMobileTab}
      />
    </div>
  );
}