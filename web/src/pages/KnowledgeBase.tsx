import { useEffect, useState, useRef } from 'react';
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
import { useResumeStream, type StreamProgress } from '../hooks/useResumeStream';
import { useGitHubStream } from '../hooks/useGitHubStream';
import { useLinkedInStream } from '../hooks/useLinkedInStream';
import { useProjectStream } from '../hooks/useProjectStream';
import { useAggregateStream } from '../hooks/useAggregateStream';
import { supabase } from '../lib/supabase';

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [aggregatedProfile, setAggregatedProfile] = useState<AggregatedProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [completedSourcesCount, setCompletedSourcesCount] = useState(0);
  
  // Streaming aggregation
  const { progress: aggregateProgress, isAggregating, aggregate } = useAggregateStream();
  
  // Streaming state for showing real-time progress
  const [streamingSourceId, setStreamingSourceId] = useState<string | null>(null);
  const [streamingSourceType, setStreamingSourceType] = useState<'resume' | 'github' | 'linkedin' | 'project' | null>(null);
  const [streamingProgress, setStreamingProgress] = useState<StreamProgress | null>(null);
  
  // Move streaming hook to parent so it survives modal closing
  const { progress, uploadAndStream } = useResumeStream({
    onComplete: async (profile, metadata) => {
      console.log('✅ Resume streaming complete!', { profile, metadata });
      try {
        if (!metadata.sourceId.startsWith('test-')) {
          console.log('Updating database for source:', metadata.sourceId);
          const { error } = await supabase
            .from('knowledge_sources')
            .update({
              parsed_data: profile,
              processing_status: 'completed',
            })
            .eq('id', metadata.sourceId);

          if (error) throw error;
          console.log('✅ Database updated successfully!');
        }
        
        // Clear streaming state
        setStreamingSourceId(null);
        setStreamingProgress(null);
        // Refresh sources - skip count init to allow aggregation effect to detect change
        loadData(true);
      } catch (err) {
        console.error('Failed to save parsed data:', err);
      }
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      setStreamingSourceId(null);
      setStreamingProgress(null);
      setError(error);
    },
  });

  // GitHub streaming
  const { progress: githubProgress, parseAndStream: parseGitHub } = useGitHubStream({
    onComplete: async (profile, metadata) => {
      console.log('✅ GitHub streaming complete!', { profile, metadata });
      try {
        const { error } = await supabase
          .from('knowledge_sources')
          .update({
            parsed_data: profile,
            processing_status: 'completed',
          })
          .eq('id', metadata.sourceId);

        if (error) throw error;
        setStreamingSourceId(null);
        setStreamingSourceType(null);
        setStreamingProgress(null);
        loadData(true);
      } catch (err) {
        console.error('Failed to save resume data:', err);
      }
    },
    onError: (error) => {
      console.error('Resume streaming error:', error);
      setStreamingSourceId(null);
      setStreamingSourceType(null);
      setStreamingProgress(null);
      setError(error);
    },
  });

  // LinkedIn streaming
  const { progress: linkedinProgress, parseAndStream: parseLinkedIn } = useLinkedInStream({
    onComplete: async (profile, metadata, rawData) => {
      console.log('✅ LinkedIn streaming complete!', { profile, metadata });
      try {
        const { error } = await supabase
          .from('knowledge_sources')
          .update({
            parsed_data: profile,
            raw_content: rawData,
            processing_status: 'completed',
          })
          .eq('id', metadata.sourceId);

        if (error) throw error;
        setStreamingSourceId(null);
        setStreamingSourceType(null);
        setStreamingProgress(null);
        loadData(true);
      } catch (err) {
        console.error('Failed to save LinkedIn data:', err);
      }
    },
    onError: (error) => {
      console.error('LinkedIn streaming error:', error);
      setStreamingSourceId(null);
      setStreamingSourceType(null);
      setStreamingProgress(null);
      setError(error);
    },
  });

  // Project document streaming
  const { progress: projectProgress, uploadAndStream: uploadProject } = useProjectStream({
    onComplete: async (profile, metadata) => {
      console.log('✅ Project streaming complete!', { profile, metadata });
      try {
        const { error } = await supabase
          .from('knowledge_sources')
          .update({
            parsed_data: profile,
            processing_status: 'completed',
          })
          .eq('id', metadata.sourceId);

        if (error) throw error;
        setStreamingSourceId(null);
        setStreamingSourceType(null);
        setStreamingProgress(null);
        loadData(true);
      } catch (err) {
        console.error('Failed to save project data:', err);
      }
    },
    onError: (error) => {
      console.error('Project streaming error:', error);
      setStreamingSourceId(null);
      setStreamingSourceType(null);
      setStreamingProgress(null);
      setError(error);
    },
  });
  
  // Update streaming progress when any hook progress changes
  useEffect(() => {
    if (streamingSourceId && streamingSourceType) {
      // Only use progress from the currently streaming source type
      let currentProgress: StreamProgress | null = null;
      
      switch (streamingSourceType) {
        case 'resume':
          currentProgress = progress.status !== 'idle' ? progress : null;
          break;
        case 'github':
          currentProgress = githubProgress.status !== 'idle' ? githubProgress : null;
          break;
        case 'linkedin':
          currentProgress = linkedinProgress.status !== 'idle' ? linkedinProgress : null;
          break;
        case 'project':
          currentProgress = projectProgress.status !== 'idle' ? projectProgress : null;
          break;
      }
      
      if (currentProgress) {
        console.log(`📊 ${streamingSourceType} progress update:`, currentProgress);
        setStreamingProgress(currentProgress);
      }
    }
  }, [progress, githubProgress, linkedinProgress, projectProgress, streamingSourceId, streamingSourceType]);

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

    // Don't aggregate if there are no completed sources (new user with no uploads)
    if (currentCompletedCount === 0) {
      return;
    }

    // Only aggregate if count actually changed (source completed or deleted)
    if (currentCompletedCount > 0 && currentCompletedCount !== completedSourcesCount && !isAggregating) {
      console.log(`[AGGREGATION] Completed sources changed: ${completedSourcesCount} → ${currentCompletedCount}`);
      setCompletedSourcesCount(currentCompletedCount);
      
      // If only 1 source, just use its parsed data directly without aggregation
      if (currentCompletedCount === 1) {
        const completedSource = sources.find(s => s.processing_status === 'completed');
        if (completedSource?.parsed_data) {
          console.log('[AGGREGATION] Single source detected, using parsed data directly');
          const profile = {
            ...completedSource.parsed_data,
            sources: [{
              type: completedSource.source_type,
              identifier: completedSource.source_identifier,
              created_at: completedSource.created_at,
            }],
            updated_at: completedSource.updated_at,
          };
          setAggregatedProfile(profile);
          
          // Reload profile from DB to update skills and unlock navigation
          loadProfileFromDB().catch(err => {
            console.error('[AGGREGATION] Failed to reload profile:', err);
          });
        }
        return;
      }
      
      // Multiple sources - run streaming aggregation
      console.log(`[AGGREGATION] Multiple sources (${currentCompletedCount}), starting streaming aggregation...`);
      aggregate(
        (profile) => {
          console.log('✅ Aggregation complete!', profile);
          console.log('[AGGREGATION] Profile type:', typeof profile, Array.isArray(profile) ? 'IS ARRAY!' : 'is object');
          console.log('[AGGREGATION] Profile name:', profile?.name);
          setAggregatedProfile(profile);
          
          // Reload profile from DB to update skills and unlock navigation
          loadProfileFromDB().catch(err => {
            console.error('[AGGREGATION] Failed to reload profile:', err);
          });
        },
        (error) => {
          console.error('❌ Aggregation error:', error);
          setError(`Aggregation failed: ${error}`);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, completedSourcesCount]); // Removed other deps to prevent infinite loop

  const loadData = async (skipCountInit = false) => {
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
      
      console.log('[LOAD] aggregatedData:', aggregatedData);
      console.log('[LOAD] aggregated_profile:', aggregatedData.aggregated_profile);
      console.log('[LOAD] hasLoadedOnce:', hasLoadedOnce.current);
      console.log('[LOAD] Type of aggregated_profile:', typeof aggregatedData.aggregated_profile);
      console.log('[LOAD] Is aggregated_profile truthy?', !!aggregatedData.aggregated_profile);
      console.log('[LOAD] Is aggregated_profile an array?', Array.isArray(aggregatedData.aggregated_profile));
      
      // Update profile logic:
      // - Always update if we got data from DB and it's a proper object
      // - If DB has stale array, keep existing profile in memory
      // - On first load with no profile, show empty state
      // - On subsequent loads, preserve existing profile during processing
      if (aggregatedData.aggregated_profile && !Array.isArray(aggregatedData.aggregated_profile)) {
        console.log('[LOAD] Setting aggregatedProfile from DB:', aggregatedData.aggregated_profile.name);
        setAggregatedProfile(aggregatedData.aggregated_profile);
        console.log('[LOAD] setState called with:', aggregatedData.aggregated_profile);
      } else if (Array.isArray(aggregatedData.aggregated_profile)) {
        console.warn('[LOAD] ⚠️ DB has stale array - keeping existing profile, will fix when aggregation runs');
        // Don't modify aggregatedProfile state - keep whatever is currently there
        // The aggregation effect will fix this when sources complete
      } else if (!hasLoadedOnce.current && !aggregatedProfile) {
        // First load and no profile anywhere - show empty state
        console.log('[LOAD] First load, no profile - setting to null');
        setAggregatedProfile(null);
      } else {
        console.log('[LOAD] Subsequent load, no DB profile - keeping existing profile in memory');
        // Keep the existing profile visible
      }
      // else: subsequent load with no DB profile - keep existing profile visible
      
      hasLoadedOnce.current = true;

      // Initialize completedSourcesCount on initial load only
      // Don't update it when refreshing after a source completes - let the effect detect the change
      if (!skipCountInit) {
        const initialCompletedCount = (sourcesData.sources || []).filter(s => s.processing_status === 'completed').length;
        const hasProcessingSources = (sourcesData.sources || []).some(s => s.processing_status === 'processing');
        
        // Special cases that need to trigger aggregation:
        // 1. Have completed sources but no profile (null)
        // 2. Have completed sources but DB has stale array (old raw data)
        // BUT: Only trigger if NO sources are still processing
        const hasStaleData = Array.isArray(aggregatedData.aggregated_profile);
        const hasNoProfile = !aggregatedData.aggregated_profile;
        
        if (initialCompletedCount > 0 && (hasNoProfile || hasStaleData) && !hasProcessingSources) {
          console.log('[LOAD] Need aggregation - completed sources:', initialCompletedCount, 
                      'hasStaleData:', hasStaleData, 'hasNoProfile:', hasNoProfile);
          setCompletedSourcesCount(0); // Will trigger aggregation effect when set to initialCompletedCount
          // Use setTimeout to allow state to settle
          setTimeout(() => setCompletedSourcesCount(initialCompletedCount), 0);
        } else {
          if (hasProcessingSources && (hasNoProfile || hasStaleData)) {
            console.log('[LOAD] Have stale data but sources still processing - will wait for completion');
          }
          setCompletedSourcesCount(initialCompletedCount);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source?')) return;

    try {
      await deleteKnowledgeSource(id);
      setSources(sources.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source');
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
    loadData();
  };

  const handleAddSourceError = (message: string) => {
    setError(message);
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
            streamingSourceId={streamingSourceId}
            streamingProgress={streamingProgress}
          />
        </div>

        {/* Profile Panel */}
        <div className="flex-1 min-w-0">
          <ProfilePanel
            aggregatedProfile={aggregatedProfile}
            isAggregating={isAggregating}
            aggregateProgress={aggregateProgress}
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
          aggregateProgress={aggregateProgress}
          onReanalyze={handlePredictPreferences}
          isProcessing={isProcessing}
          canNavigateToDashboard={isProfileActivated}
          preferences={preferences}
          onPredictPreferences={handlePredictPreferences}
          onUpdatePreferences={handleUpdatePreferences}
          completedSourcesCount={completedSources.length}
          streamingSourceId={streamingSourceId}
          streamingProgress={streamingProgress}
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
        onStartStreaming={(sourceId, file, userId) => {
          console.log('🎬 Starting resume stream for:', sourceId);
          setStreamingSourceId(sourceId);
          setStreamingSourceType('resume');
          setStreamingProgress({ status: 'uploading', message: 'Starting...' });
          // Start streaming in parent (survives modal closing)
          uploadAndStream(file, userId, sourceId).catch(err => {
            console.error('Resume streaming error:', err);
            setError(err instanceof Error ? err.message : 'Resume streaming failed');
          });
        }}
        onStartGitHubStreaming={(sourceId, username) => {
          console.log('🎬 Starting GitHub stream for:', sourceId);
          setStreamingSourceId(sourceId);
          setStreamingSourceType('github');
          setStreamingProgress({ status: 'fetching', message: 'Fetching GitHub profile...' });
          parseGitHub(username, sourceId).catch(err => {
            console.error('GitHub streaming error:', err);
            setError(err instanceof Error ? err.message : 'GitHub streaming failed');
          });
        }}
        onStartLinkedInStreaming={(sourceId, url) => {
          console.log('🎬 Starting LinkedIn stream for:', sourceId);
          setStreamingSourceId(sourceId);
          setStreamingSourceType('linkedin');
          setStreamingProgress({ status: 'fetching', message: 'Starting LinkedIn fetch...' });
          parseLinkedIn(url, sourceId).catch(err => {
            console.error('LinkedIn streaming error:', err);
            setError(err instanceof Error ? err.message : 'LinkedIn streaming failed');
          });
        }}
        onStartProjectStreaming={(sourceId, file, userId) => {
          console.log('🎬 Starting project stream for:', sourceId);
          setStreamingSourceId(sourceId);
          setStreamingSourceType('project');
          setStreamingProgress({ status: 'uploading', message: 'Starting...' });
          uploadProject(file, userId, sourceId).catch(err => {
            console.error('Project streaming error:', err);
            setError(err instanceof Error ? err.message : 'Project streaming failed');
          });
        }}
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