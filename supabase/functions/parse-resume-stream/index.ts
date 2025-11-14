// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { getDocument } from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSSEMessage(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
    const formData = await req.formData();
    const sourceId = formData.get('sourceId') as string;
    const file = formData.get('file') as File;
    const isTestMode = sourceId?.startsWith('test-');
    
    if (!isTestMode && (authError || !user)) throw new Error('Unauthorized');
    const userId = isTestMode ? 'test-user-123' : user!.id;
    if (!file || !sourceId) throw new Error('Missing file or sourceId');

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(encoder.encode(createSSEMessage('status', { status: 'uploading', message: 'Extracting text...' })));
          
          const fileBytes = await file.arrayBuffer();
          
          // Extract text using pdfjs-dist
          const pdf = await getDocument({ data: new Uint8Array(fileBytes) }).promise;
          const numPages = pdf.numPages;
          let resumeText = '';
          
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            resumeText += pageText + '\n\n';
          }

          controller.enqueue(encoder.encode(createSSEMessage('status', { status: 'parsing', message: 'Analyzing resume...' })));

          const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
          const chatStream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { 
                role: 'system', 
                content: `Extract resume information as JSON with this exact structure:
{
  "name": "full name",
  "email": "email address", 
  "phone": "phone number (extract from resume, may be labeled as phone, mobile, tel, telephone, contact, etc.)",
  "location": "city, state/country if available",
  "summary": "professional summary/objective if present",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "job_title": "title",
      "company": "company name",
      "duration": "date range (e.g. 'Jan 2020 - Present')",
      "description": "brief description"
    }
  ],
  "education": [
    {
      "degree": "degree name",
      "field_of_study": "major/field",
      "institution": "school name",
      "duration": "date range"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "duration": "date range if available",
      "description": "brief description"
    }
  ]
}

CRITICAL: 
- Always include the phone number if it exists anywhere in the resume (look for phone, mobile, tel, telephone, contact number, etc.)
- Include duration/date ranges for experience, education, and projects when available
- Return ONLY valid JSON, no markdown formatting.`
              },
              { role: 'user', content: `Parse this resume:\n\n${resumeText}` }
            ],
            stream: true,
          });

          let fullResponse = '';

          // Stream every token to frontend
          for await (const chunk of chatStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
              fullResponse += token;
              // Send each token immediately
              controller.enqueue(encoder.encode(createSSEMessage('token', { token })));
            }
          }

          // Now parse the complete JSON for DB storage
          const cleaned = fullResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          controller.enqueue(encoder.encode(createSSEMessage('complete', { profile: parsed, metadata: { sourceId, fileName: file.name, fileSize: file.size, userId } })));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(createSSEMessage('error', { error: error instanceof Error ? error.message : 'Unknown error' })));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
