// Supabase Edge Function: score-resume
// LOCKED: Claude Haiku 4.5 only - NO OTHER MODELS

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { resumeText, email, name, phone, jobId, uploadedByHR } = await req.json()

    // Validate input
    if (!resumeText || !email || !name || !jobId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================
    // STEP 1: Check for duplicate submission
    // ============================================
    const { data: existingCandidates, error: checkError } = await supabase
      .from("candidates")
      .select("id, created_at, resume_score, status, hr_approved_for_screening")
      .eq("email", email)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (checkError) {
      throw new Error(`Failed to check duplicates: ${checkError.message}`)
    }

    // If duplicate exists and HR hasn't approved, flag it
    if (existingCandidates && existingCandidates.length > 0) {
      const previousSubmission = existingCandidates[0]

      // Check if HR already approved resubmission
      if (!previousSubmission.hr_approved_for_screening && !uploadedByHR) {
        // Duplicate found and not yet approved by HR
        const { data: duplicateCandidate, error: dupError } = await supabase
          .from("candidates")
          .insert({
            email,
            name,
            phone: phone || null,
            job_id: jobId,
            resume_text: resumeText,
            resume_score: 0,
            is_duplicate: true,
            duplicate_of_id: previousSubmission.id,
            previous_submission_date: previousSubmission.created_at,
            hr_approved_for_screening: false,
            uploaded_by_hr: uploadedByHR || false,
            status: "duplicate_pending_review",
          })
          .select()
          .single()

        if (dupError) {
          throw new Error(`Failed to store duplicate: ${dupError.message}`)
        }

        return new Response(
          JSON.stringify({
            success: false,
            isDuplicate: true,
            previousSubmission: {
              date: previousSubmission.created_at,
              score: previousSubmission.resume_score,
            },
            message: "Duplicate application found. HR will review for resubmission.",
            candidate: duplicateCandidate,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        )
      }
    }

    // ============================================
    // STEP 2: Score resume with Claude Haiku
    // LOCKED: haiku-4-5 ONLY
    // ============================================
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // LOCKED - NO CHANGES
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are an HR screening expert. Score this resume on a scale of 0-100 based on:
- Relevant experience (40%)
- Education/qualifications (30%)
- Technical skills (20%)
- Communication quality (10%)

Resume:
${resumeText}

Respond ONLY with valid JSON (no markdown):
{
  "score": <number between 0-100>,
  "reason": "<brief 1-2 sentence reason>"
}`,
          },
        ],
      }),
    })

    const claudeData = await claudeResponse.json()

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${JSON.stringify(claudeData)}`)
    }

    const responseText = claudeData.content[0].text
    let scoring = { score: 50, reason: "Unable to parse" }

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        scoring = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Fallback: try to extract just the number
      const scoreMatch = responseText.match(/\d+/)
      if (scoreMatch) {
        scoring.score = parseInt(scoreMatch[0])
      }
    }

    // ============================================
    // STEP 3: Create candidate record
    // ============================================
    const { data: candidateData, error: candidateError } = await supabase
      .from("candidates")
      .insert({
        email,
        name,
        phone: phone || null,
        job_id: jobId,
        resume_text: resumeText,
        resume_score: Math.min(100, Math.max(0, scoring.score)),
        is_duplicate: false,
        hr_approved_for_screening: true,
        uploaded_by_hr: uploadedByHR || false,
        status: "screening_pending",
      })
      .select()
      .single()

    if (candidateError) {
      throw new Error(`Failed to store candidate: ${candidateError.message}`)
    }

    // ============================================
    // STEP 4: Auto-schedule interview
    // ============================================
    const scheduledTime = new Date()
    scheduledTime.setHours(scheduledTime.getHours() + 24)

    const { data: interviewData, error: interviewError } = await supabase
      .from("interviews")
      .insert({
        candidate_id: candidateData.id,
        scheduled_time: scheduledTime.toISOString(),
        status: "scheduled",
      })
      .select()
      .single()

    if (interviewError) {
      throw new Error(`Failed to schedule interview: ${interviewError.message}`)
    }

    // ============================================
    // STEP 5: Return success
    // ============================================
    return new Response(
      JSON.stringify({
        success: true,
        isDuplicate: false,
        candidate: candidateData,
        interview: interviewData,
        score: scoring.score,
        reason: scoring.reason,
        scheduledTime: scheduledTime.toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    )
  } catch (error) {
    console.error("Error in score-resume:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    )
  }
})
