import { useState } from 'react';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText, User, Briefcase, GraduationCap, Award, Github, Linkedin, FolderOpen } from 'lucide-react';
import type { KnowledgeSource } from '../api/client';
import type { StreamProgress } from '../hooks/useResumeStream';

interface SourcesPanelProps {
  sources: KnowledgeSource[];
  onAddSource: () => void;
  onDeleteSource: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  streamingSourceId?: string | null;
  streamingProgress?: StreamProgress | null;
}

function SourcesPanel({
  sources,
  onAddSource,
  onDeleteSource,
  isCollapsed,
  onToggleCollapse,
  streamingSourceId,
  streamingProgress,
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
              resume: <FileText className="h-4 w-4" />,
              linkedin: <Linkedin className="h-4 w-4" />,
              github: <Github className="h-4 w-4" />,
              personal_website: <FileText className="h-4 w-4" />,
              manual_text: <FileText className="h-4 w-4" />,
              project_document: <FolderOpen className="h-4 w-4" />,
              portfolio: <FolderOpen className="h-4 w-4" />,
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
              <SourceCard 
                key={source.id} 
                source={source} 
                onDelete={onDeleteSource}
                isStreaming={source.id === streamingSourceId}
                streamingProgress={source.id === streamingSourceId ? streamingProgress : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ 
  source, 
  onDelete,
  isStreaming = false,
  streamingProgress,
}: { 
  source: KnowledgeSource; 
  onDelete: (id: string) => void;
  isStreaming?: boolean;
  streamingProgress?: StreamProgress | null;
}) {
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

            {/* Show streaming progress if actively streaming */}
            {isStreaming && streamingProgress && streamingProgress.status !== 'idle' && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center space-x-2 text-xs">
                  <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                  <span className="text-blue-600 font-medium">
                    {streamingProgress.message || (
                      <>
                        {streamingProgress.status === 'uploading' && 'Extracting text...'}
                        {streamingProgress.status === 'fetching' && 'Fetching profile (30-60s)...'}
                        {streamingProgress.status === 'parsing' && (streamingProgress.streamedText ? 'Parsing fields...' : 'Analyzing...')}
                        {streamingProgress.status === 'complete' && 'Complete!'}
                      </>
                    )}
                  </span>
                </div>
                
                {/* Parse and display streaming JSON progressively */}
                {streamingProgress.streamedText && (() => {
                  const text = streamingProgress.streamedText;
                  
                  // Extract fields using regex - more stable than trying to fix broken JSON
                  const extractField = (fieldName: string) => {
                    const match = text.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`, 's'));
                    return match ? match[1] : null;
                  };
                  
                  const extractArray = (fieldName: string) => {
                    // Find the start of the array
                    const arrayStartRegex = new RegExp(`"${fieldName}"\\s*:\\s*\\[`);
                    const arrayStartMatch = text.match(arrayStartRegex);
                    if (!arrayStartMatch) return [];
                    
                    const startIndex = text.indexOf(arrayStartMatch[0]) + arrayStartMatch[0].length;
                    const remainingText = text.substring(startIndex);
                    
                    const items: any[] = [];
                    
                    // For skills (simple string array) - only match complete items
                    if (fieldName === 'skills' || fieldName === 'technical_skills') {
                      // Match quoted strings followed by comma or closing bracket
                      const stringMatches = remainingText.matchAll(/"([^"]+)"(?=\s*[,\]])/g);
                      for (const match of stringMatches) {
                        items.push(match[1]);
                      }
                    } else {
                      // For objects (experience, education, projects) - extract complete objects
                      // We need to handle nested braces properly
                      let braceCount = 0;
                      let currentObj = '';
                      let inString = false;
                      let escapeNext = false;
                      
                      for (let i = 0; i < remainingText.length; i++) {
                        const char = remainingText[i];
                        
                        if (escapeNext) {
                          currentObj += char;
                          escapeNext = false;
                          continue;
                        }
                        
                        if (char === '\\') {
                          escapeNext = true;
                          currentObj += char;
                          continue;
                        }
                        
                        if (char === '"') {
                          inString = !inString;
                          currentObj += char;
                          continue;
                        }
                        
                        if (!inString) {
                          if (char === '{') {
                            if (braceCount === 0) {
                              currentObj = char;
                            } else {
                              currentObj += char;
                            }
                            braceCount++;
                          } else if (char === '}') {
                            currentObj += char;
                            braceCount--;
                            if (braceCount === 0 && currentObj) {
                              // We have a complete object
                              try {
                                const parsed = JSON.parse(currentObj);
                                items.push(parsed);
                                currentObj = '';
                              } catch {
                                // Skip invalid JSON
                              }
                            }
                          } else if (braceCount > 0) {
                            currentObj += char;
                          } else if (char === ']') {
                            // End of array
                            break;
                          }
                        } else {
                          currentObj += char;
                        }
                      }
                    }
                    
                    return items;
                  };
                  
                  const name = extractField('name');
                  const email = extractField('email');
                  const phone = extractField('phone') || extractField('telephone');
                  const location = extractField('location');
                  const skills = extractArray('skills');
                  const experience = extractArray('experience');
                  const education = extractArray('education');
                  const projects = extractArray('projects');
                  
                  return (
                    <div className="space-y-2 text-xs">
                      {/* Contact Info */}
                      {(name || email || phone || location) && (
                        <div className="animate-fade-in">
                          <div className="mb-1 flex items-center space-x-1 text-gray-600">
                            <User className="h-3 w-3" />
                            <span className="font-medium">Contact</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {name && <p><span className="font-medium">Name:</span> {name}</p>}
                            {email && <p><span className="font-medium">Email:</span> {email}</p>}
                            {phone && <p><span className="font-medium">Phone:</span> {phone}</p>}
                            {location && <p><span className="font-medium">Location:</span> {location}</p>}
                          </div>
                        </div>
                      )}
                      
                      {/* Skills */}
                      {skills.length > 0 && (
                        <div className="animate-fade-in">
                          <div className="mb-1 flex items-center space-x-1 text-gray-600">
                            <Award className="h-3 w-3" />
                            <span className="font-medium">Skills ({skills.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-4">
                            {skills.slice(0, 6).map((skill: string, idx: number) => (
                              <span key={`skill-${idx}`} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                                {skill.length > 40 ? skill.substring(0, 40) + '...' : skill}
                              </span>
                            ))}
                            {skills.length > 6 && (
                              <span className="text-xs text-gray-500">+{skills.length - 6} more</span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Experience */}
                      {experience.length > 0 && (
                        <div className="animate-fade-in">
                          <div className="mb-1 flex items-center space-x-1 text-gray-600">
                            <Briefcase className="h-3 w-3" />
                            <span className="font-medium">Experience ({experience.length})</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {experience.slice(0, 2).map((exp: any, idx: number) => (
                              <div key={`exp-${idx}`}>
                                {(exp.job_title || exp.title) && (
                                  <p className="font-medium">{exp.job_title || exp.title}</p>
                                )}
                                {exp.company && <p className="text-gray-600">{exp.company}</p>}
                                {exp.duration && <p className="text-gray-500">{exp.duration}</p>}
                              </div>
                            ))}
                            {experience.length > 2 && (
                              <p className="text-gray-500">+{experience.length - 2} more positions</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Education */}
                      {education.length > 0 && (
                        <div className="animate-fade-in">
                          <div className="mb-1 flex items-center space-x-1 text-gray-600">
                            <GraduationCap className="h-3 w-3" />
                            <span className="font-medium">Education ({education.length})</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {education.slice(0, 2).map((edu: any, idx: number) => (
                              <div key={`edu-${idx}`}>
                                {(edu.degree || edu.field_of_study) && (
                                  <p className="font-medium">{edu.degree || edu.field_of_study}</p>
                                )}
                                {edu.institution && <p className="text-gray-600">{edu.institution}</p>}
                                {edu.duration && <p className="text-gray-500">{edu.duration}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Projects */}
                      {projects.length > 0 && (
                        <div className="animate-fade-in">
                          <div className="mb-1 flex items-center space-x-1 text-gray-600">
                            <FileText className="h-3 w-3" />
                            <span className="font-medium">Projects ({projects.length})</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {projects.slice(0, 2).map((proj: any, idx: number) => (
                              <div key={`proj-${idx}`}>
                                {proj.name && <p className="font-medium">{proj.name}</p>}
                                {proj.duration && <p className="text-gray-500">{proj.duration}</p>}
                              </div>
                            ))}
                            {projects.length > 2 && (
                              <p className="text-gray-500">+{projects.length - 2} more projects</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

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

            {/* Projects */}
            {parsedData.projects && parsedData.projects.length > 0 && (
              <div>
                <div className="mb-1 flex items-center space-x-1 text-gray-600">
                  <FileText className="h-3 w-3" />
                  <span className="font-medium">Projects ({parsedData.projects.length})</span>
                </div>
                <div className="space-y-1 pl-4">
                  {parsedData.projects.slice(0, 2).map((proj: any, idx: number) => (
                    <div key={idx}>
                      <p className="font-medium">{proj.name}</p>
                      {proj.duration && <p className="text-gray-500">{proj.duration}</p>}
                    </div>
                  ))}
                  {parsedData.projects.length > 2 && (
                    <p className="text-gray-500">+{parsedData.projects.length - 2} more projects</p>
                  )}
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