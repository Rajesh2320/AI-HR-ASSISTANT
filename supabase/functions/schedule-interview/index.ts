// Supabase Edge Function: schedule-interview
// Calls Retell AI to schedule outbound phone call

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
    const { interviewId, candidatePhone, candidateName, resumeScore } =
      await req.json()

    if (!interviewId || !candidatePhone) {
      return new Response(
        JSON.stringify({ error: "Missing interview ID or phone" }),
        { status: 400, headers: corsHeaders }
      )
    }

    const retellApiKey = Deno.env.get("RETELL_API_KEY")
    const retellAgentId = Deno.env.get("RETELL_AGENT_ID")

    // Build Retell webhook callback URL (optional - for call completion updates)
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-call-result`

    // Call Retell API to create outbound call
    const retellResponse = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${retellApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: retellAgentId,
        phone_number: candidatePhone,
        custom_variables: {
          candidate_name: candidateName,
          resume_score: resumeScore,
          interview_id: interviewId,
        },
        webhook_url: callbackUrl,
      }),
    })

    const retellData = await retellResponse.json()

    if (!retellResponse.ok) {
      throw new Error(`Retell API error: ${JSON.stringify(retellData)}`)
    }

    // Update interview with Retell call ID
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: updateError } = await supabase
      .from("interviews")
      .update({
        retell_call_id: retellData.call_id,
        status: "call_scheduled",
      })
      .eq("id", interviewId)

    if (updateError) {
      throw new Error(`Failed to update interview: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        callId: retellData.call_id,
        message: `Call scheduled for ${candidateName}`,
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
