import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Supabase Edge Functions are automatically available at /functions/v1/[function-name]
const getEdgeFunctionUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is not defined');
  }
  return `${supabaseUrl}/functions/v1/parse-resume-stream`;
};

export interface StreamProgress {
  status: 'idle' | 'uploading' | 'creating_assistant' | 'parsing' | 'fetching' | 'scraping' | 'complete' | 'error';
  message?: string;
  fields_found?: number;
  partial_data?: {
    name?: string;
    email?: string;
    telephone?: string;
    skills_count?: number;
    experience_count?: number;
    education_count?: number;
  };
  profile?: any;
  error?: string;
  streamedText?: string; // Accumulate tokens
}

interface UseResumeStreamOptions {
  onComplete?: (profile: any, metadata: any) => void;
  onError?: (error: string) => void;
}

export function useResumeStream(options?: UseResumeStreamOptions) {
  const [progress, setProgress] = useState<StreamProgress>({ status: 'idle' });
  const [isStreaming, setIsStreaming] = useState(false);
  const streamedTextRef = useRef<string>('');
  const lastUpdateRef = useRef<number>(0);

  const uploadAndStream = async (file: File, userId: string, sourceId: string) => {
    setIsStreaming(true);
    setProgress({ status: 'uploading', message: 'Uploading resume...' });
    streamedTextRef.current = ''; // Reset

    try {
      // Get Supabase session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      // Get keys
      const jwtKey = import.meta.env.VITE_SUPABASE_JWT_KEY;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const formData = new FormData();
      formData.append('file', file);
      // Use test- prefix for sourceId when not authenticated
      formData.append('sourceId', session?.access_token ? sourceId : `test-${Date.now()}`);

      const response = await fetch(getEdgeFunctionUrl(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || jwtKey}`,
          'apikey': anonKey,
        },
        body: formData,
      });

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
                // Accumulate tokens in ref (fast, no re-render)
                streamedTextRef.current += data.token;
                
                // Throttle UI updates to every 50ms
                const now = Date.now();
                const timeSinceLastUpdate = now - lastUpdateRef.current;
                if (timeSinceLastUpdate >= 50) {
                  lastUpdateRef.current = now;
                  const currentText = streamedTextRef.current;
                  setProgress(prev => ({
                    ...prev,
                    status: 'parsing' as const,
                    streamedText: currentText,
                    message: 'Streaming response...'
                  }));
                }
              } else if (currentEvent === 'progress') {
                setProgress(prev => ({
                  ...prev,
                  status: 'parsing',
                  fields_found: data.fields_found,
                  partial_data: data.partial_data,
                }));
              } else if (currentEvent === 'complete') {
                // Final update with complete streamed text
                setProgress({
                  status: 'complete',
                  profile: data.profile,
                  message: 'Resume parsed successfully!',
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
