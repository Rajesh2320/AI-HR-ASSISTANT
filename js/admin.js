// Admin Dashboard - Real-time Candidates & Analytics

// Configuration
const SUPABASE_URL = 'https://cwtkhsphaykebnqqqwcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3dGtoc3BoYXlrZWJucXFxd2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NzM4MzgsImV4cCI6MjEwNTU0OTgzOH0.Kia5M7o9BqmO5OgzxXBxeE2--2p4nI_BflXnEORJpgY';

// Global state
let supabase;
let allCandidates = [];
let allInterviews = [];

// Initialize Supabase
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
script.onload = () => {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initializeDashboard();
};
document.head.appendChild(script);

// Load Chart.js
const chartScript = document.createElement('script');
chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@3';
document.head.appendChild(chartScript);

// Initialize dashboard
async function initializeDashboard() {
  // Load initial data
  await loadCandidates();
  await loadInterviews();

  // Setup real-time subscriptions
  setupRealtimeSubscriptions();

  // Load charts
  setTimeout(() => {
    loadCharts();
  }, 500);
}

// Load candidates
async function loadCandidates() {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('*, jobs(title)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allCandidates = data || [];
    renderCandidatesTable();
  } catch (error) {
    console.error('Error loading candidates:', error);
  }
}

// Load interviews
async function loadInterviews() {
  try {
    const { data, error } = await supabase
      .from('interviews')
      .select('*, candidates(name, email), call_analytics(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allInterviews = data || [];
    renderInterviewsTable();
  } catch (error) {
    console.error('Error loading interviews:', error);
  }
}

// Setup real-time subscriptions
function setupRealtimeSubscriptions() {
  // Subscribe to candidates
  supabase
    .channel('public:candidates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, (payload) => {
      loadCandidates();
    })
    .subscribe();

  // Subscribe to interviews
  supabase
    .channel('public:interviews')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews' }, (payload) => {
      loadInterviews();
    })
    .subscribe();
}

// Render candidates table
function renderCandidatesTable() {
  const container = document.getElementById('candidatesContainer');
  
  if (allCandidates.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #9ca3af;">No candidates yet</p>';
    return;
  }

  let html = `
    <table class="candidates-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Position</th>
          <th>Score</th>
          <th>Status</th>
          <th>Date</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  allCandidates.forEach((candidate) => {
    const date = new Date(candidate.created_at).toLocaleDateString();
    const statusBadge = getStatusBadge(candidate.status);
    
    html += `
      <tr>
        <td>${candidate.name}</td>
        <td>${candidate.email}</td>
        <td>${candidate.jobs?.title || '-'}</td>
        <td><strong>${candidate.score || '-'}</strong></td>
        <td>${statusBadge}</td>
        <td>${date}</td>
        <td><button class="btn-small" onclick="viewCandidate('${candidate.id}')">View</button></td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// Render interviews table
function renderInterviewsTable() {
  const container = document.getElementById('interviewsContainer');
  
  if (allInterviews.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #9ca3af;">No interviews yet</p>';
    return;
  }

  let html = `
    <table class="candidates-table">
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Scheduled</th>
          <th>Status</th>
          <th>Communication</th>
          <th>Technical</th>
          <th>Problem Solving</th>
          <th>Cultural Fit</th>
          <th>Recommendation</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  allInterviews.forEach((interview) => {
    const scheduled = new Date(interview.scheduled_time).toLocaleString();
    const analytics = interview.call_analytics?.[0];
    const recommendation = analytics?.recommendation ? 
      `<span class="badge ${analytics.recommendation}">${analytics.recommendation.toUpperCase()}</span>` : 
      '-';

    html += `
      <tr>
        <td>${interview.candidates?.name || '-'}</td>
        <td>${scheduled}</td>
        <td><span class="badge ${interview.status}">${interview.status}</span></td>
        <td>${analytics?.communication_score || '-'}</td>
        <td>${analytics?.technical_score || '-'}</td>
        <td>${analytics?.problem_solving_score || '-'}</td>
        <td>${analytics?.cultural_fit_score || '-'}</td>
        <td>${recommendation}</td>
        <td><button class="btn-small" onclick="viewInterview('${interview.id}')">View</button></td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// Load charts
function loadCharts() {
  loadScoreChart();
  loadStatusChart();
  loadPerformanceChart();
  loadRecommendationChart();
}

// Load score distribution chart
function loadScoreChart() {
  const ctx = document.getElementById('scoreChart');
  if (!ctx || !window.Chart) return;

  const scores = allCandidates.map(c => c.score).filter(s => s !== null);
  const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const counts = bins.map((bin, i) => {
    const nextBin = bins[i + 1] || 101;
    return scores.filter(s => s >= bin && s < nextBin).length;
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map((b, i) => `${b}-${bins[i + 1] || 100}`),
      datasets: [{
        label: 'Candidates',
        data: counts,
        backgroundColor: '#3b82f6',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

// Load status chart
function loadStatusChart() {
  const ctx = document.getElementById('statusChart');
  if (!ctx || !window.Chart) return;

  const statusCounts = {};
  allCandidates.forEach(c => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });

  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: ['#3b82f6', '#ef4444', '#fbbf24', '#10b981'],
      }]
    },
    options: { responsive: true }
  });
}

// Load performance chart
function loadPerformanceChart() {
  const ctx = document.getElementById('performanceChart');
  if (!ctx || !window.Chart) return;

  const completedInterviews = allInterviews.filter(i => i.status === 'completed');
  
  if (completedInterviews.length === 0) {
    ctx.parentElement.innerHTML = '<p style="text-align: center; color: #9ca3af;">No completed interviews yet</p>';
    return;
  }

  const avgScores = {
    communication: 0,
    technical: 0,
    problem_solving: 0,
    cultural_fit: 0,
  };

  completedInterviews.forEach(interview => {
    const analytics = interview.call_analytics?.[0];
    if (analytics) {
      avgScores.communication += analytics.communication_score;
      avgScores.technical += analytics.technical_score;
      avgScores.problem_solving += analytics.problem_solving_score;
      avgScores.cultural_fit += analytics.cultural_fit_score;
    }
  });

  const count = completedInterviews.length;
  Object.keys(avgScores).forEach(key => {
    avgScores[key] = Math.round(avgScores[key] / count);
  });

  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Communication', 'Technical', 'Problem Solving', 'Cultural Fit'],
      datasets: [{
        label: 'Average Score',
        data: [avgScores.communication, avgScores.technical, avgScores.problem_solving, avgScores.cultural_fit],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      }]
    },
    options: { 
      responsive: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 10
        }
      }
    }
  });
}

