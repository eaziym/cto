# Streaming Knowledge Source Parsers

This directory contains Supabase Edge Functions that provide real-time streaming parsing for various knowledge sources.

## Available Streaming Functions

### 1. `parse-resume-stream`
Streams PDF resume parsing with real-time token updates.

**Endpoint**: `POST /functions/v1/parse-resume-stream`

**Input**: 
- FormData with `file` (PDF resume) and `sourceId`

**Events**:
- `status`: Upload/parsing status updates
- `token`: Individual tokens from LLM response
- `complete`: Final parsed profile data
- `error`: Error messages

**Usage**:
```typescript
import { useResumeStream } from '../hooks/useResumeStream';

const { progress, isStreaming, uploadAndStream } = useResumeStream({
  onComplete: (profile, metadata) => {
    console.log('Resume parsed:', profile);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Upload and stream
uploadAndStream(file, userId, sourceId);
```

---

### 2. `parse-github-stream`
Streams GitHub profile analysis with repository data.

**Endpoint**: `POST /functions/v1/parse-github-stream`

**Input**: 
- JSON: `{ username, sourceId }`

**Events**:
- `status`: Fetching/parsing status
- `token`: Incremental LLM response tokens
- `complete`: Structured GitHub profile data
- `error`: Error messages

**Usage**:
```typescript
import { useGitHubStream } from '../hooks/useGitHubStream';

const { progress, isStreaming, parseAndStream } = useGitHubStream({
  onComplete: (profile, metadata) => {
    console.log('GitHub profile:', profile);
    console.log('Repos analyzed:', metadata.repoCount);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Parse GitHub profile
parseAndStream(username, sourceId);
```

**Environment Variables Required**:
- `GITHUB_PERSONAL_TOKEN` (optional, for higher rate limits)

---

### 3. `parse-linkedin-stream`
Streams LinkedIn profile scraping and parsing.

**Endpoint**: `POST /functions/v1/parse-linkedin-stream`

**Input**: 
- JSON: `{ url, sourceId }`

**Events**:
- `status`: Scraping/parsing status
- `token`: LLM response tokens
- `complete`: Structured LinkedIn data + raw scrape data
- `error`: Error messages

**Usage**:
```typescript
import { useLinkedInStream } from '../hooks/useLinkedInStream';

const { progress, isStreaming, parseAndStream } = useLinkedInStream({
  onComplete: (profile, metadata, rawData) => {
    console.log('LinkedIn profile:', profile);
    console.log('Raw data:', rawData); // Original Apify response
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Parse LinkedIn profile
parseAndStream(linkedInUrl, sourceId);
```

**Environment Variables Required**:
- `APIFY_API_TOKEN` (required for LinkedIn scraping)

---

### 4. `parse-project-stream`
Streams project document (PDF) parsing with page-by-page progress.

**Endpoint**: `POST /functions/v1/parse-project-stream`

**Input**: 
- FormData with `file` (PDF document) and `sourceId`

**Events**:
- `status`: Upload/extraction progress (includes page count)
- `token`: LLM response tokens
- `complete`: Structured project data
- `error`: Error messages

**Usage**:
```typescript
import { useProjectStream } from '../hooks/useProjectStream';

const { progress, isStreaming, uploadAndStream } = useProjectStream({
  onComplete: (profile, metadata) => {
    console.log('Projects:', profile.projects);
    console.log('Pages:', metadata.pageCount);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Upload and stream project document
uploadAndStream(file, userId, sourceId);
```

---

## Common Features

All streaming functions share:

1. **Server-Sent Events (SSE)** for real-time updates
2. **Token-level streaming** from OpenAI LLM
3. **Incremental UI updates** (throttled to 50ms for performance)
4. **Error handling** with detailed error messages
5. **Authentication** via Supabase JWT tokens

## Response Format

All functions return structured JSON matching this pattern:

```typescript
{
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  about?: string;
  skills: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  experience: Array<{
    job_title: string;
    company: string;
    duration: string;
    description: string;
    // ... more fields
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field_of_study: string;
    // ... more fields
  }>;
  projects?: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string;
    // ... more fields
  }>;
  // Source-specific fields...
}
```

## Deployment

Deploy all functions using:

```bash
# Deploy all at once
supabase functions deploy

# Or individually
supabase functions deploy parse-resume-stream
supabase functions deploy parse-github-stream
supabase functions deploy parse-linkedin-stream
supabase functions deploy parse-project-stream
```

## Environment Variables

Set these in your Supabase project settings:

```bash
OPENAI_API_KEY=sk-...              # Required for all functions
GITHUB_PERSONAL_TOKEN=ghp_...      # Optional, for GitHub rate limits
APIFY_API_TOKEN=apify_...          # Required for LinkedIn scraping
```

## Development

Test locally:

```bash
supabase functions serve parse-resume-stream --env-file .env.local
```

## Frontend Integration

The streaming hooks automatically handle:

- ✅ SSE connection management
- ✅ Token accumulation
- ✅ UI throttling (50ms updates)
- ✅ Error handling
- ✅ Authentication
- ✅ Cleanup on unmount

Example integration:

```typescript
function MyComponent() {
  const { progress, isStreaming, uploadAndStream } = useResumeStream({
    onComplete: (profile) => {
      // Save to database
      // Update UI
    }
  });

  return (
    <div>
      {isStreaming && (
        <div>
          <p>{progress.message}</p>
          <pre>{progress.streamedText}</pre>
        </div>
      )}
      {progress.status === 'complete' && (
        <div>Success! Profile: {progress.profile.name}</div>
      )}
    </div>
  );
}
```

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Frontend  │ ──SSE──>│  Edge Function   │ ──API──>│  External   │
│   (React)   │<────────│  (Deno Runtime)  │<────────│  Services   │
└─────────────┘         └──────────────────┘         └─────────────┘
                               │
                               │ Stream tokens
                               ▼
                        ┌──────────────┐
                        │   OpenAI     │
                        │   GPT-4o     │
                        └──────────────┘
```

## Benefits

1. **Real-time feedback**: Users see progress immediately
2. **Better UX**: No waiting for complete response
3. **Transparency**: Users can see what's being extracted
4. **Error resilience**: Partial data still visible on errors
5. **Scalability**: Offloaded to Supabase edge network
