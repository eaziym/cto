import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { StreamProgress } from './useResumeStream';

// Use the unified StreamProgress type from useResumeStream
export type GitHubStreamStatus = StreamProgress['status'];
export type GitHubStreamProgress = StreamProgress;

// Helper function to extract partial fields from incomplete JSON
function extractPartialFields(jsonString: string): {
  fields_found: number;
  data: {
    name?: string;
    email?: string;
    location?: string;
    bio?: string;
    skills_count?: number;
    repos_count?: number;
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

  // Try to extract summary/bio
  const summaryMatch = jsonString.match(/"summary"\s*:\s*"([^"]+)"/);
  if (summaryMatch) {
    data.bio = summaryMatch[1];
    fieldsFound++;
  }

  // Try to count skills
  const skillsMatch = jsonString.match(/"skills"\s*:\s*\[([\s\S]*?)\]/);
  if (skillsMatch) {
    const skillsStr = skillsMatch[1];
    const skillCount = (skillsStr.match(/"/g) || []).length / 2; // Count pairs of quotes
    data.skills_count = Math.floor(skillCount);
    fieldsFound++;
  }

  // Try to count projects - handle both complete and incomplete arrays
  // Look for "projects": [ ... anything after this point
  const projectsStartMatch = jsonString.match(/"projects"\s*:\s*\[/);
  if (projectsStartMatch) {
    const projectsStartIndex = jsonString.indexOf('"projects"');
    const afterProjects = jsonString.substring(projectsStartIndex);
    
    // Count how many project objects we have by counting "name" fields within projects array
    // This works even if the array isn't closed yet
    const projectCount = (afterProjects.match(/"name"\s*:\s*"/g) || []).length;
    if (projectCount > 0) {
      data.repos_count = projectCount;
      fieldsFound++;
    }
  }

  // No summary message - let the sections below show the actual data
  return { fields_found: fieldsFound, data };
}

interface UseGitHubStreamOptions {
  onComplete?: (profile: any, metadata: any) => void;
  onError?: (error: string) => void;
}

export function useGitHubStream(options?: UseGitHubStreamOptions) {
  const [progress, setProgress] = useState<GitHubStreamProgress>({ status: 'idle' });
  const [isStreaming, setIsStreaming] = useState(false);
  const streamedTextRef = useRef<string>('');
  const lastUpdateRef = useRef<number>(0);

  const parseAndStream = async (username: string, sourceId: string) => {
    setIsStreaming(true);
    setProgress({ status: 'fetching', message: `Fetching GitHub profile for ${username}...` });
    streamedTextRef.current = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-github-stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, sourceId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'GitHub parsing failed');
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
                  status: 'parsing',
                  streamedText: streamedTextRef.current,
                  fields_found: partialData.fields_found,
                  partial_data: partialData.data,
                }));
              }
            } else if (currentEvent === 'complete') {
              setProgress({
                status: 'complete',
                profile: data.profile,
                message: 'GitHub profile parsed successfully!',
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
