// Candidate Resume Upload - Updated Logic
// Handles: Pre-selected jobs, duplicates, HR uploads, self-service

// Configuration
const SUPABASE_URL = 'https://cwtkhsphaykebnqqqwcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3dGtoc3BoYXlrZWJucXFxd2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NzM4MzgsImV4cCI6MjEwNTU0OTgzOH0.Kia5M7o9BqmO5OgzxXBxeE2--2p4nI_BflXnEORJpgY';
const EMAILJS_SERVICE_ID = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';

// Global state
let supabase;
let uploadMode = 'self'; // 'self' or 'bulk'
let selectedJobId = null;

// Initialize Supabase
const sbScript = document.createElement('script');
sbScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
sbScript.onload = () => {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initializePage();
};
document.head.appendChild(sbScript);

// Initialize EmailJS
const ejsScript = document.createElement('script');
ejsScript.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
ejsScript.onload = () => {
  emailjs.init(EMAILJS_PUBLIC_KEY);
};
document.head.appendChild(ejsScript);

// Initialize page
async function initializePage() {
  // Check if job was pre-selected from jobs.html
  const jobIdFromSession = sessionStorage.getItem('selectedJobId');
  const jobTitleFromSession = sessionStorage.getItem('selectedJobTitle');

  if (jobIdFromSession) {
    // Pre-selected job
    selectedJobId = jobIdFromSession;
    document.getElementById('jobInfo').style.display = 'block';
    document.getElementById('jobTitle').textContent = jobTitleFromSession;
    document.getElementById('jobId').value = jobIdFromSession;
    document.getElementById('jobSelector').style.display = 'none';

    // Clear session storage
    sessionStorage.removeItem('selectedJobId');
    sessionStorage.removeItem('selectedJobTitle');
  } else {
    // Load all jobs for selection
    document.getElementById('jobInfo').style.display = 'none';
    document.getElementById('jobSelector').style.display = 'block';
    loadJobs();
  }

  // Form submission
  document.getElementById('resumeForm').addEventListener('submit', handleSubmit);

  // Job selector change
  document.getElementById('jobId').addEventListener('change', (e) => {
    selectedJobId = e.target.value;
  });
}

// Load available jobs
async function loadJobs() {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const jobSelect = document.getElementById('jobId');
    jobSelect.innerHTML = '<option value="">Select a position...</option>';

    (data || []).forEach((job) => {
      const option = document.createElement('option');
      option.value = job.id;
      option.textContent = job.title;
      jobSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// Set upload mode (HR only)
function setUploadMode(mode) {
  uploadMode = mode;
  document.getElementById('uploadModeSelector').style.display = 'none';

  if (mode === 'bulk') {
    // In bulk mode, show file input for multiple resumés
    // For MVP, we'll keep single form and HR can use it multiple times
    alert('Bulk mode: Submit resumes one at a time. System will track as HR uploads.');
  }
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const jobId = selectedJobId || document.getElementById('jobId').value;
  const resumeFile = document.getElementById('resume').files[0];

  // Validate
  if (!jobId) {
    showError('Please select a position');
    return;
  }

  if (!resumeFile) {
    showError('Please select a resume file');
    return;
  }

  showLoading('Processing your resume...');

  try {
    // Read resume file
    const resumeText = await readFileAsText(resumeFile);

    if (!resumeText) {
      throw new Error('Failed to read resume file');
    }

    // Call edge function to score resume
    const scoreResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/score-resume`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText,
          email,
          name,
          phone: phone || null,
          jobId,
          uploadedByHR: uploadMode === 'bulk',
        }),
      }
    );

    if (!scoreResponse.ok) {
      const errorData = await scoreResponse.json();
      throw new Error(errorData.error || 'Failed to process resume');
    }

    const result = await scoreResponse.json();

    // Check if duplicate
    if (result.isDuplicate) {
      showDuplicate(result);
      return;
    }

    const { candidate, interview, score } = result;

    // Send email notification
    try {
      const interviewDate = new Date(interview.scheduled_time);
      const formattedDate = interviewDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Get job title
      const { data: jobData } = await supabase
        .from('jobs')
        .select('title')
        .eq('id', jobId)
        .single();

      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        candidate_name: name,
        resume_score: score,
        interview_date: formattedDate,
        job_position: jobData?.title || 'Position',
      });
    } catch (emailError) {
      console.error('Email failed (non-critical):', emailError);
      // Don't fail if email fails
    }

    // Show success
    displaySuccess(score, interview.scheduled_time, document.getElementById('jobId').options[document.getElementById('jobId').selectedIndex].text);
  } catch (error) {
    console.error('Error:', error);
    showError(error.message || 'An error occurred. Please try again.');
  }
}

// Read file as text
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve(e.target.result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    if (file.type === 'text/plain') {
      reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      // For MVP, PDF will require pdfjs library
      reader.readAsArrayBuffer(file);
      // TODO: Add PDF text extraction
      reject(new Error('PDF parsing coming soon. Please use TXT files for now.'));
    } else {
      reject(new Error('Unsupported file type. Please use TXT or PDF.'));
    }
  });
}

// Show loading
function showLoading(text = 'Processing your resume...') {
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'block';
  document.getElementById('loadingText').textContent = text;
  document.getElementById('success-section').style.display = 'none';
  document.getElementById('duplicate-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
}

// Show duplicate
function showDuplicate(result) {
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'none';
  document.getElementById('success-section').style.display = 'none';
  document.getElementById('duplicate-section').style.display = 'block';
  document.getElementById('error-section').style.display = 'none';

  const prevDate = new Date(result.previousSubmission.date);
  const formattedDate = prevDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  document.getElementById('dupJobTitle').textContent = document.getElementById('jobId').options[document.getElementById('jobId').selectedIndex].text;
  document.getElementById('dupSubmissionDate').textContent = formattedDate;
  document.getElementById('dupScore').textContent = `${result.previousSubmission.score}/100`;
}

// Show success
function displaySuccess(score, scheduledTime, jobTitle) {
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'none';
  document.getElementById('duplicate-section').style.display = 'none';
  document.getElementById('success-section').style.display = 'block';
  document.getElementById('error-section').style.display = 'none';

  document.getElementById('resumeScore').textContent = `${score}/100`;
  document.getElementById('positionTitle').textContent = jobTitle;

  const interviewDate = new Date(scheduledTime);
  const formattedDate = interviewDate.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('interviewTime').textContent = formattedDate;
}

// Show error
function showError(message) {
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'none';
  document.getElementById('success-section').style.display = 'none';
  document.getElementById('duplicate-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'block';

  document.getElementById('errorMessage').textContent = message;
}