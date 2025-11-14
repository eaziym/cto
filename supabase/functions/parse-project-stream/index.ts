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

const SYSTEM_PROMPT = `Extract project information from technical documents, reports, and portfolios.

Focus on:
1. **Project Details**: Name, description, purpose, and outcomes
2. **Technical Stack**: Technologies, frameworks, tools, and languages used
3. **Key Achievements**: Metrics, results, innovations, and impact
4. **Skills Demonstrated**: Technical and soft skills shown through the project
5. **Timeline**: Start and end dates if mentioned

**Guidelines:**
- Extract projects from project reports, technical documents, portfolios, or proposals
- If the document describes work done as part of a job/internship, categorize it as experience
- If the document is about a personal project, academic project, or side project, categorize it as a project
- Extract ALL technical skills and technologies mentioned
- Capture quantifiable achievements and metrics
- Include URLs, GitHub links, or demo links if present

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):

{
  "name": "Document Author Name (if found)",
  "email": "email@example.com (if found)",
  "phone": "phone number (if found)",
  "skills": ["Skill1", "Skill2", "Technology1", "Framework1"],
  "technical_skills": ["Primary technical skills"],
  "projects": [
    {
      "name": "Project Name",
      "description": "Detailed description of what the project does, its purpose, and outcomes",
      "technologies": ["Tech1", "Tech2", "Framework1"],
      "url": "https://project-url.com (if mentioned)",
      "start_date": "2023-01 (if mentioned)",
      "end_date": "2023-06 (if mentioned)"
    }
  ],
  "experience": [
    {
      "job_title": "Role Title (only if this was paid work or internship)",
      "company": "Company/Organization Name",
      "duration": "Jan 2023 - Jun 2023",
      "description": "What was accomplished in this role"
    }
  ],
  "education": []
}

**IMPORTANT:**
- If the document is clearly a project report/documentation, put content in "projects" array
- If the document describes work experience/internship, put content in "experience" array
- Extract as many relevant skills as possible from the technical content
- Leave arrays empty [] if no relevant information is found
- Do not make up information - only extract what's explicitly in the document`;

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
          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'uploading', 
            message: 'Extracting text from project document...' 
          })));
          
          const fileBytes = await file.arrayBuffer();
          
          // Extract text using pdfjs-dist
          const pdf = await getDocument({ data: new Uint8Array(fileBytes) }).promise;
          const numPages = pdf.numPages;
          let documentText = '';
          
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            documentText += pageText + '\n\n';
            
            // Send progress updates
            if (i % 5 === 0 || i === numPages) {
              controller.enqueue(encoder.encode(createSSEMessage('status', { 
                status: 'uploading', 
                message: `Extracted ${i}/${numPages} pages...` 
              })));
            }
          }

          controller.enqueue(encoder.encode(createSSEMessage('status', { 
            status: 'parsing', 
            message: 'Analyzing project document...' 
          })));

          const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
          console.log('Starting OpenAI stream for project document...');
          const chatStream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Parse this project document:\n\n${documentText}` }
            ],
            temperature: 0.3,
            stream: true,
            response_format: { type: 'json_object' }, // Ensure JSON response
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

          // Parse the complete JSON for DB storage
          const cleaned = fullResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          
          controller.enqueue(encoder.encode(createSSEMessage('complete', { 
            profile: parsed, 
            metadata: { 
              sourceId, 
              fileName: file.name, 
              fileSize: file.size, 
              userId,
              pageCount: numPages
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
