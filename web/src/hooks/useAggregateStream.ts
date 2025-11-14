import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type AggregateStatus = 'idle' | 'fetching' | 'aggregating' | 'complete' | 'error';

export interface AggregateProgress {
  status: AggregateStatus;
  streamedText: string;
  sourcesCount?: number;
  error?: string;
}

export function useAggregateStream() {
  const [progress, setProgress] = useState<AggregateProgress>({
    status: 'idle',
    streamedText: '',
  });
  const [isAggregating, setIsAggregating] = useState(false);
  const streamedTextRef = useRef('');
  const lastUpdateRef = useRef(0);

  const reset = useCallback(() => {
    setProgress({ status: 'idle', streamedText: '' });
    setIsAggregating(false);
    streamedTextRef.current = '';
    lastUpdateRef.current = 0;
  }, []);

  const aggregate = useCallback(async (onComplete?: (profile: any) => void, onError?: (error: string) => void) => {
    setIsAggregating(true);
    streamedTextRef.current = '';
    lastUpdateRef.current = 0;
    
    setProgress({ status: 'fetching', streamedText: '' });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aggregate-profile-stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Aggregation failed');
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
              setProgress(prev => ({ 
                ...prev, 
                status: data.status,
                sourcesCount: data.sources_count 
              }));
            } else if (currentEvent === 'token') {
              streamedTextRef.current += data.token;
              
              // Throttle updates to 50ms
              const now = Date.now();
              if (now - lastUpdateRef.current >= 50) {
                setProgress(prev => ({
                  ...prev,
                  status: 'aggregating',
                  streamedText: streamedTextRef.current,
                }));
                lastUpdateRef.current = now;
              }
            } else if (currentEvent === 'complete') {
              console.log('[AGGREGATE STREAM] Complete event received:', data);
              console.log('[AGGREGATE STREAM] Profile type:', typeof data.profile, Array.isArray(data.profile) ? 'ARRAY' : 'OBJECT');
              console.log('[AGGREGATE STREAM] Profile name:', data.profile?.name);
              setProgress(prev => ({
                ...prev,
                status: 'complete',
                streamedText: streamedTextRef.current,
              }));
              setIsAggregating(false);
              onComplete?.(data.profile);
            } else if (currentEvent === 'error') {
              setProgress(prev => ({
                ...prev,
                status: 'error',
                error: data.error,
              }));
              setIsAggregating(false);
              onError?.(data.error);
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', line, parseError);
            // Continue processing other lines
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setProgress(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      setIsAggregating(false);
      onError?.(errorMessage);
    }
  }, []);

  return {
    progress,
    isAggregating,
    aggregate,
    reset,
  };
}
