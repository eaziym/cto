import { CheckCircle2, Loader2, XCircle, FileText, Mail, Phone, Briefcase, GraduationCap, Wrench } from 'lucide-react';
import type { StreamProgress } from '../hooks/useResumeStream';

interface StreamingProgressProps {
  progress: StreamProgress;
}

export default function StreamingProgress({ progress }: StreamingProgressProps) {
  const { status, message, fields_found, partial_data, error } = progress;

  return (
    <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm animate-fade-in">\
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {status === 'complete' && (
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
        )}
        {status === 'error' && (
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
        )}
        {!['complete', 'error', 'idle'].includes(status) && (
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0" />
        )}
        
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">
            {status === 'complete' && '✓ Resume Parsed Successfully!'}
            {status === 'error' && 'Processing Failed'}
            {status === 'uploading' && 'Uploading Resume...'}
            {status === 'creating_assistant' && 'Preparing AI...'}
            {status === 'parsing' && 'Analyzing Resume...'}
            {status === 'idle' && 'Ready to Upload'}
          </h3>
          {message && (
            <p className="text-sm text-gray-600 mt-0.5">{message}</p>
          )}
        </div>
      </div>

      {/* Progress Details */}
      {status === 'parsing' && partial_data && (
        <div className="space-y-2 mt-4">
          <div className="text-sm text-gray-700 mb-3">
            {fields_found ? (
              <span className="font-medium text-blue-600">
                Extracting... {fields_found} fields found
              </span>
            ) : (
              <span className="text-gray-500">Reading document...</span>
            )}
          </div>

          <div className="space-y-2">
            <ProgressField
              icon={<FileText className="w-4 h-4" />}
              label="Name"
              value={partial_data.name}
              found={!!partial_data.name}
            />
            <ProgressField
              icon={<Mail className="w-4 h-4" />}
              label="Email"
              value={partial_data.email}
              found={!!partial_data.email}
            />
            <ProgressField
              icon={<Phone className="w-4 h-4" />}
              label="Phone"
              value={partial_data.telephone}
              found={!!partial_data.telephone}
            />
            <ProgressField
              icon={<Wrench className="w-4 h-4" />}
              label="Skills"
              value={partial_data.skills_count ? `${partial_data.skills_count} skills` : undefined}
              found={(partial_data.skills_count || 0) > 0}
            />
            <ProgressField
              icon={<Briefcase className="w-4 h-4" />}
              label="Experience"
              value={partial_data.experience_count ? `${partial_data.experience_count} roles` : undefined}
              found={(partial_data.experience_count || 0) > 0}
            />
            <ProgressField
              icon={<GraduationCap className="w-4 h-4" />}
              label="Education"
              value={partial_data.education_count ? `${partial_data.education_count} degrees` : undefined}
              found={(partial_data.education_count || 0) > 0}
            />
          </div>
        </div>
      )}

      {/* Complete State */}
      {status === 'complete' && progress.profile && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="text-sm text-green-800">
            <div className="font-medium mb-1">Successfully Extracted</div>
            <div className="space-y-0.5 text-green-700">
              {progress.profile.name && <div>• Name: {progress.profile.name}</div>}
              {progress.profile.email && <div>• Email: {progress.profile.email}</div>}
              {progress.profile.skills?.length > 0 && (
                <div>• {progress.profile.skills.length} skills found</div>
              )}
              {progress.profile.experience?.length > 0 && (
                <div>• {progress.profile.experience.length} work experiences</div>
              )}
              {progress.profile.education?.length > 0 && (
                <div>• {progress.profile.education.length} education entries</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            {error || 'An error occurred while processing your resume.'}
          </p>
          <p className="text-xs text-red-700 mt-2">
            Please try uploading again or contact support if the issue persists.
          </p>
        </div>
      )}

      {/* Loading Bar */}
      {['uploading', 'creating_assistant'].includes(status) && (
        <div className="mt-4">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ 
                width: status === 'uploading' ? '30%' : '60%'
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ProgressFieldProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  found: boolean;
}

function ProgressField({ icon, label, value, found }: ProgressFieldProps) {
  return (
    <div className={`flex items-center gap-2 text-sm transition-all duration-300 ${
      found ? 'opacity-100 scale-100 animate-fade-in-up' : 'opacity-40 scale-95'
    }`}>
      <div className={`transition-colors ${found ? 'text-green-600' : 'text-gray-400'}`}>
        {icon}
      </div>
      <span className="text-gray-700 min-w-[80px]">{label}:</span>
      {found ? (
        <span className="text-gray-900 font-medium">
          {value || '✓'}
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
          <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse delay-75" />
          <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse delay-150" />
        </div>
      )}
    </div>
  );
}
