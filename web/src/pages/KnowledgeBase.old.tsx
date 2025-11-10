import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, RefreshCw, Sparkles, FileText, CheckCircle, XCircle, Clock, Linkedin, Github, Globe, ChevronDown, ChevronUp, User, Briefcase, GraduationCap, Award, FolderOpen, CheckCircle2 } from 'lucide-react';
import {
  fetchKnowledgeSources,
  deleteKnowledgeSource,
  uploadKnowledgeDocument,
  uploadProjectDocument,
  addLinkedInProfile,
  addGitHubProfile,
  addWebsite,
  addManualText,
  fetchUserPreferences,
  predictPreferences,
  updateUserPreferences,
  fetchAggregatedProfile,
  type KnowledgeSource,
  type UserPreferences,
  type AggregatedProfile,
} from '../api/client';
import OnboardingTour from '../components/OnboardingTour';
import { useProfileStore } from '../store/profile';

export default function KnowledgeBaseDashboard() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [aggregatedProfile, setAggregatedProfile] = useState<AggregatedProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [completedSourcesCount, setCompletedSourcesCount] = useState(0);
  const [isAggregating, setIsAggregating] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllExperience, setShowAllExperience] = useState(false);
  const [showAllEducation, setShowAllEducation] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // Onboarding tour state
  const hasCompletedOnboarding = useProfileStore((state) => state.hasCompletedOnboarding);
  const completeOnboarding = useProfileStore((state) => state.completeOnboarding);
  const loadProfileFromDB = useProfileStore((state) => state.loadProfileFromDB);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);

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
  const processingSources = sources.filter((s) => s.processing_status === 'processing' || s.processing_status === 'pending');

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
        <p className="mt-2 text-gray-600">
          Manage your sources and preferences to get the best job recommendations.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Stats */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Sources"
              value={sources.length}
              icon={<FileText className="h-5 w-5" />}
              color="blue"
            />
            <StatCard
              label="Completed"
              value={completedSources.length}
              icon={<CheckCircle className="h-5 w-5" />}
              color="green"
            />
            <StatCard
              label="Processing"
              value={processingSources.length}
              icon={<Clock className="h-5 w-5" />}
              color="yellow"
            />
          </div>

          {/* Add Source Button */}
          <button
            data-tour="add-source-button"
            onClick={() => setShowAddModal(true)}
            className="mb-6 flex w-full items-center justify-center space-x-2 rounded-lg border-2 border-dashed border-gray-300 bg-white py-4 text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <Plus className="h-5 w-5" />
            <span className="font-medium">Add New Source</span>
          </button>

          {/* Sources List */}
          <div className="mb-6 space-y-4" data-tour="sources-section">
            <h2 className="text-xl font-semibold text-gray-900">Your Sources</h2>
            {sources.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-600">No sources yet. Add your first source to get started!</p>
              </div>
            ) : (
              sources.map((source) => (
                <SourceCard key={source.id} source={source} onDelete={handleDelete} />
              ))
            )}
          </div>

          {/* Unified Profile - Show if profile exists OR currently aggregating */}
          {(aggregatedProfile && aggregatedProfile.name || isAggregating) && (
            <div className="relative rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm" data-tour="aggregated-profile">
              {/* Loading overlay when aggregating */}
              {isAggregating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                  <div className="text-center">
                    <RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-sm font-medium text-blue-700">Merging sources with AI...</p>
                    <p className="text-xs text-blue-600 mt-1">This may take a few seconds</p>
                  </div>
                </div>
              )}
              
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Unified Profile</h2>
                <User className="h-5 w-5 text-blue-600" />
              </div>

              {aggregatedProfile && aggregatedProfile.name ? (
                <div className="space-y-4">
                  {/* Contact Info */}
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">{aggregatedProfile.name}</h3>
                    <div className="space-y-1 text-sm text-gray-700">
                      {aggregatedProfile.email && <p>✉️ {aggregatedProfile.email}</p>}
                      {aggregatedProfile.phone && <p>📱 {aggregatedProfile.phone}</p>}
                      {aggregatedProfile.location && <p>📍 {aggregatedProfile.location}</p>}
                    </div>
                  </div>

                {/* Summary */}
                {aggregatedProfile.summary && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-gray-700">Summary</h4>
                    <p className="text-sm text-gray-600">{aggregatedProfile.summary}</p>
                  </div>
                )}

                {/* Skills */}
                {aggregatedProfile.skills.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">
                      Skills ({aggregatedProfile.skills.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {(showAllSkills ? aggregatedProfile.skills : aggregatedProfile.skills.slice(0, 15)).map((skill: string, idx: number) => (
                        <span key={idx} className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                          {skill}
                        </span>
                      ))}
                    </div>
                    {aggregatedProfile.skills.length > 15 && (
                      <button
                        onClick={() => setShowAllSkills(!showAllSkills)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {showAllSkills ? '- Show less' : `+ Show all ${aggregatedProfile.skills.length} skills`}
                      </button>
                    )}
                  </div>
                )}

                {/* Experience */}
                {aggregatedProfile.experience.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center space-x-2 text-sm font-semibold text-gray-700">
                      <Briefcase className="h-4 w-4" />
                      <span>Experience ({aggregatedProfile.experience.length} positions)</span>
                    </h4>
                    <div className="space-y-2">
                      {(showAllExperience ? aggregatedProfile.experience : aggregatedProfile.experience.slice(0, 3)).map((exp: any, idx: number) => (
                        <div key={idx} className="rounded-lg bg-white p-3 text-sm">
                          <p className="font-medium text-gray-900">{exp.job_title || exp.title}</p>
                          <p className="text-gray-600">{exp.company}</p>
                          {exp.duration && <p className="text-xs text-gray-500">{exp.duration}</p>}
                        </div>
                      ))}
                    </div>
                    {aggregatedProfile.experience.length > 3 && (
                      <button
                        onClick={() => setShowAllExperience(!showAllExperience)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {showAllExperience ? '- Show less' : `+ Show all ${aggregatedProfile.experience.length} positions`}
                      </button>
                    )}
                  </div>
                )}

                {/* Education */}
                {aggregatedProfile.education.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center space-x-2 text-sm font-semibold text-gray-700">
                      <GraduationCap className="h-4 w-4" />
                      <span>Education ({aggregatedProfile.education.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {(showAllEducation ? aggregatedProfile.education : aggregatedProfile.education.slice(0, 3)).map((edu: any, idx: number) => (
                        <div key={idx} className="rounded-lg bg-white p-3 text-sm">
                          <p className="font-medium text-gray-900">{edu.degree || edu.field_of_study}</p>
                          <p className="text-gray-600">{edu.institution}</p>
                        </div>
                      ))}
                    </div>
                    {aggregatedProfile.education.length > 3 && (
                      <button
                        onClick={() => setShowAllEducation(!showAllEducation)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {showAllEducation ? '- Show less' : `+ Show all ${aggregatedProfile.education.length} entries`}
                      </button>
                    )}
                  </div>
                )}

                {/* Projects */}
                {aggregatedProfile.projects && aggregatedProfile.projects.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center space-x-2 text-sm font-semibold text-gray-700">
                      <Award className="h-4 w-4" />
                      <span>Projects ({aggregatedProfile.projects.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {(showAllProjects ? aggregatedProfile.projects : aggregatedProfile.projects.slice(0, 3)).map((project: any, idx: number) => (
                        <div key={idx} className="rounded-lg bg-white p-3 text-sm">
                          <div className="flex items-start justify-between">
                            <p className="font-medium text-gray-900">{project.name}</p>
                            {project.url && (
                              <a 
                                href={project.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Github className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          {project.description && <p className="text-xs text-gray-600 mt-1">{project.description}</p>}
                          {project.technologies && project.technologies.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {project.technologies.slice(0, 5).map((tech: string, techIdx: number) => (
                                <span key={techIdx} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                                  {tech}
                                </span>
                              ))}
                              {project.technologies.length > 5 && (
                                <span className="text-xs text-gray-500">+{project.technologies.length - 5} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {aggregatedProfile.projects.length > 3 && (
                      <button
                        onClick={() => setShowAllProjects(!showAllProjects)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {showAllProjects ? '- Show less' : `+ Show all ${aggregatedProfile.projects.length} projects`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p>Processing your profile...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* AI Predictions */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Your Interests</h3>
              <Sparkles className="h-5 w-5 text-purple-600" />
            </div>
            
            {preferences && (preferences.predicted_industries || preferences.predicted_roles || preferences.predicted_companies) ? (
              <div className="space-y-6">
                {/* Industries */}
                {preferences.predicted_industries && preferences.predicted_industries.length > 0 && (
                  <PreferenceSelector
                    title="Industries"
                    predictions={preferences.predicted_industries}
                    confirmed={preferences.confirmed_industries || []}
                    onUpdate={(items) => handleUpdatePreferences({ confirmed_industries: items })}
                    color="purple"
                  />
                )}
                
                {/* Roles */}
                {preferences.predicted_roles && preferences.predicted_roles.length > 0 && (
                  <PreferenceSelector
                    title="Roles"
                    predictions={preferences.predicted_roles}
                    confirmed={preferences.confirmed_roles || []}
                    onUpdate={(items) => handleUpdatePreferences({ confirmed_roles: items })}
                    color="blue"
                  />
                )}
                
                {/* Companies */}
                {preferences.predicted_companies && preferences.predicted_companies.length > 0 && (
                  <PreferenceSelector
                    title="Companies"
                    predictions={preferences.predicted_companies}
                    confirmed={preferences.confirmed_companies || []}
                    onUpdate={(items) => handleUpdatePreferences({ confirmed_companies: items })}
                    color="green"
                  />
                )}
                
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <Link
                    to="/dashboard"
                    className="relative w-full flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 hover:text-white"
                  >
                    <span className="relative z-10">Dashboard</span>
                  </Link>
                  <button
                    onClick={handlePredictPreferences}
                    disabled={isProcessing || completedSources.length === 0}
                    className="w-full rounded-lg border border-purple-600 px-4 py-2 text-sm font-medium text-purple-600 transition hover:bg-purple-50 disabled:opacity-50"
                  >
                    {isProcessing ? 'Re-analyzing...' : 'Re-analyze Profile'}
                  </button>
                  <p className="mt-2 text-xs text-center text-gray-500">
                    Generate fresh predictions from your sources
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-sm text-gray-600">
                  Let AI analyze your profile and suggest career interests.
                </p>
                <button
                  onClick={handlePredictPreferences}
                  disabled={isProcessing || completedSources.length === 0}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
                >
                  {isProcessing ? 'Analyzing...' : 'Analyze My Profile'}
                </button>
                {completedSources.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Add at least one completed source first
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-8 shadow-xl">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Add New Source</h3>
              <p className="mt-2 text-gray-600">
                Import your profile from multiple sources to get better recommendations
              </p>
            </div>

            {error && (
              <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
                {error}
              </div>
            )}

            {/* Sources Grid */}
            <div className="mb-8 grid gap-6 md:grid-cols-2">
              {/* File Upload */}
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
                <div className="mb-3 flex items-center space-x-3">
                  <div className="text-blue-600">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Upload Resume/CV</h3>
                    <p className="text-sm text-gray-500">PDF or DOCX format</p>
                  </div>
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      setIsProcessing(true);
                      setError(null);
                      try {
                        await uploadKnowledgeDocument(file);
                        setIsAggregating(true); // Show loading overlay before refreshing
                        await loadData();
                        setShowAddModal(false);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to upload file');
                        setIsAggregating(false);
                      } finally {
                        setIsProcessing(false);
                      }
                      e.target.value = '';
                    }}
                    disabled={isProcessing}
                    className="hidden"
                  />
                  <div className="cursor-pointer rounded-lg bg-blue-50 py-3 text-center text-sm font-medium text-blue-600 transition hover:bg-blue-100">
                    {isProcessing ? 'Uploading...' : 'Choose File'}
                  </div>
                </label>
              </div>

              {/* Project Document Upload */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center space-x-3">
                  <div className="text-purple-600">
                    <FolderOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Upload Project Document</h3>
                    <p className="text-sm text-gray-500">Project docs, proposals, reports (PDF or DOCX)</p>
                  </div>
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      setIsProcessing(true);
                      setError(null);
                      try {
                        await uploadProjectDocument(file);
                        setIsAggregating(true); // Show loading overlay before refreshing
                        await loadData();
                        setShowAddModal(false);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to upload project document');
                        setIsAggregating(false);
                      } finally {
                        setIsProcessing(false);
                      }
                      e.target.value = '';
                    }}
                    disabled={isProcessing}
                    className="hidden"
                  />
                  <div className="cursor-pointer rounded-lg bg-purple-50 py-3 text-center text-sm font-medium text-purple-600 transition hover:bg-purple-100">
                    {isProcessing ? 'Uploading...' : 'Choose File'}
                  </div>
                </label>
              </div>

              {/* LinkedIn */}
              <AddSourceCard
                icon={<Linkedin className="h-6 w-6" />}
                title="LinkedIn Profile"
                description="Enter your profile URL"
                placeholder="https://linkedin.com/in/yourname"
                buttonText="Add LinkedIn"
                onSubmit={async (value: string) => {
                  if (!value.trim()) return;
                  setIsProcessing(true);
                  setError(null);
                  try {
                    await addLinkedInProfile(value);
                    setIsAggregating(true); // Show loading overlay before refreshing
                    await loadData();
                    setShowAddModal(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add LinkedIn');
                    setIsAggregating(false);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
              />

              {/* GitHub */}
              <AddSourceCard
                icon={<Github className="h-6 w-6" />}
                title="GitHub Profile"
                description="Username or profile URL"
                placeholder="github.com/username or just username"
                buttonText="Add GitHub"
                onSubmit={async (value: string) => {
                  if (!value.trim()) return;
                  setIsProcessing(true);
                  setError(null);
                  try {
                    console.log('[ADD GITHUB] Starting...');
                    await addGitHubProfile(value);
                    console.log('[ADD GITHUB] API call completed, setting isAggregating=true');
                    setIsAggregating(true); // Show loading overlay before refreshing
                    await loadData();
                    console.log('[ADD GITHUB] loadData completed');
                    setShowAddModal(false);
                  } catch (err) {
                    console.error('[ADD GITHUB] Error:', err);
                    setError(err instanceof Error ? err.message : 'Failed to add GitHub');
                    setIsAggregating(false);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
              />

              {/* Website */}
              <AddSourceCard
                icon={<Globe className="h-6 w-6" />}
                title="Personal Website"
                description="Portfolio, blog, or project page"
                placeholder="https://yourwebsite.com"
                buttonText="Add Website"
                onSubmit={async (value: string) => {
                  if (!value.trim()) return;
                  setIsProcessing(true);
                  setError(null);
                  try {
                    await addWebsite(value);
                    setIsAggregating(true); // Show loading overlay before refreshing
                    await loadData();
                    setShowAddModal(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add website');
                    setIsAggregating(false);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
              />

              {/* Manual Text */}
              <div className="md:col-span-2">
                <AddSourceTextArea
                  icon={<FileText className="h-6 w-6" />}
                  title="Additional Context"
                  description="Add any other relevant information"
                  placeholder="Tell us about skills, projects, achievements not captured elsewhere..."
                  buttonText="Add Context"
                  onSubmit={async (value: string) => {
                    if (!value.trim()) return;
                    setIsProcessing(true);
                    setError(null);
                    try {
                      await addManualText(value);
                      setIsAggregating(true); // Show loading overlay before refreshing
                      await loadData();
                      setShowAddModal(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to add context');
                      setIsAggregating(false);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setError(null);
                }}
                disabled={isProcessing}
                className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour for New Users */}
      <OnboardingTour
        steps={[
          {
            target: '[data-tour="add-source-button"]',
            title: 'Welcome to Your Knowledge Base!',
            content: 'Start by adding your first knowledge source. Upload your resume, connect LinkedIn, or add project documents to build your professional profile.',
            position: 'bottom',
          },
          {
            target: '[data-tour="sources-section"]',
            title: 'Track Your Sources',
            content: 'All your uploaded sources will appear here. You can view, delete, and manage them at any time.',
            position: 'top',
          },
          {
            target: '[data-tour="aggregated-profile"]',
            title: 'Your AI-Powered Profile',
            content: 'Once you add sources, our AI will automatically analyze and aggregate your professional information here.',
            position: 'top',
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
      />
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-full p-3 ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source, onDelete }: { source: KnowledgeSource; onDelete: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const statusIcons = {
    pending: <Clock className="h-5 w-5 text-yellow-500" />,
    processing: <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />,
    completed: <CheckCircle className="h-5 w-5 text-green-500" />,
    failed: <XCircle className="h-5 w-5 text-red-500" />,
  };

  const sourceTypeLabels = {
    resume: 'Resume',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    personal_website: 'Website',
    manual_text: 'Manual Text',
    project_document: 'Document',
    portfolio: 'Portfolio',
    other_document: 'Document',
  };

  const parsedData = source.parsed_data as any;
  const hasData = parsedData && source.processing_status === 'completed';

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-2">
              <span className="text-lg font-semibold">{sourceTypeLabels[source.source_type]}</span>
              {statusIcons[source.processing_status]}
            </div>
            
            {source.source_identifier && (
              <p className="mb-2 text-sm text-gray-600 truncate">{source.source_identifier}</p>
            )}
            
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>Added {new Date(source.created_at).toLocaleDateString()}</span>
              <span className="capitalize">{source.processing_status}</span>
            </div>
            
            {source.error_message && (
              <p className="mt-2 text-xs text-red-600">Error: {source.error_message}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {hasData && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                title="View parsed data"
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => onDelete(source.id)}
              className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
              title="Delete source"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded parsed data */}
      {isExpanded && hasData && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Parsed Information</h4>
          
          <div className="space-y-4">
            {/* Basic Info */}
            {(parsedData.name || parsedData.email || parsedData.phone) && (
              <div>
                <div className="mb-2 flex items-center space-x-2 text-xs font-semibold text-gray-600">
                  <User className="h-4 w-4" />
                  <span>CONTACT</span>
                </div>
                <div className="space-y-1 text-sm">
                  {parsedData.name && <p><span className="font-medium">Name:</span> {parsedData.name}</p>}
                  {parsedData.email && <p><span className="font-medium">Email:</span> {parsedData.email}</p>}
                  {parsedData.phone && <p><span className="font-medium">Phone:</span> {parsedData.phone}</p>}
                  {parsedData.location && <p><span className="font-medium">Location:</span> {parsedData.location}</p>}
                </div>
              </div>
            )}

            {/* Skills */}
            {parsedData.skills && parsedData.skills.length > 0 && (
              <div>
                <div className="mb-2 flex items-center space-x-2 text-xs font-semibold text-gray-600">
                  <Award className="h-4 w-4" />
                  <span>SKILLS ({parsedData.skills.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {parsedData.skills.slice(0, 10).map((skill: string, idx: number) => (
                    <span key={idx} className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                      {skill}
                    </span>
                  ))}
                  {parsedData.skills.length > 10 && (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      +{parsedData.skills.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Experience */}
            {parsedData.experience && parsedData.experience.length > 0 && (
              <div>
                <div className="mb-2 flex items-center space-x-2 text-xs font-semibold text-gray-600">
                  <Briefcase className="h-4 w-4" />
                  <span>EXPERIENCE ({parsedData.experience.length})</span>
                </div>
                <div className="space-y-2">
                  {parsedData.experience.slice(0, 3).map((exp: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <p className="font-medium">{exp.job_title || exp.title}</p>
                      <p className="text-gray-600">{exp.company}</p>
                      {exp.duration && <p className="text-xs text-gray-500">{exp.duration}</p>}
                    </div>
                  ))}
                  {parsedData.experience.length > 3 && (
                    <p className="text-xs text-gray-500">+{parsedData.experience.length - 3} more positions</p>
                  )}
                </div>
              </div>
            )}

            {/* Education */}
            {parsedData.education && parsedData.education.length > 0 && (
              <div>
                <div className="mb-2 flex items-center space-x-2 text-xs font-semibold text-gray-600">
                  <GraduationCap className="h-4 w-4" />
                  <span>EDUCATION ({parsedData.education.length})</span>
                </div>
                <div className="space-y-2">
                  {parsedData.education.slice(0, 2).map((edu: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <p className="font-medium">{edu.degree || edu.field_of_study}</p>
                      <p className="text-gray-600">{edu.institution}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {parsedData.summary && (
              <div>
                <div className="mb-2 text-xs font-semibold text-gray-600">SUMMARY</div>
                <p className="text-sm text-gray-700 line-clamp-3">{parsedData.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSourceCard({
  icon,
  title,
  description,
  placeholder,
  buttonText,
  onSubmit,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  buttonText: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
      <div className="mb-3 flex items-center space-x-3">
        <div className="text-blue-600">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex space-x-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !disabled && value.trim() && handleSubmit()}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabled ? 'Adding...' : buttonText}
        </button>
      </div>
    </div>
  );
}

function AddSourceTextArea({
  icon,
  title,
  description,
  placeholder,
  buttonText,
  onSubmit,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  buttonText: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
      <div className="mb-3 flex items-center space-x-3">
        <div className="text-blue-600">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {disabled ? 'Adding...' : buttonText}
      </button>
    </div>
  );
}

function PreferenceSelector({
  title,
  predictions,
  confirmed,
  onUpdate,
  color = 'blue',
}: {
  title: string;
  predictions: Array<{ name: string; confidence: number; reasoning: string }>;
  confirmed: string[];
  onUpdate: (items: string[]) => void;
  color?: 'purple' | 'blue' | 'green';
}) {
  const [selectedItems, setSelectedItems] = useState<string[]>(confirmed || []);

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
      <h4 className="mb-2 text-sm font-medium text-gray-700">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {predictions.slice(0, 5).map((pred) => {
          const isSelected = selectedItems.includes(pred.name);
          return (
            <button
              key={pred.name}
              onClick={() => toggleItem(pred.name)}
              className={`group flex items-center space-x-1.5 rounded-full border-2 px-3 py-1 text-xs font-medium transition ${
                isSelected ? classes.selected : classes.unselected
              }`}
              title={`${pred.reasoning} (${Math.round(pred.confidence * 100)}% confidence)`}
            >
              <span>{pred.name}</span>
              {isSelected && <CheckCircle2 className={`h-3 w-3 ${classes.check}`} />}
            </button>
          );
        })}
      </div>
      {selectedItems.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {selectedItems.length} selected
        </p>
      )}
    </div>
  );
}
