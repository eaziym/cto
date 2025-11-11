import { Briefcase, MapPin, Building2, DollarSign, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface JobHeaderProps {
  title: string;
  company: string;
  location: string;
  tags: string[];
  salary?: string;
  postedDate?: string;
  isInternSG?: boolean;
  description?: string;
}

export default function JobHeader({ 
  title, 
  company, 
  location, 
  tags, 
  salary,
  postedDate,
  isInternSG,
  description 
}: JobHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Get preview of description (first 200 chars)
  const previewText = description 
    ? description.replace(/<[^>]*>/g, '').slice(0, 200) + '...'
    : '';

  return (
    <div className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-8 shadow-card">
      {isInternSG && (
        <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 mb-4">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          InternSG Partner
        </div>
      )}
      
      <h1 className="text-3xl font-bold text-slate-900 mb-4">{title}</h1>
      
      <div className="flex flex-wrap items-center gap-4 text-slate-600 mb-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <span className="font-medium">{company}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          <span>{location}</span>
        </div>
        {salary && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            <span>{salary}</span>
          </div>
        )}
        {postedDate && (
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <span>{postedDate}</span>
          </div>
        )}
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Collapsible Job Description */}
      {description && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-left group"
          >
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Job Description
            </h3>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition" />
            )}
          </button>
          
          <div className={`mt-3 overflow-hidden transition-all ${expanded ? 'max-h-[2000px]' : 'max-h-20'}`}>
            <div 
              className="text-sm leading-relaxed text-slate-600"
              dangerouslySetInnerHTML={{ 
                __html: description
                  .replace(/^#{1,3}\s+(.+)$/gm, '<h3 class="text-base font-bold text-slate-900 mt-6 mb-3">$1</h3>')
                  .replace(/^([^:\n]+):$/gm, '<p class="font-semibold text-slate-900 mt-4 mb-2">$1:</p>')
                  .split('\n\n')
                  .map(para => {
                    if (para.trim().startsWith('<')) return para;
                    return `<p class="mb-4">${para.replace(/\n/g, '<br />')}</p>`;
                  })
                  .join('')
              }}
            />
          </div>
          
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {expanded ? '← Collapse' : 'Read more →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
