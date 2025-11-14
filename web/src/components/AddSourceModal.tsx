import { useState } from 'react';
import { FileText, Linkedin, Github, Globe, FolderOpen } from 'lucide-react';
import {
  uploadKnowledgeDocument,
  uploadProjectDocument,
  addLinkedInProfile,
  addGitHubProfile,
  addWebsite,
  addManualText,
} from '../api/client';
import { supabase } from '../lib/supabase';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  onStartStreaming?: (sourceId: string, file: File, userId: string) => void;
  onStartGitHubStreaming?: (sourceId: string, username: string) => void;
  onStartLinkedInStreaming?: (sourceId: string, url: string) => void;
  onStartProjectStreaming?: (sourceId: string, file: File, userId: string) => void;
}

function AddSourceModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  onStartStreaming,
  onStartGitHubStreaming,
  onStartLinkedInStreaming,
  onStartProjectStreaming,
}: AddSourceModalProps): JSX.Element | null {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File, type: 'resume' | 'project') => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    // For testing: use test mode if not authenticated
    const isTestMode = !user;
    const userId = isTestMode ? 'test-user-123' : user.id;
    let sourceId = isTestMode ? `test-${Date.now()}` : '';

    if (!isTestMode) {
      // Create pending knowledge source first (only for authenticated users)
      const { data: source, error: createError } = await supabase
        .from('knowledge_sources')
        .insert({
          user_id: user.id,
          source_type: type === 'resume' ? 'resume' : 'project_document',
          source_identifier: file.name,
          processing_status: 'processing',
          parsed_data: {},
          metadata: {
            fileName: file.name,
            fileSize: file.size,
          },
        })
        .select()
        .single();

      if (createError) throw createError;
      if (!source) throw new Error('Failed to create source');
      
      sourceId = source.id;
    }

    // Track the source being streamed FIRST
    if (type === 'resume') {
      onStartStreaming?.(sourceId, file, userId);
    } else {
      onStartProjectStreaming?.(sourceId, file, userId);
    }
    
    // Refresh sources list so the new source appears
    onSuccess();
    
    // Close modal immediately
    onClose();
  };

  const handleSubmit = async (value: string, type: 'linkedin' | 'github' | 'website' | 'text') => {
    if (!value.trim()) return;

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (type === 'linkedin' && onStartLinkedInStreaming && user) {
        // Create pending source for LinkedIn
        const { data: source, error: createError } = await supabase
          .from('knowledge_sources')
          .insert({
            user_id: user.id,
            source_type: 'linkedin',
            source_identifier: value,
            processing_status: 'processing',
            parsed_data: {},
          })
          .select()
          .single();

        if (createError) throw createError;
        if (!source) throw new Error('Failed to create source');
        
        // Start LinkedIn streaming
        onStartLinkedInStreaming(source.id, value);
        onSuccess();
        onClose();
      } else if (type === 'github' && onStartGitHubStreaming && user) {
        // Extract username from URL or use as-is
        let username = value.trim();
        if (username.includes('github.com/')) {
          username = username.split('github.com/')[1].split('/')[0];
        }
        username = username.replace(/^@/, '');
        
        // Create pending source for GitHub
        const { data: source, error: createError } = await supabase
          .from('knowledge_sources')
          .insert({
            user_id: user.id,
            source_type: 'github',
            source_identifier: username,
            processing_status: 'processing',
            parsed_data: {},
          })
          .select()
          .single();

        if (createError) throw createError;
        if (!source) throw new Error('Failed to create source');
        
        // Start GitHub streaming
        onStartGitHubStreaming(source.id, username);
        onSuccess();
        onClose();
      } else {
        // Fallback to non-streaming for website and manual text
        switch (type) {
          case 'linkedin':
            await addLinkedInProfile(value);
            break;
          case 'github':
            await addGitHubProfile(value);
            break;
          case 'website':
            await addWebsite(value);
            break;
          case 'text':
            await addManualText(value);
            break;
        }
        onSuccess();
        onClose();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to add ${type}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 p-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Add New Source</h3>
            <p className="mt-2 text-gray-600">
              Import your profile from multiple sources to get better recommendations
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* File Upload */}
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
              <div className="mb-3 flex items-center space-x-3">
                <div className="text-blue-600">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Upload Resume/CV</h3>
                  <p className="text-sm text-gray-500">PDF or DOCX format</p>
                </div>
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file, 'resume');
                      e.target.value = '';
                    }
                  }}
                  disabled={isProcessing}
                  className="hidden"
                />
                <div className="cursor-pointer rounded-lg bg-blue-50 py-3 text-center text-sm font-medium text-blue-600 transition hover:bg-blue-100">
                  {isProcessing ? 'Uploading...' : 'Choose File'}
                </div>
              </label>
            </div>

            {/* Project Document Upload */}
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-purple-400">
              <div className="mb-3 flex items-center space-x-3">
                <div className="text-purple-600">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Upload Project Document</h3>
                  <p className="text-sm text-gray-500">Project docs, proposals, reports</p>
                </div>
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file, 'project');
                      e.target.value = '';
                    }
                  }}
                  disabled={isProcessing}
                  className="hidden"
                />
                <div className="cursor-pointer rounded-lg bg-purple-50 py-3 text-center text-sm font-medium text-purple-600 transition hover:bg-purple-100">
                  {isProcessing ? 'Uploading...' : 'Choose File'}
                </div>
              </label>
            </div>

            {/* LinkedIn */}
            <AddSourceCard
              icon={<Linkedin className="h-6 w-6" />}
              title="LinkedIn Profile"
              description="Enter your profile URL"
              placeholder="https://linkedin.com/in/yourname"
              buttonText="Add LinkedIn"
              onSubmit={(value) => handleSubmit(value, 'linkedin')}
              disabled={isProcessing}
            />

            {/* GitHub */}
            <AddSourceCard
              icon={<Github className="h-6 w-6" />}
              title="GitHub Profile"
              description="Username or profile URL"
              placeholder="github.com/username or just username"
              buttonText="Add GitHub"
              onSubmit={(value) => handleSubmit(value, 'github')}
              disabled={isProcessing}
            />

            {/* Website */}
            <AddSourceCard
              icon={<Globe className="h-6 w-6" />}
              title="Personal Website"
              description="Portfolio, blog, or project page"
              placeholder="https://yourwebsite.com"
              buttonText="Add Website"
              onSubmit={(value) => handleSubmit(value, 'website')}
              disabled={isProcessing}
            />

            {/* Manual Text */}
            <div className="md:col-span-2">
              <AddSourceTextArea
                icon={<FileText className="h-6 w-6" />}
                title="Additional Context"
                description="Add any other relevant information"
                placeholder="Tell us about skills, projects, achievements not captured elsewhere..."
                buttonText="Add Context"
                onSubmit={(value) => handleSubmit(value, 'text')}
                disabled={isProcessing}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSourceCard({
  icon,
  title,
  description,
  placeholder,
  buttonText,
  onSubmit,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  buttonText: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
      <div className="mb-3 flex items-center space-x-3">
        <div className="text-blue-600">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex space-x-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !disabled && value.trim() && handleSubmit()}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabled ? 'Adding...' : buttonText}
        </button>
      </div>
    </div>
  );
}

function AddSourceTextArea({
  icon,
  title,
  description,
  placeholder,
  buttonText,
  onSubmit,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  buttonText: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 transition hover:border-blue-400">
      <div className="mb-3 flex items-center space-x-3">
        <div className="text-blue-600">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {disabled ? 'Adding...' : buttonText}
      </button>
    </div>
  );
}

export default AddSourceModal;