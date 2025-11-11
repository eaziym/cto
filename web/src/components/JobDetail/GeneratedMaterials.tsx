import { FileText, Download } from 'lucide-react';
import type { GeneratedMaterial } from '../../api/client';

interface GeneratedMaterialsProps {
  materials: GeneratedMaterial[];
  onGenerateResume: () => void;
  onGenerateCoverLetter: () => void;
  onViewMaterials: () => void;
  isGeneratingResume: boolean;
  isGeneratingCoverLetter: boolean;
}

export default function GeneratedMaterials({
  materials,
  onGenerateResume,
  onGenerateCoverLetter,
  onViewMaterials,
  isGeneratingResume,
  isGeneratingCoverLetter
}: GeneratedMaterialsProps) {
  return (
    <div className="rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
      <h3 className="text-xl font-semibold text-slate-900 mb-6">Application Materials</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onGenerateResume}
          disabled={isGeneratingResume}
          className="inline-flex items-center justify-center rounded-xl border-2 border-indigo-200 bg-indigo-50 px-6 py-4 text-base font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          <FileText className="mr-2 h-5 w-5" />
          {isGeneratingResume ? 'Generating...' : 'Generate Resume'}
        </button>
        <button
          type="button"
          onClick={onGenerateCoverLetter}
          disabled={isGeneratingCoverLetter}
          className="inline-flex items-center justify-center rounded-xl border-2 border-purple-200 bg-purple-50 px-6 py-4 text-base font-semibold text-purple-700 hover:border-purple-300 hover:bg-purple-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          <FileText className="mr-2 h-5 w-5" />
          {isGeneratingCoverLetter ? 'Generating...' : 'Generate Cover Letter'}
        </button>
        {materials.length > 0 && (
          <button
            type="button"
            onClick={onViewMaterials}
            className="md:col-span-2 inline-flex items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition"
          >
            <Download className="mr-2 h-5 w-5" />
            View All Materials ({materials.length})
          </button>
        )}
      </div>
    </div>
  );
}
