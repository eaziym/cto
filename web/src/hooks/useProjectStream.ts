import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { StreamProgress } from './useResumeStream';

// Use the unified StreamProgress type from useResumeStream
export type ProjectStreamStatus = StreamProgress['status'];
export type ProjectStreamProgress = StreamProgress;

// Helper function to extract partial fields from incomplete JSON
function extractPartialFields(jsonString: string): {
  fields_found: number;
  data: {
    projects_count?: number;
    skills_count?: number;
  };
} {
  const data: any = {};
  let fieldsFound = 0;

  // Try to count projects
  const projectsMatch = jsonString.match(/"projects"\s*:\s*\[([\s\S]*?)$/);
  if (projectsMatch) {
    const projectsStr = projectsMatch[1];
    const projectCount = (projectsStr.match(/"name"\s*:/g) || []).length;
    data.projects_count = projectCount;
    fieldsFound++;
  }

  // Try to count skills
  const skillsMatch = jsonString.match(/"skills"\s*:\s*\[([\s\S]*?)\]/);
  if (skillsMatch) {
    const skillsStr = skillsMatch[1];
    const skillCount = (skillsStr.match(/"/g) || []).length / 2;
    data.skills_count = Math.floor(skillCount);
    fieldsFound++;
  }

  // No summary message - let the sections below show the actual data
  return { fields_found: fieldsFound, data };
}

interface UseProjectStreamOptions {
  onComplete?: (profile: any, metadata: any) => void;
  onError?: (error: string) => void;
}

export function useProjectStream(options?: UseProjectStreamOptions) {
  const [progress, setProgress] = useState<ProjectStreamProgress>({ status: 'idle' });
  const [isStreaming, setIsStreaming] = useState(false);
  const streamedTextRef = useRef<string>('');
  const lastUpdateRef = useRef<number>(0);

  const uploadAndStream = async (file: File, userId: string, sourceId: string) => {
    setIsStreaming(true);
    setProgress({ status: 'uploading', message: 'Uploading project document...' });
    streamedTextRef.current = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const jwtKey = import.meta.env.VITE_SUPABASE_JWT_KEY;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceId', session?.access_token ? sourceId : `test-${Date.now()}`);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-project-stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || jwtKey}`,
            'apikey': anonKey,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'status') {
                setProgress({
                  status: data.status,
                  message: data.message
                });
              } else if (currentEvent === 'token') {
                streamedTextRef.current += data.token;
                
                // Try to extract partial data from incomplete JSON
                const partialData = extractPartialFields(streamedTextRef.current);
                
                // Throttle updates to 50ms
                const now = Date.now();
                const timeSinceLastUpdate = now - lastUpdateRef.current;
                if (timeSinceLastUpdate >= 50) {
                  lastUpdateRef.current = now;
                  const currentText = streamedTextRef.current;
                  setProgress(prev => ({
                    ...prev,
                    status: 'parsing',
                    streamedText: currentText,
                    fields_found: partialData.fields_found,
                    partial_data: partialData.data,
                  }));
                }
              } else if (currentEvent === 'complete') {
                setProgress({
                  status: 'complete',
                  profile: data.profile,
                  message: 'Project document parsed successfully!',
                  streamedText: streamedTextRef.current
                });
                setIsStreaming(false);
                options?.onComplete?.(data.profile, data.metadata);
              } else if (currentEvent === 'error') {
                setProgress({
                  status: 'error',
                  error: data.error,
                  message: data.error
                });
                setIsStreaming(false);
                options?.onError?.(data.error);
              }
            } catch (error) {
              console.error('Failed to parse SSE event:', error);
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProgress({
        status: 'error',
        error: message,
        message
      });
      setIsStreaming(false);
      options?.onError?.(message);
    }
  };

  const reset = () => {
    setProgress({ status: 'idle' });
    setIsStreaming(false);
    streamedTextRef.current = '';
  };

  return {
    progress,
    isStreaming,
    uploadAndStream,
    reset
  };
}
