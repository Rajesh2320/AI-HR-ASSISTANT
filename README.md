# AI HR Assistant

End-to-end AI-powered HR assistant for candidate screening, interviews, and communications.

## Features

✅ **Job Discovery** - Candidates view all open positions and apply self-service  
✅ **Resume Screening** - AI-powered resume scoring (0-100 scale) using Claude Haiku 4.5  
✅ **Duplicate Detection** - Automatic detection of duplicate applications with HR review workflow  
✅ **Automated Interviews** - AI voice interviews scheduled via Retell AI  
✅ **Interview Analysis** - Transcript analysis with 4-parameter scoring (communication, technical, problem-solving, cultural-fit)  
✅ **HR Management** - Job creation, candidate management, interview results dashboard  
✅ **Email Notifications** - Automated notifications via EmailJS  
✅ **Real-time Dashboard** - Live candidate and interview analytics

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (no frameworks)
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Database**: Supabase PostgreSQL with Row-Level Security
- **AI Model**: Claude Haiku 4.5 (locked)
- **Phone Interviews**: Retell AI
- **Email**: EmailJS
- **Hosting**: Vercel

## Project Structure

```
ai-hr-assistant/
├── index.html                    # Resume upload form
├── jobs.html                     # Public job listing
├── admin.html                    # Candidate dashboard
├── admin-jobs.html               # Job management
├── css/
│   ├── styles.css               # Candidate page styling
│   └── admin-styles.css         # Admin dashboard styling
├── js/
│   ├── app.js                   # Resume upload logic
│   └── admin.js                 # Dashboard logic
├── supabase/
│   └── functions/
│       ├── score-resume/
│       │   └── index.ts         # Resume scoring edge function
│       ├── process-call-result/
│       │   └── index.ts         # Interview analysis edge function
│       └── schedule-interview/
│           └── index.ts         # Interview scheduling edge function
├── .gitignore
├── README.md
└── supabase-schema.sql          # Database schema (already created)
```

## Setup Instructions

### 1. Supabase Setup ✅ (DONE)
- Database tables created
- RLS policies configured
- Indexes added

### 2. Environment Variables

Create `.env.local` in your project root:

```
SUPABASE_URL=https://cwtkhsphaykebnqqqwcf.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
EMAILJS_SERVICE_ID=your_emailjs_service_id
EMAILJS_TEMPLATE_ID=your_emailjs_template_id
EMAILJS_PUBLIC_KEY=your_emailjs_public_key
RETELL_AI_API_KEY=your_retell_api_key
```

### 3. Update Credentials

Update these files with your Supabase credentials:
- `js/app.js` (lines 5-9)
- `js/admin.js` (lines 5-6)
- `jobs.html` (around line 201)
- `admin-jobs.html` (around line 260)

### 4. Deploy Edge Functions

```bash
supabase functions deploy score-resume --project-id cwtkhsphaykebnqqqwcf
supabase functions deploy process-call-result --project-id cwtkhsphaykebnqqqwcf
supabase functions deploy schedule-interview --project-id cwtkhsphaykebnqqqwcf
```

### 5. Push to GitHub

```bash
git add .
git commit -m "Initial commit: AI HR Assistant MVP"
git push origin main
```

### 6. Deploy to Vercel

1. Connect GitHub repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

## API Endpoints

### Edge Functions

**POST /functions/v1/score-resume**
- Input: resumeText, email, name, phone, jobId, uploadedByHR
- Output: score (0-100), isDuplicate (boolean), interview (scheduled details)

**POST /functions/v1/process-call-result**
- Input: callTranscript, candidateId
- Output: scores (communication, technical, problem-solving, cultural-fit), recommendation (pass/fail)

**POST /functions/v1/schedule-interview**
- Input: candidateId, scheduledTime, retellAgentId
- Output: callId, scheduledTime

## User Flows

### Candidate Self-Service

1. Visit `jobs.html` → see all open positions
2. Click "Apply for This Position"
3. Redirected to `index.html` with job pre-selected
4. Fill form and upload resume
5. **If duplicate**: Shows previous submission details, message to contact HR
6. **If new**: Claude scores resume → Interview scheduled for 24h later → Email notification

### HR Job Management

1. Visit `admin-jobs.html`
2. Create new positions with title, description, requirements, status
3. Edit or delete positions as needed

### HR Review Dashboard

1. Visit `admin.html`
2. View all candidates with scores
3. Filter by status (screening_pending, duplicate_pending_review, completed)
4. For duplicates: Approve resubmission → system will then score candidate
5. View interview results with call scores and recommendation

## Database Schema

### jobs
- id (uuid, primary key)
- title (text)
- description (text)
- requirements (text)
- status (enum: open, closed, paused)
- created_at (timestamp)

### candidates
- id (uuid, primary key)
- name (text)
- email (text)
- phone (text, nullable)
- resume_text (text)
- score (integer, 0-100)
- job_id (uuid, foreign key → jobs)
- is_duplicate (boolean)
- duplicate_of_id (uuid, nullable, foreign key → candidates)
- previous_submission_date (timestamp, nullable)
- hr_approved_for_screening (boolean)
- uploaded_by_hr (boolean)
- status (enum: resume_submitted, screening_pending, duplicate_pending_review, passed, failed)
- created_at (timestamp)

### interviews
- id (uuid, primary key)
- candidate_id (uuid, foreign key → candidates)
- scheduled_time (timestamp)
- call_id (text, Retell AI call ID)
- transcript (text, nullable)
- status (enum: scheduled, in_progress, completed)
- created_at (timestamp)

### call_analytics
- id (uuid, primary key)
- interview_id (uuid, foreign key → interviews)
- communication_score (1-10)
- technical_score (1-10)
- problem_solving_score (1-10)
- cultural_fit_score (1-10)
- recommendation (enum: pass, fail)
- notes (text, nullable)
- created_at (timestamp)

## Key Constraints

⚠️ **Claude Haiku 4.5 Locked**: All AI evaluations use `claude-haiku-4-5-20251001`. Changes require explicit approval.

🔒 **Duplicate Detection**: Email + Job ID composite key. Flagged candidates require HR approval before screening.

📞 **Interview Scheduling**: Automatically scheduled 24 hours after resume submission.

🔐 **RLS Policies**: Row-level security ensures candidates only see their own data, HR sees all.

## Deployment Checklist

- [ ] Update `.env.local` with all credentials
- [ ] Update JS files with Supabase URL and Anon Key
- [ ] Deploy edge functions to Supabase
- [ ] Push code to GitHub
- [ ] Connect repo to Vercel
- [ ] Add environment variables in Vercel
- [ ] Deploy to Vercel
- [ ] Test `jobs.html` → see open positions
- [ ] Test apply flow → resume upload
- [ ] Test duplicate detection
- [ ] Test admin-jobs.html → create position
- [ ] Test admin.html → see candidates and analytics

## Support

For issues or questions, check:
1. Supabase project logs
2. Browser console (F12)
3. Vercel deployment logs
4. Edge function logs in Supabase dashboard

---

**Built with Claude Code** 🤖
