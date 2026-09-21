// Supabase Edge Function: process-call-result
// Receives call transcript from Retell webhook and scores parameters
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
    // Receive webhook from Retell
    const webhookData = await req.json()

    const {
      call_id,
      transcript,
      recording_url,
      end_call_reason,
      custom_variables,
    } = webhookData

    // Get interview ID from custom variables
    const interviewId = custom_variables?.interview_id
    if (!interviewId) {
      return new Response(
        JSON.stringify({ error: "No interview ID in webhook" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================
    // Analyze transcript with Claude Haiku
    // LOCKED: haiku-4-5 ONLY - NO CHANGES
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
            content: `You are an expert recruiter analyzing a job interview transcript. Score these parameters on a scale of 1-10 for each:

1. Communication Skills: Clarity, articulation, ability to listen and respond appropriately
2. Technical Knowledge: Domain expertise, understanding of relevant concepts and skills
3. Problem Solving: Analytical thinking, approach to challenges, creativity
4. Cultural Fit: Values alignment, team compatibility, collaborative attitude

Also provide an overall recommendation: "pass" or "fail" for next round of interview.

Interview Transcript:
${transcript || "No transcript available"}

Respond ONLY with valid JSON (no markdown):
{
  "communication_score": <1-10>,
  "technical_score": <1-10>,
  "problem_solving_score": <1-10>,
  "cultural_fit_score": <1-10>,
  "overall_score": <1-100 average>,
  "recommendation": "<pass or fail>",
  "notes": "<2-3 sentence summary of performance>"
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

    // Parse JSON response
    let analytics = {
      communication_score: 5,
      technical_score: 5,
      problem_solving_score: 5,
      cultural_fit_score: 5,
      overall_score: 50,
      recommendation: "fail",
      notes: "Unable to parse response",
    }

    try {
      // Extract JSON from response (Claude might include markdown wrapper)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analytics = JSON.parse(jsonMatch[0])
      }
    } catch {
      console.error("Failed to parse Claude response:", responseText)
    }

    // ============================================
    // Store analytics in database
    // ============================================
    const { error: analyticsError } = await supabase
      .from("call_analytics")
      .insert({
        interview_id: interviewId,
        communication_score: analytics.communication_score,
        technical_score: analytics.technical_score,
        problem_solving_score: analytics.problem_solving_score,
        cultural_fit_score: analytics.cultural_fit_score,
        overall_score: analytics.overall_score,
        recommendation: analytics.recommendation,
        notes: analytics.notes,
      })

    if (analyticsError) {
      throw new Error(`Failed to store analytics: ${analyticsError.message}`)
    }

    // ============================================
    // Update interview status
    // ============================================
    const { error: updateError } = await supabase
      .from("interviews")
      .update({
        status: "completed",
        transcript: transcript,
      })
      .eq("id", interviewId)

    if (updateError) {
      throw new Error(`Failed to update interview: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        analytics: analytics,
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
    console.error("Error in process-call-result:", error)
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
