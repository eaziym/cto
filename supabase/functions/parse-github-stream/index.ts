// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSSEMessage(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const GITHUB_API_URL = 'https://api.github.com';

const SYSTEM_PROMPT = `Extract GitHub profile information and convert it to a structured knowledge base format.

You will receive:
1. GitHub user profile data
2. List of repositories with their metadata

Extract and structure this information as JSON:

{
  "name": "Full Name (from profile)",
  "email": "email@example.com (from profile)",
  "location": "City, Country (from profile)",
  "summary": "Bio/description from profile",
  "about": "Expanded bio with key highlights",
  "skills": ["Language1", "Framework1", "Technology1", ...],
  "technical_skills": ["Primary technical skills derived from repos"],
  "projects": [
    {
      "name": "Repository name",
      "description": "Repository description",
      "technologies": ["Language", "Topic1", "Topic2"],
      "url": "https://github.com/user/repo",
      "start_date": "created_at date",
      "end_date": "updated_at date"
    }
  ],
  "interests": ["Topics and areas of interest from repos"],
  "github_username": "username",
  "personal_website_urls": ["blog_url or website from profile"]
}

**Guidelines:**
- Extract skills from repo languages and topics (prioritize most frequently used)
- Convert top 10 non-fork repositories to projects
- Exclude .github.io repos (GitHub Pages)
- Sort skills by frequency of use across repos
- Include repository stars, forks as context in project descriptions if notable
- Use bio/description as summary and about
- Extract interests from topics and repo descriptions

Return ONLY valid JSON (no markdown, no code blocks).`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { username, sourceId } = await req.json();
    if (!username || !sourceId) throw new Error('Missing username or sourceId');

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'fetching', 
            message: `Fetching GitHub profile for ${username}...` 
          })));

          // Fetch GitHub data
          const headers: Record<string, string> = {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Supabase-Edge-Function',
            'X-GitHub-Api-Version': '2022-11-28',
          };

          const githubToken = Deno.env.get('GITHUB_PERSONAL_TOKEN');
          if (githubToken) {
            // GitHub supports both 'token' and 'Bearer' format
            // For personal access tokens (classic), use 'token'
            // For fine-grained tokens, use 'Bearer'
            headers['Authorization'] = githubToken.startsWith('github_pat_') 
              ? `Bearer ${githubToken}` 
              : `token ${githubToken}`;
            console.log('Using authenticated GitHub API request');
          } else {
            console.log('Using unauthenticated GitHub API request (60 req/hour limit)');
          }

          // Fetch profile
          const profileResponse = await fetch(`${GITHUB_API_URL}/users/${username}`, { headers });
          
          // Log rate limit info
          const rateLimit = {
            limit: profileResponse.headers.get('x-ratelimit-limit'),
            remaining: profileResponse.headers.get('x-ratelimit-remaining'),
            reset: profileResponse.headers.get('x-ratelimit-reset'),
          };
          console.log('GitHub API Rate Limit:', rateLimit);
          
          if (!profileResponse.ok) {
            const errorBody = await profileResponse.text();
            console.error('GitHub API Error:', {
              status: profileResponse.status,
              statusText: profileResponse.statusText,
              body: errorBody,
              rateLimit,
            });
            
            if (profileResponse.status === 404) {
              throw new Error(`GitHub user '${username}' not found`);
            }
            if (profileResponse.status === 403) {
              // Check if it's a rate limit issue
              const remaining = parseInt(rateLimit.remaining || '0');
              if (remaining === 0) {
                const resetTime = rateLimit.reset ? new Date(parseInt(rateLimit.reset) * 1000).toLocaleTimeString() : 'unknown';
                throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}. Set GITHUB_PERSONAL_TOKEN to increase limit to 5000/hour.`);
              }
              
              // Parse other 403 errors
              try {
                const errorData = JSON.parse(errorBody);
                throw new Error(`GitHub API: ${errorData.message || 'Access forbidden'}`);
              } catch {
                throw new Error(`GitHub API access forbidden (403). You may need to set GITHUB_PERSONAL_TOKEN secret.`);
              }
            }
            throw new Error(`GitHub API failed (${profileResponse.status}): ${errorBody}`);
          }

          const profile = await profileResponse.json();

          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'fetching', 
            message: 'Fetching repositories...' 
          })));

          // Fetch repositories
          const reposResponse = await fetch(
            `${GITHUB_API_URL}/users/${username}/repos?sort=updated&per_page=50`,
            { headers }
          );

          const repos = reposResponse.ok ? await reposResponse.json() : [];

          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'parsing', 
            message: `Analyzing profile with ${repos.length} repositories...` 
          })));

          // Prepare data for LLM
          const githubData = {
            profile: {
              name: profile.name,
              login: profile.login,
              email: profile.email,
              bio: profile.bio,
              location: profile.location,
              blog: profile.blog,
              company: profile.company,
              public_repos: profile.public_repos,
              followers: profile.followers,
              following: profile.following,
            },
            repos: repos.slice(0, 50).map((repo: any) => ({
              name: repo.name,
              description: repo.description,
              language: repo.language,
              topics: repo.topics || [],
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              url: repo.html_url,
              created_at: repo.created_at,
              updated_at: repo.updated_at,
              is_fork: repo.fork,
            })),
          };

          const userPrompt = `Parse this GitHub profile data:\n\n${JSON.stringify(githubData, null, 2)}`;

          const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
          
          console.log('Starting OpenAI stream for GitHub profile...');
          const chatStream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            stream: true,
            response_format: { type: 'json_object' }, // Ensure JSON response
          });

          let fullResponse = '';
          let tokenCount = 0;

          // Stream tokens with error handling
          try {
            for await (const chunk of chatStream) {
              const token = chunk.choices[0]?.delta?.content || '';
              if (token) {
                fullResponse += token;
                tokenCount++;
                controller.enqueue(encoder.encode(createSSEMessage('token', { token })));
                
                // Log progress every 50 tokens
                if (tokenCount % 50 === 0) {
                  console.log(`Streamed ${tokenCount} tokens so far...`);
                }
              }
            }
            console.log(`OpenAI stream completed. Total tokens: ${tokenCount}`);
          } catch (streamError) {
            console.error('OpenAI streaming error:', streamError);
            console.error('Tokens received before error:', tokenCount);
            console.error('Partial response:', fullResponse.substring(0, 200));
            throw new Error(`Streaming interrupted: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`);
          }

          // Parse complete JSON with error handling
          let parsed;
          try {
            const cleaned = fullResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            parsed = JSON.parse(cleaned);
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('Full response:', fullResponse);
            
            // Try to extract partial valid JSON
            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
                console.log('Recovered partial JSON');
              } catch {
                throw new Error('Failed to parse GitHub profile data. Response may be incomplete.');
              }
            } else {
              throw new Error('Failed to parse GitHub profile data. No valid JSON found.');
            }
          }

          controller.enqueue(encoder.encode(createSSEMessage('complete', { 
            profile: parsed, 
            metadata: { 
              sourceId, 
              username,
              userId: user.id,
              repoCount: repos.length
            } 
          })));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(createSSEMessage('error', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream', 
        'Cache-Control': 'no-cache', 
        'Connection': 'keep-alive' 
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
