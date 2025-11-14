import { useState } from 'react';
import { User, Briefcase, GraduationCap, Award, ExternalLink, RefreshCw, Edit3, Loader, FileText, Github, Linkedin, FolderOpen } from 'lucide-react';
import type { AggregatedProfile } from '../api/client';
import { updateAggregatedProfile } from '../api/client';
import type { AggregateProgress } from '../hooks/useAggregateStream';

interface ProfilePanelProps {
  aggregatedProfile: AggregatedProfile | null;
  isAggregating: boolean;
  aggregateProgress?: AggregateProgress | null;
  onProfileUpdate?: (updatedProfile: AggregatedProfile) => void;
}

function ProfilePanel({
  aggregatedProfile,
  isAggregating,
  aggregateProgress,
  onProfileUpdate
}: ProfilePanelProps): JSX.Element {
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllExperience, setShowAllExperience] = useState(false);
  const [showAllEducation, setShowAllEducation] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSummary, setEditingSummary] = useState('');

  console.log('[ProfilePanel] Props:', { 
    hasProfile: !!aggregatedProfile, 
    profileName: aggregatedProfile?.name,
    isAggregating,
    profileObject: aggregatedProfile ? 'exists' : 'null'
  });
  console.log('[ProfilePanel] Full aggregatedProfile:', aggregatedProfile);

  // Helper function to render source icon
  const renderSourceIcon = (source: string) => {
    const sourceType = source.toLowerCase();
    const iconProps = { className: "h-3 w-3" };
    
    if (sourceType.includes('resume')) {
      return <FileText {...iconProps} />;
    } else if (sourceType.includes('github')) {
      return <Github {...iconProps} />;
    } else if (sourceType.includes('linkedin')) {
      return <Linkedin {...iconProps} />;
    } else if (sourceType.includes('project')) {
      return <FolderOpen {...iconProps} />;
    }
    return null;
  };

  const handleEditStart = () => {
    setEditingSummary(aggregatedProfile?.summary || '');
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    if (!aggregatedProfile || !onProfileUpdate) return;

    try {
      const { aggregated_profile } = await updateAggregatedProfile({
        summary: editingSummary
      });
      onProfileUpdate(aggregated_profile);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
      // Could add error handling here
    }
  };

  const handleEditCancel = () => {
    setEditingSummary(aggregatedProfile?.summary || '');
    setIsEditing(false);
  };

  // Show streaming progress overlay if aggregating with progress
  if (isAggregating && aggregateProgress && aggregateProgress.streamedText) {
    const { status, streamedText, sourcesCount } = aggregateProgress;
    
    // Helper to extract fields from partial JSON
    const extractField = (fieldName: string) => {
      const match = streamedText.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`, 's'));
      return match ? match[1] : null;
    };
    
    const extractArray = (fieldName: string) => {
      // Match array start, then capture everything until we find the matching closing bracket
      const arrayStartMatch = streamedText.match(new RegExp(`"${fieldName}"\\s*:\\s*\\[`, 's'));
      if (!arrayStartMatch) return [];
      
      const startIndex = arrayStartMatch.index! + arrayStartMatch[0].length;
      let depth = 1; // We're inside the array
      let endIndex = startIndex;
      let inString = false;
      let escape = false;
      
      // Find the matching closing bracket
      for (let i = startIndex; i < streamedText.length; i++) {
        const char = streamedText[i];
        
        if (escape) {
          escape = false;
          continue;
        }
        
        if (char === '\\') {
          escape = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '[') {
            depth++;
          } else if (char === ']') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      
      const content = streamedText.substring(startIndex, endIndex);
      const items: any[] = [];
      
      if (!content.trim()) {
        return items; // Empty array
      }
      
      console.log(`[EXTRACT] ${fieldName} array content length:`, content.length, 'chars');
      
      if (fieldName === 'skills' || fieldName === 'technical_skills') {
        // For simple string arrays
        const stringMatches = content.matchAll(/"([^"]+)"(?:\s*[,\]])/g);
        for (const match of stringMatches) {
          items.push(match[1]);
        }
      } else {
        // For object arrays - match complete objects with nested braces
        let depth = 0;
        let currentObj = '';
        let inString = false;
        let escape = false;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          
          // Handle escape characters first
          if (escape) {
            if (depth > 0) currentObj += char;
            escape = false;
            continue;
          }
          
          if (char === '\\') {
            escape = true;
            if (depth > 0) currentObj += char;
            continue;
          }
          
          // Handle string boundaries
          if (char === '"') {
            if (depth > 0) currentObj += char;
            inString = !inString;
            continue;
          }
          
          // Only count braces outside of strings
          if (!inString) {
            if (char === '{') {
              if (depth === 0) {
                // Start of new object
                currentObj = '{';
                depth = 1;
              } else {
                // Nested object
                currentObj += char;
                depth++;
              }
            } else if (char === '}') {
              currentObj += char;
              depth--;
              
              // When we complete an object (depth returns to 0), try to parse it
              if (depth === 0 && currentObj.trim()) {
                try {
                  const parsed = JSON.parse(currentObj);
                  items.push(parsed);
                  currentObj = '';
                } catch (e) {
                  // Log parse errors for debugging
                  console.log(`[PARSE] Failed to parse ${fieldName} object:`, currentObj.substring(0, 100), e);
                  currentObj = '';
                }
              }
            } else if (depth > 0) {
              // Inside an object, accumulate all other characters
              currentObj += char;
            }
          } else {
            // Inside string, accumulate all characters
            if (depth > 0) {
              currentObj += char;
            }
          }
        }
      }

      
      return items;
    };
    
    const name = extractField('name');
    const email = extractField('email');
    const phone = extractField('phone');
    const location = extractField('location');
    const summary = extractField('summary');
    const skills = extractArray('skills');
    const experience = extractArray('experience');
    const education = extractArray('education');
    const projects = extractArray('projects');
    
    console.log('[STREAMING] Extracted:', { 
      name, 
      skillsCount: skills.length, 
      experienceCount: experience.length, 
      educationCount: education.length, 
      projectsCount: projects.length 
    });
    
    return (
      <div className="h-full bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <h2 className="text-sm font-medium text-gray-900">The Complete You</h2>
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <Loader className="h-3 w-3 animate-spin" />
              <span>
                {status === 'fetching' && `Fetching ${sourcesCount || ''} sources...`}
                {status === 'aggregating' && 'Merging profiles...'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Contact Info */}
            {(name || email || phone || location || summary) && (
              <div className="animate-fade-in">
                <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
                  <div className="flex items-center justify-between mb-4">
                    {name && <h3 className="text-lg font-semibold text-gray-900">{name}</h3>}
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="space-y-2 text-sm text-gray-700">
                    {email && (
                      <div className="flex items-center space-x-2">
                        <span>✉️</span>
                        <span>{email}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center space-x-2">
                        <span>📱</span>
                        <span>{phone}</span>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center space-x-2">
                        <span>📍</span>
                        <span>{location}</span>
                      </div>
                    )}
                  </div>
                  {summary && (
                    <p className="mt-4 text-sm text-gray-600 leading-relaxed">{summary}</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Skills */}
            {skills.length > 0 && (
              <div className="animate-fade-in">
                <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  <Award className="h-4 w-4" />
                  <span>Skills ({skills.length})</span>
                </h4>
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill: string, idx: number) => (
                      <span key={`skill-${idx}`} className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Experience */}
            {experience.length > 0 && (
              <div className="animate-fade-in">
                <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  <Briefcase className="h-4 w-4" />
                  <span>Experience ({experience.length} positions)</span>
                </h4>
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="divide-y divide-gray-200">
                    {experience.map((exp: any, idx: number) => (
                      <div key={`exp-${idx}`} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {(exp.job_title || exp.title) && <h5 className="font-medium text-gray-900">{exp.job_title || exp.title}</h5>}
                            {exp.company && <p className="text-gray-600">{exp.company}</p>}
                            {exp.duration && <p className="text-sm text-gray-500">{exp.duration}</p>}
                            {exp.location && <p className="text-sm text-gray-500">{exp.location}</p>}
                          </div>
                          {exp.source && (
                            <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1" title={exp.source}>
                              {renderSourceIcon(exp.source)}
                            </span>
                          )}
                        </div>
                        {exp.description && (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{exp.description}</p>
                        )}
                        {exp.skills && exp.skills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {exp.skills.slice(0, 5).map((skill: string, skillIdx: number) => (
                              <span key={skillIdx} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {skill}
                              </span>
                            ))}
                            {exp.skills.length > 5 && (
                              <span className="text-xs text-gray-500">+{exp.skills.length - 5} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Education */}
            {education.length > 0 && (
              <div className="animate-fade-in">
                <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  <GraduationCap className="h-4 w-4" />
                  <span>Education ({education.length})</span>
                </h4>
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="divide-y divide-gray-200">
                    {education.map((edu: any, idx: number) => (
                      <div key={`edu-${idx}`} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {(edu.degree || edu.field_of_study) && (
                              <h5 className="font-medium text-gray-900">{edu.degree || edu.field_of_study}</h5>
                            )}
                            {edu.institution && <p className="text-gray-600">{edu.institution}</p>}
                            {edu.duration && <p className="text-sm text-gray-500">{edu.duration}</p>}
                            {edu.gpa && <p className="text-sm text-gray-500">GPA: {edu.gpa}</p>}
                          </div>
                          {edu.source && (
                            <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1" title={edu.source}>
                              {renderSourceIcon(edu.source)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Projects */}
            {projects.length > 0 && (
              <div className="animate-fade-in">
                <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  <Award className="h-4 w-4" />
                  <span>Projects ({projects.length})</span>
                </h4>
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="divide-y divide-gray-200">
                    {projects.map((proj: any, idx: number) => (
                      <div key={`proj-${idx}`} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              {proj.name && <h5 className="font-medium text-gray-900">{proj.name}</h5>}
                              {proj.url && (
                                <a
                                  href={proj.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 ml-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                            {proj.description && <p className="mt-1 text-sm text-gray-600">{proj.description}</p>}
                            {proj.technologies && proj.technologies.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {proj.technologies.slice(0, 6).map((tech: string, techIdx: number) => (
                                  <span key={techIdx} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                    {tech}
                                  </span>
                                ))}
                                {proj.technologies.length > 6 && (
                                  <span className="text-xs text-gray-500">+{proj.technologies.length - 6} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          {proj.source && (
                            <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1 ml-2" title={proj.source}>
                              {renderSourceIcon(proj.source)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {!streamedText && (
            <div className="text-center py-8">
              <Loader className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-blue-600">
                {status === 'fetching' ? `Loading ${sourcesCount || ''} sources...` : 'Starting aggregation...'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If aggregating without streamedText yet, show existing profile with indicator if available
  // Otherwise show loading state
  if (isAggregating && !aggregatedProfile) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-lg font-medium text-blue-700 mb-2">Building Your Profile</p>
          <p className="text-sm text-blue-600">Analyzing and combining your sources...</p>
          <p className="text-xs text-gray-500 mt-2">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  if (!aggregatedProfile || !aggregatedProfile.name) {
    return (
      <div className="h-full bg-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <User className="mx-auto mb-4 h-16 w-16 text-gray-400" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Your Profile Awaits</h3>
          <p className="text-gray-600 mb-6">Add at least one source to generate your unified professional profile. Upload a resume, connect your LinkedIn, or add project documents to get started.</p>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-blue-600">1</span>
              </div>
              <span>Add your sources</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-400">2</span>
              </div>
              <span>Build your unified profile</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-400">3</span>
              </div>
              <span>Get personalized job matches</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 h-12 flex items-center flex-shrink-0">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-sm font-medium text-gray-900">The Complete You</h2>
          {isAggregating && (
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <Loader className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4" data-tour="aggregated-profile">
        <div className="space-y-4">
          {/* Contact Info */}
          <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{aggregatedProfile.name}</h3>
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              {aggregatedProfile.email && (
                <div className="flex items-center space-x-2">
                  <span>✉️</span>
                  <span>{aggregatedProfile.email}</span>
                </div>
              )}
              {aggregatedProfile.phone && (
                <div className="flex items-center space-x-2">
                  <span>📱</span>
                  <span>{aggregatedProfile.phone}</span>
                </div>
              )}
              {aggregatedProfile.location && (
                <div className="flex items-center space-x-2">
                  <span>📍</span>
                  <span>{aggregatedProfile.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {(aggregatedProfile.summary || isEditing) && (
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Professional Summary</h4>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                {isEditing ? (
                  <textarea
                    value={editingSummary}
                    onChange={(e) => setEditingSummary(e.target.value)}
                    rows={4}
                    className="w-full text-sm text-gray-600 leading-relaxed border-0 p-0 focus:ring-0 resize-none"
                    placeholder="Add a professional summary..."
                  />
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed">{aggregatedProfile.summary}</p>
                )}
              </div>
            </div>
          )}

          {/* Skills */}
          {aggregatedProfile.skills && aggregatedProfile.skills.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <Award className="h-4 w-4" />
                <span>Skills ({aggregatedProfile.skills.length})</span>
              </h4>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap gap-2">
                  {(showAllSkills ? aggregatedProfile.skills : aggregatedProfile.skills.slice(0, 20)).map((skill: string, idx: number) => (
                    <span key={idx} className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
                {aggregatedProfile.skills.length > 20 && (
                  <button
                    onClick={() => setShowAllSkills(!showAllSkills)}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showAllSkills ? '- Show less' : `+ Show all ${aggregatedProfile.skills.length} skills`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Experience */}
          {aggregatedProfile.experience && aggregatedProfile.experience.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <Briefcase className="h-4 w-4" />
                <span>Experience ({aggregatedProfile.experience.length} positions)</span>
              </h4>
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="divide-y divide-gray-200">
                  {(showAllExperience ? aggregatedProfile.experience : aggregatedProfile.experience.slice(0, 4)).map((exp: any, idx: number) => (
                    <div key={idx} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900">{exp.job_title || exp.title}</h5>
                          <p className="text-gray-600">{exp.company}</p>
                          {exp.duration && <p className="text-sm text-gray-500">{exp.duration}</p>}
                          {exp.location && <p className="text-sm text-gray-500">{exp.location}</p>}
                        </div>
                        {exp.source && (
                          <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1" title={exp.source}>
                            {renderSourceIcon(exp.source)}
                          </span>
                        )}
                      </div>
                      {exp.description && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{exp.description}</p>
                      )}
                      {exp.skills && exp.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {exp.skills.slice(0, 5).map((skill: string, skillIdx: number) => (
                            <span key={skillIdx} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                              {skill}
                            </span>
                          ))}
                          {exp.skills.length > 5 && (
                            <span className="text-xs text-gray-500">+{exp.skills.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {aggregatedProfile.experience.length > 4 && (
                  <div className="p-4 border-t border-gray-200">
                    <button
                      onClick={() => setShowAllExperience(!showAllExperience)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showAllExperience ? '- Show less' : `+ Show all ${aggregatedProfile.experience.length} positions`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Education */}
          {aggregatedProfile.education && aggregatedProfile.education.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <GraduationCap className="h-4 w-4" />
                <span>Education ({aggregatedProfile.education.length})</span>
              </h4>
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="divide-y divide-gray-200">
                  {(showAllEducation ? aggregatedProfile.education : aggregatedProfile.education.slice(0, 3)).map((edu: any, idx: number) => (
                    <div key={idx} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900">{edu.degree || edu.field_of_study}</h5>
                          <p className="text-gray-600">{edu.institution}</p>
                          {edu.duration && <p className="text-sm text-gray-500">{edu.duration}</p>}
                          {edu.gpa && <p className="text-sm text-gray-500">GPA: {edu.gpa}</p>}
                        </div>
                        {edu.source && (
                          <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1" title={edu.source}>
                            {renderSourceIcon(edu.source)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {aggregatedProfile.education.length > 3 && (
                  <div className="p-4 border-t border-gray-200">
                    <button
                      onClick={() => setShowAllEducation(!showAllEducation)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showAllEducation ? '- Show less' : `+ Show all ${aggregatedProfile.education.length} entries`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Projects */}
          {aggregatedProfile.projects && aggregatedProfile.projects.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center space-x-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                <Award className="h-4 w-4" />
                <span>Projects ({aggregatedProfile.projects.length})</span>
              </h4>
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="divide-y divide-gray-200">
                  {(showAllProjects ? aggregatedProfile.projects : aggregatedProfile.projects.slice(0, 3)).map((project: any, idx: number) => (
                    <div key={idx} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <h5 className="font-medium text-gray-900">{project.name}</h5>
                            {project.url && (
                              <a
                                href={project.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 ml-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          {project.description && <p className="mt-1 text-sm text-gray-600">{project.description}</p>}
                          {project.technologies && project.technologies.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {project.technologies.slice(0, 6).map((tech: string, techIdx: number) => (
                                <span key={techIdx} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                  {tech}
                                </span>
                              ))}
                              {project.technologies.length > 6 && (
                                <span className="text-xs text-gray-500">+{project.technologies.length - 6} more</span>
                              )}
                            </div>
                          )}
                        </div>
                        {project.source && (
                          <span className="text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1 ml-2" title={project.source}>
                            {renderSourceIcon(project.source)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {aggregatedProfile.projects.length > 3 && (
                  <div className="p-4 border-t border-gray-200">
                    <button
                      onClick={() => setShowAllProjects(!showAllProjects)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showAllProjects ? '- Show less' : `+ Show all ${aggregatedProfile.projects.length} projects`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default ProfilePanel;