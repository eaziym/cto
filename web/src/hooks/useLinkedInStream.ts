import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { StreamProgress } from './useResumeStream';

// Use the unified StreamProgress type from useResumeStream
export type LinkedInStreamStatus = StreamProgress['status'];
export type LinkedInStreamProgress = StreamProgress;

// Helper function to extract partial fields from incomplete JSON
function extractPartialFields(jsonString: string): {
  fields_found: number;
  data: {
    name?: string;
    email?: string;
    location?: string;
    headline?: string;
    experience_count?: number;
    education_count?: number;
    skills_count?: number;
  };
} {
  const data: any = {};
  let fieldsFound = 0;

  // Try to extract name
  const nameMatch = jsonString.match(/"name"\s*:\s*"([^"]+)"/);
  if (nameMatch) {
    data.name = nameMatch[1];
    fieldsFound++;
  }

  // Try to extract email
  const emailMatch = jsonString.match(/"email"\s*:\s*"([^"]+)"/);
  if (emailMatch) {
    data.email = emailMatch[1];
    fieldsFound++;
  }

  // Try to extract location
  const locationMatch = jsonString.match(/"location"\s*:\s*"([^"]+)"/);
  if (locationMatch) {
    data.location = locationMatch[1];
    fieldsFound++;
  }

  // Try to extract headline/summary
  const headlineMatch = jsonString.match(/"summary"\s*:\s*"([^"]+)"/);
  if (headlineMatch) {
    data.headline = headlineMatch[1];
    fieldsFound++;
  }

  // Try to count experience
  const experienceMatch = jsonString.match(/"experience"\s*:\s*\[([\s\S]*?)$/);
  if (experienceMatch) {
    const expStr = experienceMatch[1];
    const expCount = (expStr.match(/"company"\s*:/g) || []).length;
    data.experience_count = expCount;
    fieldsFound++;
  }

  // Try to count education
  const educationMatch = jsonString.match(/"education"\s*:\s*\[([\s\S]*?)$/);
  if (educationMatch) {
    const eduStr = educationMatch[1];
    const eduCount = (eduStr.match(/"institution"\s*:/g) || []).length;
    data.education_count = eduCount;
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

interface UseLinkedInStreamOptions {
  onComplete?: (profile: any, metadata: any, rawData?: any) => void;
  onError?: (error: string) => void;
}

export function useLinkedInStream(options?: UseLinkedInStreamOptions) {
  const [progress, setProgress] = useState<LinkedInStreamProgress>({ status: 'idle' });
  const [isStreaming, setIsStreaming] = useState(false);
  const streamedTextRef = useRef<string>('');
  const lastUpdateRef = useRef<number>(0);

  const parseAndStream = async (url: string, sourceId: string) => {
    setIsStreaming(true);
    setProgress({ status: 'fetching', message: 'Fetching LinkedIn profile...' });
    streamedTextRef.current = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-linkedin-stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, sourceId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'LinkedIn parsing failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

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
            continue;
          }
          
          if (!line.startsWith('data: ')) continue;

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
              if (now - lastUpdateRef.current >= 50) {
                lastUpdateRef.current = now;
                setProgress(prev => ({
                  ...prev,
                  // Keep the current status (could be 'fetching' or 'parsing')
                  // Only change to 'parsing' if we were in 'fetching' state
                  status: prev.status === 'fetching' ? 'parsing' : prev.status,
                  streamedText: streamedTextRef.current,
                  fields_found: partialData.fields_found,
                  partial_data: partialData.data,
                }));
              }
            } else if (currentEvent === 'complete') {
              setProgress({
                status: 'complete',
                profile: data.profile,
                message: 'LinkedIn profile parsed successfully!',
                streamedText: streamedTextRef.current
              });
              setIsStreaming(false);
              options?.onComplete?.(data.profile, data.metadata, data.rawData);
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
    parseAndStream,
    reset
  };
}