// Load recommendation chart
function loadRecommendationChart() {
  const ctx = document.getElementById('recommendationChart');
  if (!ctx || !window.Chart) return;

  const completedInterviews = allInterviews.filter(i => i.status === 'completed');
  const recommendations = { pass: 0, fail: 0 };

  completedInterviews.forEach(interview => {
    const analytics = interview.call_analytics?.[0];
    if (analytics) {
      recommendations[analytics.recommendation]++;
    }
  });

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pass', 'Fail'],
      datasets: [{
        data: [recommendations.pass, recommendations.fail],
        backgroundColor: ['#10b981', '#ef4444'],
      }]
    },
    options: { responsive: true }
  });
}

// View candidate details
function viewCandidate(candidateId) {
  const candidate = allCandidates.find(c => c.id === candidateId);
  if (!candidate) return;

  alert(`
Name: ${candidate.name}
Email: ${candidate.email}
Phone: ${candidate.phone || '-'}
Score: ${candidate.score}/100
Status: ${candidate.status}
Date: ${new Date(candidate.created_at).toLocaleString()}
  `);
}

// View interview details
function viewInterview(interviewId) {
  const interview = allInterviews.find(i => i.id === interviewId);
  if (!interview) return;

  const analytics = interview.call_analytics?.[0];
  alert(`
Candidate: ${interview.candidates?.name}
Scheduled: ${new Date(interview.scheduled_time).toLocaleString()}
Status: ${interview.status}
Communication: ${analytics?.communication_score || '-'}/10
Technical: ${analytics?.technical_score || '-'}/10
Problem Solving: ${analytics?.problem_solving_score || '-'}/10
Cultural Fit: ${analytics?.cultural_fit_score || '-'}/10
Recommendation: ${analytics?.recommendation || '-'}
  `);
}

// Get status badge HTML
function getStatusBadge(status) {
  const colors = {
    'resume_submitted': 'badge-blue',
    'screening_pending': 'badge-yellow',
    'duplicate_pending_review': 'badge-orange',
    'passed': 'badge-green',
    'failed': 'badge-red'
  };
  
  return `<span class="badge ${colors[status] || 'badge-gray'}">${status}</span>`;
}