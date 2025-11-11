import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchApplications } from '../api/client';
import EmptyState from '../components/EmptyState';
import { useProfileStore } from '../store/profile';

export default function ApplicationsPage(): JSX.Element {
  const navigate = useNavigate();
  const profile = useProfileStore((state) => state.profile);
  const applications = useProfileStore((state) => state.applications);
  const setApplications = useProfileStore((state) => state.setApplications);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  // Redirect to knowledge base if no profile (no longer use /assessment)
  useEffect(() => {
    if (!profile || !profile.id || profile.id === 'local-user' || !profile.skills || profile.skills.length === 0) {
      navigate('/knowledge-base');
    }
  }, [profile, navigate]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setStatus('loading');
      try {
        const result = await fetchApplications();
        if (mounted) {
          setApplications(result.items);
          setStatus('idle');
        }
      } catch {
        if (mounted) setStatus('error');
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [setApplications]);

  if (!profile) {
    return (
      <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="No profile yet"
            description="Add your knowledge sources to start tracking your job applications."
            action={
              <Link
                to="/knowledge-base"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                Set Up Profile
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-700';
      case 'sent': return 'bg-blue-100 text-blue-700';
      case 'responded': return 'bg-purple-100 text-purple-700';
      case 'interview': return 'bg-green-100 text-green-700';
      case 'offer': return 'bg-emerald-100 text-emerald-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'sent': return 'Applied';
      case 'responded': return 'Responded';
      case 'interview': return 'Interview';
      case 'offer': return 'Offer';
      case 'rejected': return 'Rejected';
      case 'draft': return 'Draft';
      default: return status;
    }
  };

  return (
    <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {status === 'loading' && <p className="text-sm text-slate-500">Loading applications…</p>}
          {status === 'error' && (
            <p className="text-sm text-red-500">Unable to load applications. Please try again later.</p>
          )}
          {applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="Start applying to jobs and track your progress here."
              action={
                <Link
                  to="/jobs"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
                >
                  Browse Jobs
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {applications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-slate-900">{application.jobTitle}</h3>
                          <p className="mt-1 text-sm text-slate-600">{application.jobCompany}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(application.status)}`}>
                          {getStatusLabel(application.status)}
                        </span>
                      </div>
                      
                      {application.notes && (
                        <p className="mt-3 text-sm text-slate-500 line-clamp-2">{application.notes}</p>
                      )}
                      
                      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
                        {application.appliedAt && (
                          <span>Applied: {new Date(application.appliedAt).toLocaleDateString()}</span>
                        )}
                        <span>Updated: {new Date(application.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 sm:flex-col sm:items-end">
                      {application.jobUrl && (
                        <a
                          href={application.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          View Job
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <Link
                        to={`/jobs/${application.jobId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        View Details
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
