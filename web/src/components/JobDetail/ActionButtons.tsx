interface ActionButtonsProps {
  hasApplied: boolean;
  onApply: () => void;
}

export default function ActionButtons({
  hasApplied,
  onApply
}: ActionButtonsProps) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Ready to Apply?</h2>
      <button
        onClick={onApply}
        disabled={hasApplied}
        className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-semibold transition-all ${
          hasApplied
            ? 'bg-green-100 text-green-700 cursor-not-allowed border border-green-200'
            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow-md'
        }`}
      >
        {hasApplied ? (
          <>
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Application Submitted
          </>
        ) : (
          <>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Apply on Company Website
          </>
        )}
      </button>
      {!hasApplied && (
        <p className="mt-3 text-xs text-slate-500 text-center">
          You'll be redirected to the application page
        </p>
      )}
    </div>
  );
}
