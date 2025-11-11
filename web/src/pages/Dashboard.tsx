import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import JobCard from '../components/JobCard';
import EmptyState from '../components/EmptyState';
import { useJobs } from '../hooks/useJobs';
import { useProfileStore } from '../store/profile';
import { fetchKnowledgeSources, fetchUserPreferences, type KnowledgeSource, type UserPreferences } from '../api/client';
import { FileText, Briefcase, Sparkles, TrendingUp } from 'lucide-react';
import type { Job } from '../types';

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const profile = useProfileStore((state) => state.profile);
  // Fetch more jobs for better filtering (50 instead of 3)
  const { data, isLoading } = useJobs({ limit: 50 });
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);

  // Load data and redirect new users to knowledge base
  useEffect(() => {
    const loadData = async () => {
      try {
        const sourcesData = await fetchKnowledgeSources();
        setSources(sourcesData.sources);

        // Redirect new users (0 sources) to knowledge base to start onboarding
        if (sourcesData.sources.length === 0) {
          navigate('/knowledge-base');
          return;
        }

        // Try to load preferences
        try {
          const prefsData = await fetchUserPreferences();
          setPreferences(prefsData.preferences);
        } catch (error) {
          console.log('No preferences yet');
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoadingSources(false);
      }
    };

    loadData();
  }, [navigate]);

  // Filter and sort jobs by preferences
  const topJobs = useMemo(() => {
    if (!data?.items || !preferences) return data?.items.slice(0, 10) || [];

    const confirmedIndustries = preferences.confirmed_industries || [];
    const confirmedRoles = preferences.confirmed_roles || [];
    const confirmedCompanies = preferences.confirmed_companies || [];

    // If no preferences selected, just return top 10
    if (confirmedIndustries.length === 0 && confirmedRoles.length === 0 && confirmedCompanies.length === 0) {
      return data.items.slice(0, 10);
    }

    // Filter jobs that match preferences
    const jobsWithMatches = data.items.map((job) => {
      let matchCount = 0;

      // Check role match (bidirectional)
      if (confirmedRoles.some((role) => {
        const roleLower = role.toLowerCase();
        const titleLower = job.title.toLowerCase();
        return titleLower.includes(roleLower) || roleLower.includes(titleLower);
      })) {
        matchCount++;
      }

      // Check company match (bidirectional)
      if (confirmedCompanies.some((company) => {
        const companyLower = company.toLowerCase();
        const jobCompanyLower = job.company.toLowerCase();
        return jobCompanyLower.includes(companyLower) || companyLower.includes(jobCompanyLower);
      })) {
        matchCount++;
      }

      // Check industry match (avoid double counting)
      const hasIndustryMatch = confirmedIndustries.some((industry) => {
        const industryLower = industry.toLowerCase();
        
        // Check in requirements/tags
        if (job.requirements?.some((tag: string) => {
          const tagLower = tag.toLowerCase();
          return tagLower.includes(industryLower) || industryLower.includes(tagLower);
        })) {
          return true;
        }
        
        // Check in industry field
        if (job.industry) {
          const jobIndustryLower = job.industry.toLowerCase();
          return jobIndustryLower.includes(industryLower) || industryLower.includes(jobIndustryLower);
        }
        
        return false;
      });

      if (hasIndustryMatch) {
        matchCount++;
      }

      return { job, matchCount };
    });

    // Sort by match count (highest first), then take top 10
    return jobsWithMatches
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 10)
      .map(({ job }) => job);
  }, [data, preferences]);

  if (loadingSources) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-600 border-r-transparent"></div>
            <p className="mt-4 text-sm text-slate-500">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-500">Your personalized job recommendation hub.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Knowledge Base Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-100 p-3">
                  <FileText className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Knowledge Sources</p>
                  <p className="text-2xl font-semibold text-slate-900">{sources.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-3">
                  <Briefcase className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Top Matches</p>
                  <p className="text-2xl font-semibold text-slate-900">{topJobs.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-3">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Profile Status</p>
                  <p className="text-sm font-semibold text-green-600">Active</p>
                </div>
              </div>
            </div>
          </div>

          {/* Top Job Recommendations */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Top Job Matches</h3>
                <p className="text-sm text-slate-500">
                  {preferences && (preferences.confirmed_industries?.length || preferences.confirmed_roles?.length || preferences.confirmed_companies?.length)
                    ? 'Based on your interests'
                    : 'Based on your knowledge base profile'}
                </p>
              </div>
              <Link 
                to="/jobs" 
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all →
              </Link>
            </div>
            
            {isLoading && (
              <div className="py-8 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-brand-600 border-r-transparent"></div>
                <p className="mt-2 text-sm text-slate-500">Loading recommendations...</p>
              </div>
            )}
            
            {!isLoading && topJobs.length === 0 && (
              <EmptyState
                title="No matches yet"
                description="Try adding more knowledge sources or explore the full job list."
              />
            )}
            
            <div className="space-y-4">
              {topJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        </div>

        {/* Preferences Sidebar */}
        <div className="space-y-6">
          {/* Your Preferences */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-slate-900">Your Interests</h3>
            </div>
            
            {preferences && (preferences.confirmed_industries?.length || preferences.confirmed_roles?.length || preferences.confirmed_companies?.length) ? (
              <div className="space-y-4">
                {preferences.confirmed_industries && preferences.confirmed_industries.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Industries
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {preferences.confirmed_industries.slice(0, 5).map((industry, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                        >
                          {industry}
                        </span>
                      ))}
                      {preferences.confirmed_industries.length > 5 && (
                        <span className="text-xs text-slate-500">
                          +{preferences.confirmed_industries.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {preferences.confirmed_roles && preferences.confirmed_roles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Roles
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {preferences.confirmed_roles.slice(0, 5).map((role, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                        >
                          {role}
                        </span>
                      ))}
                      {preferences.confirmed_roles.length > 5 && (
                        <span className="text-xs text-slate-500">
                          +{preferences.confirmed_roles.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {preferences.confirmed_companies && preferences.confirmed_companies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Target Companies
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {preferences.confirmed_companies.slice(0, 5).map((company, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700"
                        >
                          {company}
                        </span>
                      ))}
                      {preferences.confirmed_companies.length > 5 && (
                        <span className="text-xs text-slate-500">
                          +{preferences.confirmed_companies.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-blue-200">
                  <Link
                    to="/knowledge-base"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Update your interests →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-slate-600 mb-3">
                  Let AI analyze your profile to predict your ideal roles and industries.
                </p>
                <Link
                  to="/knowledge-base"
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Predictions
                </Link>
              </div>
            )}
          </div>

          {/* Knowledge Sources Quick View */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Profile</h3>
            <div className="space-y-3">
              {sources.slice(0, 5).map((source) => (
                <div key={source.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-md p-1.5 ${
                    source.source_type === 'resume' ? 'bg-blue-100 text-blue-600' :
                    source.source_type === 'linkedin' ? 'bg-blue-100 text-blue-600' :
                    source.source_type === 'github' ? 'bg-slate-100 text-slate-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    <FileText className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate capitalize">
                      {source.source_type.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(source.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {sources.length > 5 && (
                <p className="text-xs text-slate-500 pt-2">
                  +{sources.length - 5} more sources
                </p>
              )}
            </div>
            <Link
              to="/knowledge-base"
              className="mt-4 block text-center text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Manage sources →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
