import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import toast from 'react-hot-toast';
import BreakdownCards from '../components/BreakdownCards';
import Modal from '../components/Modal';
import JobHeader from '../components/JobDetail/JobHeader';
import ActionButtons from '../components/JobDetail/ActionButtons';
import HRContactSection from '../components/JobDetail/HRContactSection';
import FitAnalysisSidebar from '../components/JobDetail/FitAnalysisSidebar';
import GeneratedMaterials from '../components/JobDetail/GeneratedMaterials';
import FitScoreHero from '../components/JobDetail/FitScoreHero';
import CategorizedFitAnalysis from '../components/JobDetail/CategorizedFitAnalysis';
import { analyzeJobFit, createApplication, searchHRContacts, getCachedHRContacts, generateOutreachMessage, fetchExistingAssessment, generateResume, generateCoverLetter, fetchJobMaterials, updateMaterial, type HRProspect, type JobAnalysisResponse, type GeneratedMaterial } from '../api/client';
import { useJobDetail } from '../hooks/useJobs';
import { useProfileStore } from '../store/profile';
import type { CompassScore } from '../types';

type ModalType = 'apply' | 'hr' | 'assess' | 'report' | 'materials' | null;

export default function JobDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useJobDetail(id);
  const profile = useProfileStore((state) => state.profile);
  const addApplication = useProfileStore((state) => state.addApplication);
  
  // Don't show any default/cached score - only show after user requests analysis
  const [scoreOverride, setScoreOverride] = useState<number | undefined>(undefined);
  const [verdictOverride, setVerdictOverride] = useState<string | undefined>(undefined);
  const [scoreDetails, setScoreDetails] = useState<CompassScore | undefined>(undefined);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [applicationNotes, setApplicationNotes] = useState<string>('');
  const [hasApplied, setHasApplied] = useState(false);
  const [hrProspects, setHrProspects] = useState<HRProspect[]>([]);
  const [hrLoading, setHrLoading] = useState(false);
  const [hrFetched, setHrFetched] = useState(false); // Track if we've attempted to fetch HR contacts
  const [assessmentReport, setAssessmentReport] = useState<JobAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // Loading state for fit analysis
  const [outreachMessage, setOutreachMessage] = useState<{ subject: string; body: string } | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [selectedHRContact, setSelectedHRContact] = useState<HRProspect | null>(null);
  
  // Material generation state
  const [materials, setMaterials] = useState<GeneratedMaterial[]>([]);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialViewMode, setMaterialViewMode] = useState<Record<string, 'raw' | 'preview'>>({});
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [savingMaterial, setSavingMaterial] = useState(false);
  
  // Track if we've already initiated analysis for this job to prevent duplicate calls
  const analysisInitiatedRef = useRef<string | null>(null);

  // Auto-run fit analysis on page load
  useEffect(() => {
    const runAutoAnalysis = async () => {
      if (!id || !profile) return;
      
      // Check if we already have an assessment - prevent duplicate calls
      if (assessmentReport) return;
      
      // Check if we've already initiated analysis for this specific job
      if (analysisInitiatedRef.current === id) return;
      
      // Mark as initiated before starting
      analysisInitiatedRef.current = id;
      setIsAnalyzing(true);
      
      try {
        const result = await analyzeJobFit(id, false);
        setAssessmentReport(result);
        
        // No longer setting COMPASS score - removed
        
        if (!result.from_cache) {
          toast.success('Fit analysis completed!');
        }
      } catch (error) {
        console.error('Auto-analysis failed:', error);
        // Reset on error so user can retry
        analysisInitiatedRef.current = null;
        // Silently fail - user can manually trigger if needed
      } finally {
        setIsAnalyzing(false);
      }
    };

    runAutoAnalysis();
  }, [id, profile]); // Only run when id or profile changes

  // Remove automatic score population from data
  // Score only shows after user requests analysis with LLM
  useEffect(() => {
    // No-op: do not auto-populate score from data
  }, []);

  // Don't auto-fetch existing assessment (only load when user clicks "Assess Fit")
  // Remove this effect to avoid showing cached score
  useEffect(() => {
    // No-op: do not auto-load assessment
  }, [id]);
  
  // Fetch existing materials
  useEffect(() => {
    const loadMaterials = async () => {
      if (!id) return;
      
      try {
        const result = await fetchJobMaterials(id);
        setMaterials(result.materials);
      } catch (error) {
        console.log('No existing materials found');
      }
    };

    loadMaterials();
  }, [id]);
  
  // Helper function to reload materials from database
  const reloadMaterials = async () => {
    if (!id) return;
    try {
      const result = await fetchJobMaterials(id);
      setMaterials(result.materials);
      console.log('Reloaded materials from database:', result.materials.length);
    } catch (error) {
      console.log('Failed to reload materials');
    }
  };
  
  // Remove automatic HR contacts loading - make it on-demand only
  // useEffect removed - user must click "Find HR" button
  
  const handleGenerateResume = async () => {
    if (!id) return;
    setGeneratingResume(true);
    try {
      const { material } = await generateResume(id, { tone: 'professional' });
      
      // Reload materials from database to get accurate count
      // (Backend now deletes old resumes before inserting new one)
      await reloadMaterials();
      
      toast.success('Resume generated successfully! Click "View Materials" to see it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate resume');
    } finally {
      setGeneratingResume(false);
    }
  };
  
  const handleGenerateCoverLetter = async () => {
    if (!id) return;
    setGeneratingCoverLetter(true);
    try {
      const { material } = await generateCoverLetter(id, { tone: 'professional' });
      
      // Reload materials from database to get accurate count
      // (Backend now deletes old cover letters before inserting new one)
      await reloadMaterials();
      
      toast.success('Cover letter generated successfully! Click "View Materials" to see it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate cover letter');
    } finally {
      setGeneratingCoverLetter(false);
    }
  };
  
  const handleViewMaterials = () => {
    setActiveModal('materials');
  };  if (!id) {
    return (
      <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-red-500">Job not found.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="space-y-6 animate-pulse">
              {/* Job Header Skeleton */}
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
                <div className="space-y-4">
                  {/* Company badge */}
                  <div className="h-6 bg-slate-200 rounded w-32"></div>
                  {/* Job title */}
                  <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                  {/* Location & tags */}
                  <div className="flex flex-wrap gap-2">
                    <div className="h-6 bg-slate-200 rounded w-24"></div>
                    <div className="h-6 bg-slate-200 rounded w-32"></div>
                    <div className="h-6 bg-slate-200 rounded w-28"></div>
                  </div>
                  {/* Description preview */}
                  <div className="mt-6 space-y-2 pt-6 border-t border-slate-200">
                    <div className="h-4 bg-slate-200 rounded"></div>
                    <div className="h-4 bg-slate-200 rounded w-11/12"></div>
                    <div className="h-4 bg-slate-200 rounded w-10/12"></div>
                  </div>
                </div>
              </div>

              {/* Generated Materials Skeleton */}
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
                <div className="flex items-center justify-between mb-6">
                  <div className="h-6 bg-slate-200 rounded w-48"></div>
                  <div className="h-10 bg-slate-200 rounded w-32"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-32 bg-slate-100 rounded-xl border border-slate-200"></div>
                  <div className="h-32 bg-slate-100 rounded-xl border border-slate-200"></div>
                </div>
              </div>

              {/* HR Contact Section Skeleton */}
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
                <div className="h-6 bg-slate-200 rounded w-40 mb-6"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                  <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                </div>
                <div className="mt-6 flex gap-3">
                  <div className="h-10 bg-slate-200 rounded w-32"></div>
                  <div className="h-10 bg-slate-200 rounded w-40"></div>
                </div>
              </div>

              {/* Action Buttons Skeleton */}
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
                <div className="h-12 bg-slate-200 rounded-xl w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleAssessFit = async () => {
    if (!profile) {
      navigate('/knowledge-base');
      return;
    }
    setActiveModal('assess');
  };

  const handleConfirmAssess = async (regenerate = false) => {
    if (!profile || !id) return;
    
    // Don't close modal if regenerating - keep it open to show loading state
    if (!regenerate) {
      setActiveModal(null);
    }
    
    setIsAnalyzing(true);
    try {
      const result = await analyzeJobFit(id, regenerate);
      setAssessmentReport(result);
      
      // Update COMPASS score with the recalculated score based on detailed JD
      if (result.compass_score) {
        setScoreOverride(result.compass_score.totalRaw);
        setVerdictOverride(result.compass_score.verdict);
        setScoreDetails(result.compass_score);
      }
      
      toast.success(result.from_cache && !regenerate 
        ? 'Loaded existing assessment from database.' 
        : 'Fit assessment completed with detailed LLM analysis.');
      
      // Show the detailed report modal
      setActiveModal('report');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assess fit.');
      // If regenerate failed, close the modal
      if (regenerate) {
        setActiveModal(null);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOpenExternalLink = () => {
    if (!data) return;
    
    // Use applyUrl if available, otherwise fall back to url
    const externalUrl = data.applyUrl || data.url || '';
    
    // Open external job link
    window.open(externalUrl, '_blank', 'noopener,noreferrer');
    
    // Show confirmation modal after a short delay
    setTimeout(() => {
      setActiveModal('apply');
    }, 1000);
  };

  const handleConfirmApplication = async () => {
    if (!profile) {
      navigate('/knowledge-base');
      return;
    }
    
    try {
      const externalUrl = data.applyUrl || data.url || '';
      const application = await createApplication({
        jobId: data.id,
        jobTitle: data.title,
        jobCompany: data.company,
        jobUrl: externalUrl,
        status: 'sent',
        notes: applicationNotes,
        appliedAt: new Date().toISOString()
      });
      addApplication(application);
      setHasApplied(true);
      toast.success('Application recorded! Track it in Applications.');
      setActiveModal(null);
      setApplicationNotes('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record application.');
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copied to clipboard!');
  };

  const handleGenerateOutreach = async (hrContact: HRProspect) => {
    if (!data) return;
    
    setSelectedHRContact(hrContact);
    setOutreachLoading(true);
    setOutreachMessage(null);
    
    try {
      const message = await generateOutreachMessage({
        job_external_id: data.id,
        job_title: data.title,
        job_company: data.company,
        hr_name: hrContact.full_name,
        hr_email: hrContact.email || hrContact.personal_email || undefined,
        hr_job_title: hrContact.job_title
      });
      
      setOutreachMessage(message);
      toast.success('Outreach message generated!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate message');
    } finally {
      setOutreachLoading(false);
    }
  };

  const handleGenerateGenericOutreach = async () => {
    if (!data) return;
    
    setSelectedHRContact(null); // No specific HR contact
    setOutreachLoading(true);
    setOutreachMessage(null);
    
    try {
      const message = await generateOutreachMessage({
        job_external_id: data.id,
        job_title: data.title,
        job_company: data.company,
        // Use actual HR name from InternSG if available, otherwise use placeholder
        hr_name: data.hrName || '[HR Name]',
        hr_email: undefined,
        hr_job_title: '[HR Title]'
      });
      
      setOutreachMessage(message);
      if (data.hrName) {
        toast.success(`Outreach message generated for ${data.hrName}!`);
      } else {
        toast.success('Generic outreach template generated! Fill in HR details after finding contact.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate message');
    } finally {
      setOutreachLoading(false);
    }
  };

  // New: unified HR contact finder - checks cache first, then searches if needed
  const handleFindHR = async () => {
    if (!data) return;
    
    setHrLoading(true);
    setHrFetched(true); // Mark that we've attempted fetch
    
    try {
      const companyDomain = `${data.company.toLowerCase().replace(/\s+/g, '')}.com`;
      
      // Step 1: Check cache first
      console.log('Checking cache for:', companyDomain);
      const cachedResult = await getCachedHRContacts(companyDomain);
      console.log('Cache result:', cachedResult);
      
      if (cachedResult.prospects && cachedResult.prospects.length > 0) {
        // Found in cache!
        setHrProspects(cachedResult.prospects);
        toast.success('HR contacts loaded from cache!');
        setHrLoading(false);
        return;
      }
      
      // Step 2: Not in cache, search external API
      console.log('Not in cache, searching external API...');
      const searchResult = await searchHRContacts({
        company_domain: companyDomain,
        fetch_count: 3
      });
      console.log('Search result:', searchResult);
      
      setHrProspects(searchResult.prospects);
      
      if (searchResult.prospects.length > 0) {
        toast.success('HR contacts found and cached!');
      } else {
        // No results found even after search - no toast needed, UI will show "No HR Contacts Found"
      }
    } catch (error) {
      console.error('Error in handleFindHR:', error);
      // Don't add "Failed to search HR prospects:" prefix again since the API already includes it
      toast.error(
        error instanceof Error 
          ? error.message
          : 'Failed to search for HR contacts'
      );
      setHrProspects([]);
    } finally {
      setHrLoading(false);
    }
  };

  const handleSearchHRContacts = async () => {
    if (!data) return;
    
    setHrLoading(true);
    try {
      const companyDomain = `${data.company.toLowerCase().replace(/\s+/g, '')}.com`;
      const result = await searchHRContacts({
        company_domain: companyDomain,
        fetch_count: 3
      });
      setHrProspects(result.prospects);
      toast.success('HR contacts found and cached!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to search for HR contacts');
      setHrProspects([]);
    } finally {
      setHrLoading(false);
    }
  };

  const handleCopyOutreachMessage = () => {
    if (!outreachMessage) return;
    
    const fullMessage = `Subject: ${outreachMessage.subject}\n\n${outreachMessage.body}`;
    navigator.clipboard.writeText(fullMessage);
    toast.success('Message copied to clipboard!');
  };

  const handleEditMaterial = (materialId: string, currentContent: string) => {
    setEditingMaterialId(materialId);
    setEditedContent(currentContent);
  };

  const handleCancelEdit = () => {
    setEditingMaterialId(null);
    setEditedContent('');
  };

  const handleSaveMaterial = async (materialId: string) => {
    if (!editedContent.trim()) {
      toast.error('Content cannot be empty');
      return;
    }

    setSavingMaterial(true);
    try {
      const { material } = await updateMaterial(materialId, editedContent);
      
      // Update materials list with the new content
      setMaterials(prev => 
        prev.map(m => m.id === materialId ? material : m)
      );
      
      setEditingMaterialId(null);
      setEditedContent('');
      toast.success('Material updated successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update material');
    } finally {
      setSavingMaterial(false);
    }
  };

  const currentScore = scoreOverride ?? data.scoreRaw ?? 0;
  const currentVerdict = (verdictOverride ?? data.epIndicator ?? 'Borderline') as CompassScore['verdict'];

  return (
    <div className="flex flex-col bg-slate-50" style={{height: 'calc(100vh - 120px)'}}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Modals */}
          <Modal
        open={activeModal === 'apply'}
        title="Confirm Application"
        description="Did you complete your application on the external site?"
        onClose={() => setActiveModal(null)}
        footer={
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmApplication}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Yes, I Applied
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            We'll track this application in your dashboard. You can add notes to help you remember details about this role.
          </p>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={applicationNotes}
              onChange={(e) => setApplicationNotes(e.target.value)}
              placeholder="e.g., Submitted cover letter, contacted recruiter..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={activeModal === 'hr'}
        title="HR Contacts"
        description={data.isInternSG 
          ? `This is a smaller company from InternSG` 
          : `Found ${hrProspects.length} HR contacts at ${data.company}`
        }
        onClose={() => {
          setActiveModal(null);
          // Don't reset hrProspects - keep them for the main page display
          setOutreachMessage(null);
          setSelectedHRContact(null);
        }}
      >
        <div className="space-y-4">
          {data.isInternSG ? (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-6">
              <div className="flex items-start gap-3">
                <svg className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-2">InternSG Company</h4>
                  <p className="text-sm text-blue-800 mb-4 leading-relaxed">
                    This position is from a smaller company listed on InternSG. HR outreach may not be available through our platform. 
                    {data.hrName && (
                      <>
                        {' '}Please search for <span className="font-semibold">{data.hrName}</span> on LinkedIn or apply directly on InternSG.
                      </>
                    )}
                  </p>
                  {data.hrName && (
                    <div className="rounded-md bg-white border border-blue-200 p-4 mb-4">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">HR Contact</p>
                      <p className="text-base text-blue-900 font-bold mb-3">{data.hrName}</p>
                      <button
                        onClick={() => {
                          const searchQuery = `site:linkedin.com/in/ ${data.hrName} ${data.company}`;
                          const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
                          window.open(googleSearchUrl, '_blank');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                        Search on LinkedIn
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-blue-900">Recommended Actions:</p>
                    <ul className="text-sm text-blue-800 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>Apply directly on InternSG using the Apply Now button</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>Check the company's website or LinkedIn page for contact information</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
          {hrLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="ml-3 text-sm text-slate-600">Searching for HR contacts...</p>
            </div>
          ) : hrProspects.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-600">No HR contacts found for this company.</p>
              <p className="text-xs text-slate-500 mt-2">Try searching on LinkedIn or the company's careers page.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hrProspects.map((prospect, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900">{prospect.full_name}</h4>
                      <p className="text-sm text-slate-600 mt-1">{prospect.job_title}</p>
                      <p className="text-xs text-slate-500 mt-1">{prospect.city}, {prospect.country}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prospect.email && (
                      <button
                        onClick={() => handleCopyEmail(prospect.email!)}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {prospect.email}
                      </button>
                    )}
                    {prospect.linkedin && (
                      <a
                        href={prospect.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
                      >
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                        </svg>
                        LinkedIn
                      </a>
                    )}
                    <button
                      onClick={() => handleGenerateOutreach(prospect)}
                      disabled={outreachLoading}
                      className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition disabled:opacity-50"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {outreachLoading && selectedHRContact?.email === prospect.email ? 'Generating...' : 'Draft Message'}
                    </button>
                  </div>
                  
                  {/* Show generated outreach message */}
                  {outreachMessage && selectedHRContact?.email === prospect.email && (
                    <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h5 className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                          Generated Outreach Message
                        </h5>
                        <button
                          onClick={handleCopyOutreachMessage}
                          className="text-xs text-purple-700 hover:text-purple-900 font-medium flex items-center gap-1"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold text-purple-700">Subject:</p>
                          <p className="text-sm text-purple-900">{outreachMessage.subject}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-purple-700">Message:</p>
                          <p className="text-sm text-purple-900 whitespace-pre-wrap">{outreachMessage.body}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>
      </Modal>

      {/* Materials Modal */}
      <Modal
        open={activeModal === 'materials'}
        title="Application Materials"
        description={`${materials.length} generated ${materials.length === 1 ? 'document' : 'documents'} for this position`}
        onClose={() => {
          setActiveModal(null);
          handleCancelEdit(); // Cancel any ongoing edits when closing modal
        }}
        fullScreen={true}
      >
        <div className="space-y-4">
          {materials.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-600">No materials generated yet.</p>
              <p className="text-xs text-slate-500 mt-2">Use the buttons on the job page to generate a resume or cover letter.</p>
            </div>
          ) : (
            materials.map((material) => {
              const viewMode = materialViewMode[material.id] || 'preview';
              const isEditing = editingMaterialId === material.id;
              
              return (
                <div key={material.id} className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
                  {/* Header Section */}
                  <div className="flex flex-col gap-3 mb-4">
                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          material.material_type === 'resume' 
                            ? 'bg-indigo-100 text-indigo-700' 
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 capitalize">
                            {material.material_type.replace('_', ' ')}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Generated {new Date(material.created_at).toLocaleDateString()} at{' '}
                            {new Date(material.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions Row - Stacked on mobile, inline on desktop */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      {!isEditing && (
                        <>
                          {/* View Mode Toggle */}
                          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 w-full sm:w-auto">
                            <button
                              onClick={() => setMaterialViewMode(prev => ({ ...prev, [material.id]: 'preview' }))}
                              className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded transition ${
                                viewMode === 'preview'
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => setMaterialViewMode(prev => ({ ...prev, [material.id]: 'raw' }))}
                              className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded transition ${
                                viewMode === 'raw'
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Raw
                            </button>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => handleEditMaterial(material.id, material.content)}
                              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200 transition"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(material.content);
                                toast.success('Content copied to clipboard!');
                              }}
                              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </button>
                          </div>
                        </>
                      )}
                      {isEditing && (
                        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                          <button
                            onClick={handleCancelEdit}
                            disabled={savingMaterial}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveMaterial(material.id)}
                            disabled={savingMaterial}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition disabled:opacity-50"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {savingMaterial ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-6 max-h-[60vh] overflow-y-auto">
                    {isEditing ? (
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full min-h-[500px] p-3 text-sm text-slate-700 font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                        placeholder="Edit your material here..."
                      />
                    ) : viewMode === 'preview' ? (
                      <div className="markdown-preview">
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            h1(props) {
                              const {node, ...rest} = props
                              return <h1 className="text-2xl font-bold mb-4 pb-2 border-b border-slate-300 text-slate-900" {...rest} />
                            },
                            h2(props) {
                              const {node, ...rest} = props
                              return <h2 className="text-xl font-semibold mt-6 mb-3 text-slate-900" {...rest} />
                            },
                            h3(props) {
                              const {node, ...rest} = props
                              return <h3 className="text-lg font-semibold mt-4 mb-2 text-slate-800" {...rest} />
                            },
                            p(props) {
                              const {node, ...rest} = props
                              return <p className="mb-4 leading-relaxed text-slate-700 whitespace-pre-wrap break-words" {...rest} />
                            },
                            strong(props) {
                              const {node, ...rest} = props
                              return <strong className="font-bold text-slate-900" {...rest} />
                            },
                            em(props) {
                              const {node, ...rest} = props
                              return <em className="italic text-slate-700" {...rest} />
                            },
                            mark(props) {
                              const {node, ...rest} = props
                              return <mark className="bg-yellow-200 px-0.5 rounded" {...rest} />
                            },
                            ul(props) {
                              const {node, ...rest} = props
                              return <ul className="list-disc ml-6 my-4 space-y-2" {...rest} />
                            },
                            ol(props) {
                              const {node, ...rest} = props
                              return <ol className="list-decimal ml-6 my-4 space-y-2" {...rest} />
                            },
                            li(props) {
                              const {node, ...rest} = props
                              return <li className="text-slate-700 leading-relaxed" {...rest} />
                            },
                            a(props) {
                              const {node, ...rest} = props
                              return <a className="text-blue-600 hover:underline break-words" {...rest} />
                            },
                            code(props) {
                              const {node, ...rest} = props
                              return <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono text-slate-800" {...rest} />
                            },
                            blockquote(props) {
                              const {node, ...rest} = props
                              return <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-4" {...rest} />
                            },
                            hr(props) {
                              const {node, ...rest} = props
                              return <hr className="my-6 border-slate-300" {...rest} />
                            },
                          }}
                        >
                          {material.content.replace(/^```markdown\n?/, '').replace(/\n?```$/, '')}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {material.content}
                      </pre>
                    )}
                  </div>
                  
                  {material.metadata && !isEditing && (
                    <div className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold">Tone:</span> {material.metadata.tone || 'Professional'}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      <Modal
        open={activeModal === 'assess'}
        title="Assess Fit with LLM"
        description="Get detailed analysis of how well you match this role"
        onClose={() => setActiveModal(null)}
        footer={
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleConfirmAssess(false)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Run Assessment
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will use AI to analyze your profile against the job requirements and provide detailed recommendations. The analysis typically takes 10-15 seconds.
          </p>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">What you'll get:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Updated COMPASS score based on this specific role</li>
              <li>• Detailed breakdown across 6 dimensions</li>
              <li>• Personalized recommendations to improve your match</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Detailed Assessment Report Modal */}
      <Modal
        open={activeModal === 'report'}
        title="Job Fit Assessment Report"
        description={assessmentReport ? `Analysis for ${assessmentReport.role_title} at ${data.company}` : ''}
        onClose={() => setActiveModal(null)}
        footer={
          <div className="flex gap-3 justify-between w-full">
            <div className="flex items-center gap-2">
              {assessmentReport?.from_cache && (
                <span className="text-xs text-slate-500 italic">
                  Loaded from previous analysis
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleConfirmAssess(true)}
                disabled={isAnalyzing}
                className="rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={isAnalyzing}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {isAnalyzing && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-brand-200 border-t-brand-600 mb-4"></div>
              <p className="text-sm font-medium text-slate-900">Regenerating assessment...</p>
              <p className="text-xs text-slate-500 mt-1">This may take a few moments</p>
            </div>
          </div>
        )}
        {assessmentReport && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Overall Score & Decision */}
            <div className="rounded-lg bg-gradient-to-br from-brand-50 to-blue-50 border border-brand-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {assessmentReport.overall_score}/100
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">Overall Match Score</p>
                </div>
                <div className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
                  assessmentReport.decision === 'strong_match' ? 'bg-green-100 text-green-800' :
                  assessmentReport.decision === 'possible_match' ? 'bg-yellow-100 text-yellow-800' :
                  assessmentReport.decision === 'weak_match' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {assessmentReport.decision.replace('_', ' ').toUpperCase()}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-brand-200">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">Must-Have Coverage</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-white rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-brand-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${assessmentReport.must_have_coverage * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {Math.round(assessmentReport.must_have_coverage * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Subscores Grid */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Detailed Subscores</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(assessmentReport.subscores).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-600 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-lg font-bold text-brand-600">{value}/5</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-brand-600 h-full rounded-full transition-all"
                        style={{ width: `${(value / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence Section */}
            {(assessmentReport.evidence.matched_must_haves.length > 0 || 
              assessmentReport.evidence.matched_nice_to_haves.length > 0) && (
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  ✅ Strengths & Matches
                </h4>
                <div className="space-y-4">
                  {assessmentReport.evidence.matched_must_haves.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <h5 className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2">
                        Matched Must-Haves
                      </h5>
                      <ul className="space-y-1">
                        {assessmentReport.evidence.matched_must_haves.map((item, idx) => (
                          <li key={idx} className="text-sm text-green-900 flex items-start gap-2">
                            <span className="text-green-600 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {assessmentReport.evidence.matched_nice_to_haves.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <h5 className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">
                        Matched Nice-to-Haves
                      </h5>
                      <ul className="space-y-1">
                        {assessmentReport.evidence.matched_nice_to_haves.map((item, idx) => (
                          <li key={idx} className="text-sm text-blue-900 flex items-start gap-2">
                            <span className="text-blue-600 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {assessmentReport.evidence.impact_highlights.length > 0 && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                      <h5 className="text-xs font-semibold text-purple-800 uppercase tracking-wide mb-2">
                        Impact Highlights
                      </h5>
                      <ul className="space-y-1">
                        {assessmentReport.evidence.impact_highlights.map((item, idx) => (
                          <li key={idx} className="text-sm text-purple-900 flex items-start gap-2">
                            <span className="text-purple-600 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {assessmentReport.evidence.tools_stack_matched.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <h5 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
                        Tools & Tech Stack
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {assessmentReport.evidence.tools_stack_matched.map((tool, idx) => (
                          <span key={idx} className="inline-block rounded-full bg-white border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Gaps Section */}
            {(assessmentReport.gaps.missing_must_haves.length > 0 || 
              assessmentReport.gaps.risks.length > 0) && (
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  ⚠️ Gaps & Areas for Improvement
                </h4>
                <div className="space-y-4">
                  {assessmentReport.gaps.missing_must_haves.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <h5 className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">
                        Missing Must-Haves
                      </h5>
                      <ul className="space-y-1">
                        {assessmentReport.gaps.missing_must_haves.map((item, idx) => (
                          <li key={idx} className="text-sm text-red-900 flex items-start gap-2">
                            <span className="text-red-600 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {assessmentReport.gaps.risks.length > 0 && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                      <h5 className="text-xs font-semibold text-orange-800 uppercase tracking-wide mb-2">
                        Potential Risks
                      </h5>
                      <ul className="space-y-1">
                        {assessmentReport.gaps.risks.map((risk, idx) => (
                          <li key={idx} className="text-sm text-orange-900 flex items-start gap-2">
                            <span className="text-orange-600 mt-0.5">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {assessmentReport.recommendations_to_candidate.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Recommendations for You
                </h4>
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <ul className="space-y-2">
                    {assessmentReport.recommendations_to_candidate.map((rec, idx) => (
                      <li key={idx} className="text-sm text-slate-700 flex items-start gap-3">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Interview Questions */}
            {assessmentReport.questions_for_interview.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Suggested Interview Questions
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500 mb-3">Questions the hiring manager might ask based on your profile:</p>
                  <ul className="space-y-2">
                    {assessmentReport.questions_for_interview.map((question, idx) => (
                      <li key={idx} className="text-sm text-slate-700 flex items-start gap-3 pl-4 border-l-2 border-brand-400">
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Notes */}
            {assessmentReport.notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Additional Notes</h5>
                <p className="text-sm text-slate-700">{assessmentReport.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="space-y-6">
        {/* Job Header with collapsible JD */}
        <JobHeader
          title={data.title}
          company={data.company}
          location={data.location}
          tags={[data.industry]}
          salary={data.salaryMinSGD && data.salaryMaxSGD ? `SGD ${data.salaryMinSGD.toLocaleString()} - ${data.salaryMaxSGD.toLocaleString()}` : undefined}
          postedDate={data.createdAt}
          isInternSG={data.isInternSG}
          description={data.description}
        />

        {/* Fit Score Hero - Shows below job header when analyzing or when assessment is available */}
        {(isAnalyzing || assessmentReport) && (
          <FitScoreHero
            score={assessmentReport?.overall_score || 0}
            decision={assessmentReport?.decision || 'pending'}
            isAnalyzing={isAnalyzing}
          />
        )}

        {/* Categorized Assessment Details - Show matches and gaps if available */}
        {assessmentReport && (
          <CategorizedFitAnalysis
            matches={{
              must_haves: assessmentReport.evidence.matched_must_haves || [],
              nice_to_haves: assessmentReport.evidence.matched_nice_to_haves || []
            }}
            gaps={{
              missing_must_haves: assessmentReport.gaps.missing_must_haves || [],
              risks: assessmentReport.gaps.risks || []
            }}
            onViewFullReport={() => setActiveModal('report')}
          />
        )}

        {/* Generated Materials */}
        <GeneratedMaterials
          materials={materials}
          onGenerateResume={handleGenerateResume}
          onGenerateCoverLetter={handleGenerateCoverLetter}
          onViewMaterials={handleViewMaterials}
          isGeneratingResume={generatingResume}
          isGeneratingCoverLetter={generatingCoverLetter}
        />

        {/* HR Contact Section */}
        <HRContactSection
          companyName={data.company}
          isInternSG={data.isInternSG}
          hrName={data.hrName}
          hrLoading={hrLoading}
          hrProspects={hrProspects}
          hrFetched={hrFetched}
          outreachLoading={outreachLoading}
          outreachMessage={outreachMessage}
          selectedHRContact={selectedHRContact}
          onFindHR={handleFindHR}
          onSearchLinkedIn={() => {
            const searchQuery = data.hrName
              ? `site:linkedin.com/in/ "${data.hrName}" ${data.company} singapore`
              : `site:linkedin.com/in/ ${data.company} (hr OR "hiring manager" OR "talent acquisition" OR recruiter) singapore`;
            const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
            window.open(googleSearchUrl, '_blank');
          }}
          onCopyEmail={handleCopyEmail}
          onGenerateOutreach={handleGenerateOutreach}
          onGenerateGenericOutreach={handleGenerateGenericOutreach}
          onCopyOutreachMessage={handleCopyOutreachMessage}
          onViewAllContacts={() => setActiveModal('hr')}
        />

        {/* Apply Now Button */}
        <ActionButtons
          hasApplied={hasApplied}
          onApply={handleOpenExternalLink}
        />
      </div>
        </div>
      </div>
    </div>
  );
}
