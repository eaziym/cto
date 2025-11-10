import { useState } from 'react';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText, User, Briefcase, GraduationCap, Award } from 'lucide-react';
import type { KnowledgeSource } from '../api/client';

interface SourcesPanelProps {
  sources: KnowledgeSource[];
  onAddSource: () => void;
  onDeleteSource: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function SourcesPanel({
  sources,
  onAddSource,
  onDeleteSource,
  isCollapsed,
  onToggleCollapse
}: SourcesPanelProps): JSX.Element {
  const completedSources = sources.filter((s) => s.processing_status === 'completed');
  const processingSources = sources.filter((s) => s.processing_status === 'processing' || s.processing_status === 'pending');

  if (isCollapsed) {
    return (
      <div className="h-full bg-white border-r border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            title="Expand sources panel"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="p-2 space-y-2">
          <button
            onClick={onAddSource}
            className="w-full flex items-center justify-center p-2 border-2 border-dashed border-gray-300 bg-white rounded-lg text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
            title="Add Source"
          >
            <Plus className="h-4 w-4" />
          </button>

          {sources.map((source) => {
            const sourceTypeIcons = {
              resume: <User className="h-4 w-4" />,
              linkedin: <User className="h-4 w-4" />,
              github: <User className="h-4 w-4" />,
              personal_website: <FileText className="h-4 w-4" />,
              manual_text: <FileText className="h-4 w-4" />,
              project_document: <FileText className="h-4 w-4" />,
              portfolio: <FileText className="h-4 w-4" />,
              other_document: <FileText className="h-4 w-4" />,
            };

            const statusColor = source.processing_status === 'completed' ? 'text-green-600' :
                               source.processing_status === 'processing' ? 'text-blue-600' :
                               source.processing_status === 'failed' ? 'text-red-600' : 'text-yellow-600';

            return (
              <div
                key={source.id}
                className="w-full flex items-center justify-center p-2 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors relative"
                title={`${source.source_type} - ${source.processing_status}`}
              >
                <div className={`${statusColor}`}>
                  {sourceTypeIcons[source.source_type]}
                </div>

                {/* Hover tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                  {source.source_identifier || source.source_type}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-sm font-medium text-gray-900">Sources</h2>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Collapse sources panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-200">
        {/* Add Source Button */}
        <button
          data-tour="add-source-button"
          onClick={onAddSource}
          className="w-full flex items-center justify-center space-x-2 rounded-lg border-2 border-dashed border-gray-300 bg-white py-2.5 text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm font-medium">Add Source</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" data-tour="sources-section">
        {sources.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-600">No sources yet</p>
            <p className="text-xs text-gray-500 mt-1">Add your first source to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} onDelete={onDeleteSource} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source, onDelete }: { source: KnowledgeSource; onDelete: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    processing: <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
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
    <div className="rounded-lg border border-gray-200 bg-gray-50 transition hover:shadow-sm">
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900 truncate">
                {sourceTypeLabels[source.source_type]}
              </span>
              {statusIcons[source.processing_status]}
            </div>

            {source.source_identifier && (
              <p className="text-xs text-gray-600 truncate mb-1">{source.source_identifier}</p>
            )}

            <div className="flex items-center space-x-3 text-xs text-gray-500">
              <span>{new Date(source.created_at).toLocaleDateString()}</span>
              <span className="capitalize">{source.processing_status}</span>
            </div>

            {source.error_message && (
              <p className="mt-1 text-xs text-red-600 line-clamp-2">Error: {source.error_message}</p>
            )}
          </div>

          <div className="flex items-center space-x-1 ml-2">
            {hasData && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                title="View parsed data"
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
            <button
              onClick={() => onDelete(source.id)}
              className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
              title="Delete source"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded parsed data */}
      {isExpanded && hasData && (
        <div className="border-t border-gray-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Parsed Information</h4>

          <div className="space-y-3 text-xs">
            {/* Basic Info */}
            {(parsedData.name || parsedData.email || parsedData.phone) && (
              <div>
                <div className="mb-1 flex items-center space-x-1 text-gray-600">
                  <User className="h-3 w-3" />
                  <span className="font-medium">Contact</span>
                </div>
                <div className="space-y-1 pl-4">
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
                <div className="mb-1 flex items-center space-x-1 text-gray-600">
                  <Award className="h-3 w-3" />
                  <span className="font-medium">Skills ({parsedData.skills.length})</span>
                </div>
                <div className="flex flex-wrap gap-1 pl-4">
                  {parsedData.skills.slice(0, 6).map((skill: string, idx: number) => (
                    <span key={idx} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      {skill}
                    </span>
                  ))}
                  {parsedData.skills.length > 6 && (
                    <span className="text-xs text-gray-500">+{parsedData.skills.length - 6} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Experience */}
            {parsedData.experience && parsedData.experience.length > 0 && (
              <div>
                <div className="mb-1 flex items-center space-x-1 text-gray-600">
                  <Briefcase className="h-3 w-3" />
                  <span className="font-medium">Experience ({parsedData.experience.length})</span>
                </div>
                <div className="space-y-1 pl-4">
                  {parsedData.experience.slice(0, 2).map((exp: any, idx: number) => (
                    <div key={idx}>
                      <p className="font-medium">{exp.job_title || exp.title}</p>
                      <p className="text-gray-600">{exp.company}</p>
                      {exp.duration && <p className="text-gray-500">{exp.duration}</p>}
                    </div>
                  ))}
                  {parsedData.experience.length > 2 && (
                    <p className="text-gray-500">+{parsedData.experience.length - 2} more positions</p>
                  )}
                </div>
              </div>
            )}

            {/* Education */}
            {parsedData.education && parsedData.education.length > 0 && (
              <div>
                <div className="mb-1 flex items-center space-x-1 text-gray-600">
                  <GraduationCap className="h-3 w-3" />
                  <span className="font-medium">Education ({parsedData.education.length})</span>
                </div>
                <div className="space-y-1 pl-4">
                  {parsedData.education.slice(0, 2).map((edu: any, idx: number) => (
                    <div key={idx}>
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
                <div className="mb-1 text-gray-600 font-medium">Summary</div>
                <p className="pl-4 text-gray-700 line-clamp-3">{parsedData.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SourcesPanel;