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

const APIFY_API_URL = 'https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items';

const SYSTEM_PROMPT = `Extract LinkedIn profile information and convert it to a structured knowledge base format.

You will receive LinkedIn profile data including:
- Basic information (name, headline, location, about)
- Experience history
- Education
- Certifications
- Skills
- Languages

Extract and structure this information as JSON:

{
  "name": "Full Name",
  "email": "email@example.com (if available)",
  "phone": "phone number (if available)",
  "location": "City, State/Country",
  "summary": "Headline from LinkedIn",
  "about": "About/Bio section",
  "skills": ["Skill1", "Skill2", ...],
  "technical_skills": ["Technical skills separated from soft skills"],
  "soft_skills": ["Communication", "Leadership", etc.],
  "languages": [
    {
      "language": "English",
      "proficiency": "Native or Bilingual"
    }
  ],
  "experience": [
    {
      "job_title": "Title",
      "company": "Company Name",
      "location": "City, State",
      "duration": "Jan 2020 - Present",
      "description": "What you did in this role",
      "start_date": {"year": 2020, "month": "January"},
      "end_date": {"year": 2024, "month": "December"},
      "is_current": false,
      "skills": ["Skill1", "Skill2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Bachelor of Science",
      "field_of_study": "Computer Science",
      "duration": "2016 - 2020",
      "start_date": {"year": 2016},
      "end_date": {"year": 2020}
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Organization",
      "issued_date": "2021-05"
    }
  ],
  "linkedin_profile_url": "https://linkedin.com/in/username"
}

**Guidelines:**
- Separate technical skills from soft skills where possible
- Include all experience entries with detailed descriptions
- Parse dates into structured format with year and month
- Mark current positions with is_current: true
- Extract skills from both the skills section AND from experience descriptions
- Keep education in reverse chronological order (most recent first)

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

    const { url, sourceId } = await req.json();
    if (!url || !sourceId) throw new Error('Missing LinkedIn URL or sourceId');

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'fetching', 
            message: 'Fetching LinkedIn profile... (this may take 30-60 seconds)' 
          })));

          const apiToken = Deno.env.get('APIFY_API_TOKEN');
          if (!apiToken) {
            throw new Error('APIFY_API_TOKEN is not configured');
          }

          console.log('Starting LinkedIn fetch for:', url);
          
          // Fetch LinkedIn using Apify
          const fetchStartTime = Date.now();
          const response = await fetch(`${APIFY_API_URL}?token=${apiToken}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              includeEmail: true,
              username: url,
            }),
          });

          if (!response.ok) {
            throw new Error(`LinkedIn fetch failed: ${response.status}`);
          }

          const data = await response.json();
          const fetchEndTime = Date.now();
          const fetchDuration = ((fetchEndTime - fetchStartTime) / 1000).toFixed(1);
          console.log(`LinkedIn fetch completed in ${fetchDuration}s`);

          if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No data returned from LinkedIn API');
          }

          const linkedInProfile = data[0];

          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'parsing', 
            message: `Profile fetched! Analyzing ${linkedInProfile.basic_info?.fullname || 'user'}'s data...` 
          })));

          // Prepare structured data for LLM
          const profileData = {
            basic_info: linkedInProfile.basic_info,
            experience: linkedInProfile.experience,
            education: linkedInProfile.education,
            certifications: linkedInProfile.certifications,
            skills: linkedInProfile.skills,
            languages: linkedInProfile.languages,
          };

          const userPrompt = `Parse this LinkedIn profile data:\n\n${JSON.stringify(profileData, null, 2)}`;

          const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
          console.log('Starting OpenAI stream for LinkedIn profile...');
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

          // Stream tokens
          for await (const chunk of chatStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
              fullResponse += token;
              controller.enqueue(encoder.encode(createSSEMessage('token', { token })));
            }
          }

          // Parse complete JSON
          const cleaned = fullResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          controller.enqueue(encoder.encode(createSSEMessage('complete', { 
            profile: parsed, 
            metadata: { 
              sourceId, 
              url,
              userId: user.id 
            },
            rawData: linkedInProfile // Include raw data for reference
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
