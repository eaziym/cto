interface FitScoreHeroProps {
  score: number;
  decision: string;
  isAnalyzing: boolean;
}

export default function FitScoreHero({ score, decision, isAnalyzing }: FitScoreHeroProps) {
  if (isAnalyzing) {
    return (
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative">
            <svg className="animate-spin h-12 w-12 text-brand-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="mt-3 text-base font-semibold text-slate-700">Analyzing your fit...</p>
          <p className="mt-1 text-xs text-slate-500">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  const getDecisionColor = (decision: string) => {
    switch (decision.toLowerCase()) {
      case 'strong_match':
        return 'from-green-500 to-emerald-600';
      case 'possible_match':
        return 'from-blue-500 to-indigo-600';
      case 'weak_match':
        return 'from-amber-500 to-orange-600';
      case 'reject':
        return 'from-red-500 to-rose-600';
      default:
        return 'from-slate-500 to-slate-600';
    }
  };

  const getDecisionLabel = (decision: string) => {
    switch (decision.toLowerCase()) {
      case 'strong_match':
        return 'Strong Match';
      case 'possible_match':
        return 'Possible Match';
      case 'weak_match':
        return 'Weak Match';
      case 'reject':
        return 'Not a Match';
      default:
        return decision;
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision.toLowerCase()) {
      case 'strong_match':
        return (
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'possible_match':
        return (
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'weak_match':
        return (
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${getDecisionColor(decision)} p-4 md:p-6 shadow-md text-white`}>
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium opacity-90 uppercase tracking-wide">Your Fit Score</p>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold">{score}%</h2>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide">
            {getDecisionLabel(decision)}
          </span>
        </div>
      </div>
    </div>
  );
}
