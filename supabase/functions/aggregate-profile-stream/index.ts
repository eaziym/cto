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

const SYSTEM_PROMPT = `You are a professional career data analyst tasked with intelligently merging profile information from multiple sources into a single, clean, unified profile.

You will receive profile data from multiple sources (e.g., resume, LinkedIn, GitHub) and must:
1. **Deduplicate** entries that represent the same item (same job, same education, same skill)
2. **Merge** complementary information (e.g., LinkedIn has more details for a job also on resume)
3. **Select the best version** when there are conflicts (most complete, most recent, most accurate)
4. **Normalize** formatting and naming conventions

**Guidelines:**

**Skills:**
- Remove duplicates (case-insensitive: "JavaScript" = "javascript")
- Prefer standard naming (e.g., "React.js" over "react", "Python" over "python3")
- Categorize into technical_skills and soft_skills where possible

**Experience:**
- Merge entries for the SAME position at the SAME company (combine descriptions, dates, skills)
- Keep as separate entries if different companies OR different roles at same company
- Use the most complete information (prefer entry with more details)
- Ensure dates don't conflict (use most recent/accurate source)
- Sort by end_date (most recent first), current jobs at top

**Education:**
- Merge entries for the SAME degree at the SAME institution
- Keep as separate if different degrees or different schools
- Use most complete information
- Sort by end_date (most recent first)

**Certifications:**
- Remove exact duplicates (same name + same issuer)
- Keep different certifications even if similar names
- Prefer entry with more details (dates, expiry)

**Projects:**
- Merge if same project name and similar description
- Keep separate if clearly different projects
- Use most complete information

**Contact Info:**
- Use the most recent/complete email, phone, location
- Prefer professional email over personal if both exist
- Use full name (not abbreviations)

**Summary/About:**
- Merge multiple summaries into one comprehensive paragraph
- Remove redundant information
- Keep it concise but complete (2-4 sentences)

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1234567890",
  "location": "City, Country",
  "summary": "Professional summary paragraph",
  "about": "Detailed about section",
  "linkedin_profile_url": "https://linkedin.com/in/...",
  "github_username": "username",
  "skills": ["skill1", "skill2"],
  "technical_skills": ["tech1", "tech2"],
  "soft_skills": ["soft1", "soft2"],
  "languages": [{"language": "English", "proficiency": "Native"}],
  "experience": [
    {
      "job_title": "Title",
      "company": "Company",
      "location": "City",
      "duration": "Jan 2020 - Present",
      "description": "Description",
      "start_date": {"year": 2020, "month": "January"},
      "end_date": {"year": 2023, "month": "December"},
      "is_current": false,
      "skills": ["skill1"],
      "source": "resume"
    }
  ],
  "education": [
    {
      "institution": "University",
      "degree": "Bachelor of Science",
      "field_of_study": "Computer Science",
      "duration": "2016 - 2020",
      "start_date": {"year": 2016},
      "end_date": {"year": 2020},
      "gpa": "3.8",
      "source": "resume"
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuer",
      "issued_date": "2021",
      "expiry_date": "2024",
      "source": "linkedin"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Description",
      "technologies": ["tech1"],
      "url": "https://...",
      "start_date": "2021",
      "end_date": "2022",
      "source": "github"
    }
  ],
  "interests": ["interest1"],
  "publications": [],
  "awards": [],
  "personal_website_urls": ["https://..."]
}`;

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

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(encoder.encode(createSSEMessage('status', { status: 'fetching', message: 'Fetching knowledge sources...' })));
          
          // Fetch all knowledge sources for this user
          const { data: sources, error: sourcesError } = await supabase
            .from('knowledge_sources')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (sourcesError) throw sourcesError;
          if (!sources || sources.length === 0) {
            throw new Error('No knowledge sources found. Please add a resume or LinkedIn profile first.');
          }

          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'aggregating', 
            message: `Aggregating ${sources.length} sources...`,
            sources_count: sources.length 
          })));

          // Prepare sources data for LLM
          const sourcesData = sources.map(source => ({
            source_type: source.source_type,
            source_identifier: source.source_identifier,
            parsed_data: source.parsed_data,
          }));

          const userPrompt = `Here are ${sources.length} profile sources to merge:\n\n${JSON.stringify(sourcesData, null, 2)}\n\nMerge these intelligently into a single unified profile.`;

          const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
          const chatStream = await openai.chat.completions.create({
            model: 'gpt-4o', // Use gpt-4o instead of gpt-4o-mini for better reliability
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            stream: true,
          });

          let fullResponse = '';

          // Stream every token to frontend
          for await (const chunk of chatStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
              fullResponse += token;
              controller.enqueue(encoder.encode(createSSEMessage('token', { token })));
            }
          }

          // Parse the complete JSON with better error handling
          let aggregatedProfile;
          try {
            const cleaned = fullResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            aggregatedProfile = JSON.parse(cleaned);
          } catch (parseError) {
            console.error('Failed to parse LLM response:', parseError);
            console.error('Raw response:', fullResponse);
            throw new Error('Failed to parse aggregated profile. The LLM response was incomplete or malformed.');
          }

          // Add source tracking metadata
          const sourcesMetadata = sources.map(s => ({
            type: s.source_type,
            identifier: s.source_identifier,
            created_at: s.created_at,
          }));
          
          const now = new Date().toISOString();
          aggregatedProfile.sources = sourcesMetadata;
          aggregatedProfile.updated_at = now;

          // Save to profiles table
          console.log('[SAVE] Saving aggregated profile for user:', user.id);
          console.log('[SAVE] Profile name:', aggregatedProfile.name);
          console.log('[SAVE] Experience count:', aggregatedProfile.experience?.length);
          console.log('[SAVE] Projects count:', aggregatedProfile.projects?.length);
          
          // Combine all skills for the profile.skills field (used for navigation unlock)
          const allSkills = [
            ...(aggregatedProfile.skills || []),
            ...(aggregatedProfile.technical_skills || []),
            ...(aggregatedProfile.soft_skills || []),
          ];
          const uniqueSkills = [...new Set(allSkills)];
          
          // Use UPSERT to create profile if it doesn't exist yet (for new users)
          const { data: savedData, error: updateError } = await supabase
            .from('profiles')
            .upsert({
              id: user.id, // Primary key for upsert
              knowledge_base_summary: aggregatedProfile,
              knowledge_base_updated_at: now,
              skills: uniqueSkills, // Update skills to unlock navigation
              name: aggregatedProfile.name || 'User', // Update name if available, default to 'User'
              plan: 'freemium', // Default plan for new users
            }, {
              onConflict: 'id', // Upsert based on user ID
            })
            .select();

          if (updateError) {
            console.error('[SAVE ERROR] Failed to save aggregated profile:', updateError);
            controller.enqueue(encoder.encode(createSSEMessage('error', { 
              error: `Database save failed: ${updateError.message}` 
            })));
            controller.close();
            return;
          }
          
          console.log('[SAVE SUCCESS] Profile saved:', savedData);

          controller.enqueue(encoder.encode(createSSEMessage('complete', { 
            profile: aggregatedProfile,
            metadata: { 
              userId: user.id,
              sourcesCount: sources.length 
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
