import { CheckCircle2, AlertCircle, Code, Briefcase, Brain, Users } from 'lucide-react';

interface CategorizedItem {
  category: 'skills' | 'experience' | 'domain' | 'soft_skills';
  text: string;
}

interface CategorizedFitAnalysisProps {
  matches: {
    must_haves: string[];
    nice_to_haves: string[];
  };
  gaps: {
    missing_must_haves: string[];
    risks: string[];
  };
  onViewFullReport: () => void;
}

// Keywords for categorization
const SKILL_KEYWORDS = ['python', 'java', 'javascript', 'typescript', 'react', 'node', 'sql', 'aws', 'azure', 'docker', 'kubernetes', 'api', 'framework', 'library', 'tool', 'technology', 'programming', 'coding', 'development', 'testing', 'ci/cd', 'git', 'agile', 'scrum'];
const EXPERIENCE_KEYWORDS = ['years', 'experience', 'senior', 'junior', 'lead', 'principal', 'staff', 'manager', 'director', 'worked on', 'worked with', 'built', 'developed', 'managed', 'led'];
const DOMAIN_KEYWORDS = ['fintech', 'healthcare', 'e-commerce', 'saas', 'b2b', 'b2c', 'startup', 'enterprise', 'industry', 'domain', 'business', 'product', 'market', 'customer'];
const SOFT_SKILLS_KEYWORDS = ['communication', 'leadership', 'teamwork', 'collaboration', 'problem-solving', 'critical thinking', 'stakeholder', 'presentation', 'mentoring', 'coaching'];

function categorizeItem(text: string): 'skills' | 'experience' | 'domain' | 'soft_skills' {
  const lowerText = text.toLowerCase();
  
  // Check in order of specificity
  if (SOFT_SKILLS_KEYWORDS.some(keyword => lowerText.includes(keyword))) {
    return 'soft_skills';
  }
  if (EXPERIENCE_KEYWORDS.some(keyword => lowerText.includes(keyword))) {
    return 'experience';
  }
  if (DOMAIN_KEYWORDS.some(keyword => lowerText.includes(keyword))) {
    return 'domain';
  }
  if (SKILL_KEYWORDS.some(keyword => lowerText.includes(keyword))) {
    return 'skills';
  }
  
  // Default to skills if no clear match
  return 'skills';
}

function categorizeFitItems(items: string[]): CategorizedItem[] {
  return items.map(text => ({
    category: categorizeItem(text),
    text
  }));
}

const CATEGORY_CONFIG = {
  skills: {
    label: 'Technical Skills',
    icon: Code,
    color: 'blue'
  },
  experience: {
    label: 'Experience',
    icon: Briefcase,
    color: 'purple'
  },
  domain: {
    label: 'Domain Knowledge',
    icon: Brain,
    color: 'indigo'
  },
  soft_skills: {
    label: 'Soft Skills',
    icon: Users,
    color: 'pink'
  }
} as const;

export default function CategorizedFitAnalysis({ matches, gaps, onViewFullReport }: CategorizedFitAnalysisProps): JSX.Element {
  // Categorize all items
  const categorizedMatches = {
    must_haves: categorizeFitItems(matches.must_haves),
    nice_to_haves: categorizeFitItems(matches.nice_to_haves)
  };
  
  const categorizedGaps = {
    missing: categorizeFitItems(gaps.missing_must_haves),
    risks: categorizeFitItems(gaps.risks)
  };

  // Group by category
  const groupByCategory = (items: CategorizedItem[]) => {
    return items.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item.text);
      return acc;
    }, {} as Record<string, string[]>);
  };

  const matchesByCategory = groupByCategory([
    ...categorizedMatches.must_haves,
    ...categorizedMatches.nice_to_haves
  ]);

  const gapsByCategory = groupByCategory([
    ...categorizedGaps.missing,
    ...categorizedGaps.risks
  ]);

  const renderCategorySection = (
    category: keyof typeof CATEGORY_CONFIG,
    items: string[],
    type: 'match' | 'gap'
  ) => {
    if (!items || items.length === 0) return null;

    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isMatch = type === 'match';
    const baseColor = isMatch ? 'green' : 'amber';

    return (
      <div key={category} className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 text-${baseColor}-600`} />
          <h4 className={`text-xs font-semibold text-${baseColor}-800 uppercase tracking-wide`}>
            {config.label}
          </h4>
          <span className={`text-xs text-${baseColor}-600 font-medium`}>
            ({items.length})
          </span>
        </div>
        <ul className="space-y-1.5 pl-6">
          {items.map((item, idx) => (
            <li key={idx} className={`text-sm text-${baseColor}-900 flex items-start gap-2`}>
              <span className={`text-${baseColor}-600 mt-0.5 flex-shrink-0`}>
                {isMatch ? '✓' : '○'}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const hasMatches = Object.keys(matchesByCategory).length > 0;
  const hasGaps = Object.keys(gapsByCategory).length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Strengths & Matches */}
      {hasMatches && (
        <div className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-card">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <h3 className="text-lg font-semibold text-green-900">
              You Match
            </h3>
          </div>
          
          <div className="space-y-5">
            {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(category =>
              renderCategorySection(category, matchesByCategory[category], 'match')
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-green-200">
            <button
              onClick={onViewFullReport}
              className="w-full text-sm font-medium text-green-700 hover:text-green-800 hover:underline text-center transition-colors"
            >
              View Full Analysis →
            </button>
          </div>
        </div>
      )}

      {/* Gaps to Address */}
      {hasGaps && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-card">
          <div className="flex items-center gap-2 mb-5">
            <AlertCircle className="h-6 w-6 text-amber-600" />
            <h3 className="text-lg font-semibold text-amber-900">
              Gaps to Address
            </h3>
          </div>
          
          <div className="space-y-5">
            {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(category =>
              renderCategorySection(category, gapsByCategory[category], 'gap')
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-amber-200">
            <p className="text-xs text-amber-700 text-center">
              Consider highlighting these in your application materials
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
