/**
 * app.js - DOM management, events handler, settings, breathing timers,
 * OpenRouter AI calls, and Supabase integration.
 * Adheres strictly to WCAG 2.1 AA A11y and Zero-Trust XSS standards.
 */

(function () {
  // Application State
  const state = {
    logs: [],
    settings: {
      openrouter_key: '',
      model: 'mistralai/mistral-7b-instruct',
      supabase_url: '',
      supabase_key: ''
    },
    user: null, // { email, token }
    activeTab: 'dashboard',
    chatHistory: [],
    // Breathing Coach
    breathMode: 'box', // 'box' or '478'
    breathTimer: null,
    breathCycleCount: 0,
    breathActive: false,
    breathPhaseIndex: 0,
    breathTimeRemaining: 0,
    // Sync status
    isSyncing: false
  };

  // Breathing Coach Configuration
  const BREATH_PHASES = {
    box: [
      { name: 'Inhale', duration: 4, scale: 1.8, instruction: 'Breathe in slowly through your nose...' },
      { name: 'Hold', duration: 4, scale: 1.8, instruction: 'Hold your breath and stay still...' },
      { name: 'Exhale', duration: 4, scale: 1.0, instruction: 'Exhale fully through your mouth...' },
      { name: 'Hold', duration: 4, scale: 1.0, instruction: 'Rest and hold before the next breath...' }
    ],
    478: [
      { name: 'Inhale', duration: 4, scale: 1.8, instruction: 'Breathe in quietly through your nose...' },
      { name: 'Hold', duration: 7, scale: 1.8, instruction: 'Hold your breath. Keep your mind calm...' },
      { name: 'Exhale', duration: 8, scale: 1.0, instruction: 'Exhale with a whoosh sound from your mouth...' }
    ]
  };

  // Storage Keys
  const STORAGE_LOGS_KEY = 'aura_logs_v2';
  const STORAGE_SETTINGS_KEY = 'aura_settings_v2';
  const STORAGE_AUTH_KEY = 'aura_auth_v2';

  // SVG namespace
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ==========================================================================
     Helper Functions (Security & A11y)
     ========================================================================== */
  function showToast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    if (!region) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon mapping
    const icon = document.createElement('i');
    if (type === 'success') icon.className = 'ti ti-circle-check';
    else if (type === 'danger') icon.className = 'ti ti-circle-x';
    else if (type === 'warning') icon.className = 'ti ti-alert-triangle';
    else icon.className = 'ti ti-info-circle';
    
    icon.setAttribute('aria-hidden', 'true');
    toast.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    region.appendChild(toast);

    // Auto remove after 3.5 seconds
    setTimeout(() => {
      toast.style.animation = 'toastFadeIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) reverse forwards';
      setTimeout(() => {
        if (toast.parentNode) region.removeChild(toast);
      }, 300);
    }, 3500);
  }

  // Clear children helper (safer than innerHTML = '')
  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /* ==========================================================================
     Database Syncing & REST API Calls (Supabase & OpenRouter)
     ========================================================================== */
  
  // Custom fetch wrapper with fallback mechanisms
  async function apiCall(url, options = {}, timeoutMs = 8000) {
    const controller = new AbController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;
    
    try {
      const response = await fetch(url, options);
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Abort controller shim for old environments
  class AbController {
    constructor() {
      this.signal = new AbortController().signal;
    }
    abort() {
      // Stub
    }
  }

  // Load cloud data if Supabase credentials exist and user is logged in
  async function loadLogsFromSupabase() {
    if (!state.settings.supabase_url || !state.settings.supabase_key || !state.user) return;
    state.isSyncing = true;
    
    const url = `${state.settings.supabase_url}/rest/v1/wellness_logs?select=*&order=created_at.desc`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': state.settings.supabase_key,
          'Authorization': `Bearer ${state.user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const cloudLogs = await res.json();
        // Merge cloud logs with local logs (by matching id or timestamp)
        // For simplicity: replace local logs if cloud logs fetch successfully
        if (Array.isArray(cloudLogs)) {
          state.logs = cloudLogs.map(log => ({
            id: log.id,
            mood: log.mood,
            sleepHours: log.sleep_hours,
            activityMinutes: log.activity_minutes,
            stressLevel: log.stress_level,
            journalText: log.journal_text,
            wellnessScore: log.wellness_score,
            burnoutScore: log.burnout_score,
            keywords: log.keywords || [],
            copingSuggestions: log.coping_suggestions || [],
            createdAt: log.created_at
          }));
          localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(state.logs));
          updateDashboardUI();
          renderHistoryLogs();
          renderCharts();
        }
      } else {
        const errData = await res.json();
        console.error('Supabase load error:', errData);
      }
    } catch (e) {
      console.warn('Network offline or Supabase connection failed. Reverting to local storage cache.', e);
    } finally {
      state.isSyncing = false;
    }
  }

  // Sync a single journal entry up to Supabase
  async function syncLogToSupabase(log) {
    if (!state.settings.supabase_url || !state.settings.supabase_key || !state.user) return false;
    
    const url = `${state.settings.supabase_url}/rest/v1/wellness_logs`;
    try {
      const body = {
        user_id: state.user.id,
        mood: log.mood,
        sleep_hours: log.sleepHours,
        activity_minutes: log.activityMinutes,
        stress_level: log.stressLevel,
        journal_text: log.journalText,
        wellness_score: log.wellnessScore,
        burnout_score: log.burnoutScore,
        keywords: log.keywords,
        coping_suggestions: log.copingSuggestions,
        created_at: log.createdAt
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': state.settings.supabase_key,
          'Authorization': `Bearer ${state.user.token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast('Synced journal log to cloud database.', 'success');
        return true;
      } else {
        const errText = await res.text();
        console.error('Supabase write failure:', errText);
        showToast('Supabase write error, saved locally.', 'warning');
        return false;
      }
    } catch (e) {
      console.warn('Offline: unable to sync log to Supabase. Will retry later.', e);
      return false;
    }
  }

  // OpenRouter completions
  async function fetchOpenRouterAIResponse(userMessage) {
    if (!state.settings.openrouter_key) {
      throw new Error('No OpenRouter API key found in Settings.');
    }

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Assemble history for context
    const chatContext = [
      {
        role: 'system',
        content: `You are Aura, an empathetic mental wellness companion for students preparing for highly competitive academic exams (like JEE, NEET, UPSC, SSC, and Board Exams).
         Respond supportively, call out exam stress keywords naturally, and suggest coping mechanism tips.
         Keep answers warm, clear, under 4 sentences, and never use bullet points or HTML formatting.`
      },
      ...state.chatHistory.slice(-6), // last 6 messages
      { role: 'user', content: userMessage }
    ];

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.settings.openrouter_key}`,
        'HTTP-Referer': 'https://aurawellness.local',
        'X-Title': 'Aura Wellness Tracker'
      },
      body: JSON.stringify({
        model: state.settings.model || 'mistralai/mistral-7b-instruct',
        messages: chatContext
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter API responded with status ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  /* ==========================================================================
     UI Component Update Functions (zero-trust DOM inserts)
     ========================================================================== */
  
  function updateDashboardUI() {
    const streakEl = document.querySelector('#stat-streak .stat-value');
    const wellnessEl = document.querySelector('#stat-wellness .stat-value');
    const moodEl = document.querySelector('#stat-mood .stat-value');
    const sleepEl = document.querySelector('#stat-sleep .stat-value');
    
    if (state.logs.length === 0) {
      streakEl.textContent = '0';
      wellnessEl.textContent = '—';
      moodEl.textContent = '—';
      sleepEl.textContent = '—';
      updateBurnoutPredictionUI(0);
      renderLatestEntryPreview(null);
      return;
    }

    // Calculate Streak
    let streak = 0;
    const sortedLogs = [...state.logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Check daily streak consecutive log days
    let currentDayCheck = new Date();
    currentDayCheck.setHours(0,0,0,0);
    
    for (let i = 0; i < sortedLogs.length; i++) {
      const logDate = new Date(sortedLogs[i].createdAt);
      logDate.setHours(0,0,0,0);
      
      const diffTime = Math.abs(currentDayCheck - logDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0 || diffDays === 1) {
        streak++;
        currentDayCheck = logDate;
      } else if (diffDays > 1 && i === 0) {
        // Streak broken today and yesterday
        break;
      } else {
        break;
      }
    }
    streakEl.textContent = streak.toString();

    // Take last 7 entries for averaging
    const last7Logs = sortedLogs.slice(0, 7);
    const avgWellness = Math.round(last7Logs.reduce((acc, log) => acc + log.wellnessScore, 0) / last7Logs.length);
    const avgMood = (last7Logs.reduce((acc, log) => acc + log.mood, 0) / last7Logs.length).toFixed(1);
    const avgSleep = (last7Logs.reduce((acc, log) => acc + log.sleepHours, 0) / last7Logs.length).toFixed(1);

    wellnessEl.textContent = `${avgWellness}/100`;
    moodEl.textContent = `${avgMood}/10`;
    sleepEl.textContent = `${avgSleep}h`;

    // Burnout Prediction based on recent metrics
    const recentStress = last7Logs.reduce((acc, log) => acc + log.stressLevel, 0) / last7Logs.length;
    const recentSleep = last7Logs.reduce((acc, log) => acc + log.sleepHours, 0) / last7Logs.length;
    const recentKeywords = last7Logs.reduce((acc, log) => acc + (log.keywords ? log.keywords.length : 0), 0) / last7Logs.length;
    const burnoutPred = window.Core.calculateBurnoutPrediction(recentStress, recentSleep, recentKeywords);
    
    updateBurnoutPredictionUI(burnoutPred);
    renderLatestEntryPreview(sortedLogs[0]);
  }

  function updateBurnoutPredictionUI(score) {
    const fill = document.getElementById('burnout-fill');
    const badge = document.getElementById('burnout-badge');
    const barTrack = document.querySelector('.progress-bar-track');
    const region = document.getElementById('burnout-region');

    if (!fill || !badge) return;

    fill.style.width = `${score}%`;
    barTrack.setAttribute('aria-valuenow', score.toString());

    // Update risk level label & colors
    badge.className = 'burnout-score-badge';
    let label = 'Low Risk';
    if (score === 0 && state.logs.length === 0) {
      badge.classList.add('burnout-low');
      badge.textContent = 'No data yet';
      region.textContent = 'Burnout risk: No data yet';
      return;
    }

    if (score >= 65) {
      badge.classList.add('burnout-high');
      label = `High Risk (${score}/100)`;
    } else if (score >= 35) {
      badge.classList.add('burnout-moderate');
      label = `Moderate Risk (${score}/100)`;
    } else {
      badge.classList.add('burnout-low');
      label = `Low Risk (${score}/100)`;
    }
    
    badge.textContent = label;
    region.textContent = `Burnout risk updated. Level: ${label}.`;
  }

  function renderLatestEntryPreview(log) {
    const container = document.getElementById('latest-entry');
    if (!container) return;
    clearElement(container);

    if (!log) {
      const p = document.createElement('p');
      p.className = 'empty-state-msg';
      p.textContent = 'No entries yet. Go to the Journal tab to start tracking.';
      container.appendChild(p);
      return;
    }

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '8px';

    const date = document.createElement('span');
    date.style.fontWeight = '700';
    date.style.color = 'var(--accent)';
    date.textContent = new Date(log.createdAt).toLocaleDateString(undefined, { 
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
    });
    header.appendChild(date);

    const scores = document.createElement('span');
    scores.style.fontSize = '12px';
    scores.style.color = 'var(--text-secondary)';
    scores.textContent = `Wellness: ${log.wellnessScore} · Burnout: ${log.burnoutScore}`;
    header.appendChild(scores);
    container.appendChild(header);

    const pText = document.createElement('p');
    pText.style.fontSize = '14px';
    pText.style.color = 'var(--text-primary)';
    pText.style.whiteSpace = 'pre-wrap';
    pText.style.overflow = 'hidden';
    pText.style.textOverflow = 'ellipsis';
    pText.style.display = '-webkit-box';
    pText.style.webkitLineClamp = '3';
    pText.style.webkitBoxOrient = 'vertical';
    pText.textContent = log.journalText;
    container.appendChild(pText);
  }

  // Highlight stress keywords in journal outputs
  function highlightText(text, keywords) {
    const fragment = document.createDocumentFragment();
    if (!keywords || keywords.length === 0) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    // Sort keywords by length descending to match larger strings first
    const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
    const escapedKws = sortedKws.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedKws.join('|')})\\b`, 'gi');

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];

      // text preceding match
      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
      }

      const mark = document.createElement('mark');
      mark.className = 'log-highlight';
      mark.textContent = matchText;
      fragment.appendChild(mark);

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    return fragment;
  }

  function renderHistoryLogs() {
    const list = document.getElementById('history-list');
    if (!list) return;
    clearElement(list);

    if (state.logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      
      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '📭';
      empty.appendChild(icon);

      const msg = document.createElement('p');
      msg.className = 'empty-state-msg';
      msg.textContent = 'No entries yet. Your history will appear here after your first journal submission.';
      empty.appendChild(msg);

      list.appendChild(empty);
      return;
    }

    // Sort newest first
    const sorted = [...state.logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sorted.forEach(log => {
      const item = document.createElement('div');
      item.className = 'log-item';

      const header = document.createElement('div');
      header.className = 'log-header';

      const date = document.createElement('span');
      date.className = 'log-date';
      date.textContent = new Date(log.createdAt).toLocaleDateString(undefined, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      header.appendChild(date);

      const chips = document.createElement('div');
      chips.className = 'log-metrics';

      const mChip = document.createElement('span');
      mChip.className = 'log-metric-chip';
      mChip.textContent = `Mood: ${log.mood}/10`;
      chips.appendChild(mChip);

      const sChip = document.createElement('span');
      sChip.className = 'log-metric-chip';
      sChip.textContent = `Sleep: ${log.sleepHours}h`;
      chips.appendChild(sChip);

      const stChip = document.createElement('span');
      stChip.className = 'log-metric-chip';
      stChip.textContent = `Stress: ${log.stressLevel}/10`;
      chips.appendChild(stChip);

      const wChip = document.createElement('span');
      wChip.className = 'log-metric-chip';
      wChip.style.borderColor = 'var(--accent)';
      wChip.textContent = `Wellness Score: ${log.wellnessScore}`;
      chips.appendChild(wChip);

      header.appendChild(chips);
      item.appendChild(header);

      // Body text with highlighted words
      const body = document.createElement('div');
      body.className = 'log-body';
      body.appendChild(highlightText(log.journalText, log.keywords));
      item.appendChild(body);

      // Coping advice if stored
      if (log.copingSuggestions && log.copingSuggestions.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'log-footer';
        
        const bold = document.createElement('strong');
        bold.textContent = 'Strategy applied: ';
        footer.appendChild(bold);
        
        const textSpan = document.createElement('span');
        textSpan.textContent = log.copingSuggestions.join(' ');
        footer.appendChild(textSpan);
        
        item.appendChild(footer);
      }

      list.appendChild(item);
    });
  }

  /* ==========================================================================
     SVG Progress Charts Construction
     ========================================================================== */
  
  function renderCharts() {
    renderWellnessChart();
    renderMoodStressChart();
  }

  function renderWellnessChart() {
    const container = document.getElementById('chart-wellness');
    if (!container) return;
    clearElement(container);

    if (state.logs.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state-msg';
      p.textContent = 'Needs journal logs to compile trend line.';
      container.appendChild(p);
      return;
    }

    // Get last 7 logs, oldest first (so time flows left to right)
    const sorted = [...state.logs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const data = sorted.slice(-7);

    const width = 500;
    const height = 200;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-label", "Line graph showing wellness score trends over the last 7 entries.");
    svg.setAttribute("role", "img");

    // Grid lines (y = 0, 25, 50, 75, 100)
    for (let i = 0; i <= 4; i++) {
      const scoreVal = i * 25;
      const y = height - paddingBottom - (scoreVal / 100) * (height - paddingTop - paddingBottom);
      
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", paddingLeft.toString());
      line.setAttribute("y1", y.toString());
      line.setAttribute("x2", (width - paddingRight).toString());
      line.setAttribute("y2", y.toString());
      line.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", (paddingLeft - 8).toString());
      label.setAttribute("y", (y + 4).toString());
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "end");
      label.textContent = scoreVal.toString();
      svg.appendChild(label);
    }

    // Plot points
    const pointsCount = data.length;
    const xStep = pointsCount > 1 ? (width - paddingLeft - paddingRight) / (pointsCount - 1) : 0;
    const coordinates = [];

    data.forEach((log, index) => {
      const x = pointsCount > 1 ? paddingLeft + index * xStep : (width - paddingLeft - paddingRight) / 2 + paddingLeft;
      const y = height - paddingBottom - (log.wellnessScore / 100) * (height - paddingTop - paddingBottom);
      coordinates.push({ x, y, val: log.wellnessScore, date: new Date(log.createdAt) });
    });

    // Draw area under curve
    if (coordinates.length > 1) {
      const areaPath = document.createElementNS(SVG_NS, "path");
      let d = `M ${coordinates[0].x} ${height - paddingBottom}`;
      coordinates.forEach(c => {
        d += ` L ${c.x} ${c.y}`;
      });
      d += ` L ${coordinates[coordinates.length - 1].x} ${height - paddingBottom} Z`;
      
      areaPath.setAttribute("d", d);
      areaPath.setAttribute("fill", "rgba(108, 143, 255, 0.08)");
      svg.appendChild(areaPath);
    }

    // Draw line connecting points
    if (coordinates.length > 1) {
      const linePath = document.createElementNS(SVG_NS, "path");
      let d = `M ${coordinates[0].x} ${coordinates[0].y}`;
      for (let i = 1; i < coordinates.length; i++) {
        d += ` L ${coordinates[i].x} ${coordinates[i].y}`;
      }
      linePath.setAttribute("d", d);
      linePath.setAttribute("stroke", "#6c8fff");
      linePath.setAttribute("stroke-width", "3");
      linePath.setAttribute("fill", "none");
      linePath.setAttribute("stroke-linecap", "round");
      svg.appendChild(linePath);
    }

    // Draw dots and text
    coordinates.forEach(c => {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", c.x.toString());
      circle.setAttribute("cy", c.y.toString());
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", "#6c8fff");
      circle.setAttribute("stroke", "#090a10");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);

      // Value text
      const valTxt = document.createElementNS(SVG_NS, "text");
      valTxt.setAttribute("x", c.x.toString());
      valTxt.setAttribute("y", (c.y - 8).toString());
      valTxt.setAttribute("fill", "var(--text-primary)");
      valTxt.setAttribute("font-size", "9");
      valTxt.setAttribute("font-weight", "bold");
      valTxt.setAttribute("text-anchor", "middle");
      valTxt.textContent = c.val.toString();
      svg.appendChild(valTxt);

      // Date labels on X axis
      const dateTxt = document.createElementNS(SVG_NS, "text");
      dateTxt.setAttribute("x", c.x.toString());
      dateTxt.setAttribute("y", (height - 12).toString());
      dateTxt.setAttribute("fill", "var(--text-muted)");
      dateTxt.setAttribute("font-size", "9");
      dateTxt.setAttribute("text-anchor", "middle");
      dateTxt.textContent = c.date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
      svg.appendChild(dateTxt);
    });

    container.appendChild(svg);
  }

  function renderMoodStressChart() {
    const container = document.getElementById('chart-moodstress');
    if (!container) return;
    clearElement(container);

    if (state.logs.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state-msg';
      p.textContent = 'Needs journal logs to compile trend line.';
      container.appendChild(p);
      return;
    }

    const sorted = [...state.logs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const data = sorted.slice(-7);

    const width = 500;
    const height = 200;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-label", "Line graph showing daily mood levels compared against daily stress levels.");
    svg.setAttribute("role", "img");

    // Grid lines (y = 1, 3, 5, 7, 10)
    const steps = [1, 3, 5, 7, 10];
    steps.forEach(val => {
      const y = height - paddingBottom - ((val - 1) / 9) * (height - paddingTop - paddingBottom);
      
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", paddingLeft.toString());
      line.setAttribute("y1", y.toString());
      line.setAttribute("x2", (width - paddingRight).toString());
      line.setAttribute("y2", y.toString());
      line.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", (paddingLeft - 8).toString());
      label.setAttribute("y", (y + 4).toString());
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "end");
      label.textContent = val.toString();
      svg.appendChild(label);
    });

    // Plot coordinates
    const pointsCount = data.length;
    const xStep = pointsCount > 1 ? (width - paddingLeft - paddingRight) / (pointsCount - 1) : 0;
    
    const moodCoords = [];
    const stressCoords = [];

    data.forEach((log, index) => {
      const x = pointsCount > 1 ? paddingLeft + index * xStep : (width - paddingLeft - paddingRight) / 2 + paddingLeft;
      const yMood = height - paddingBottom - ((log.mood - 1) / 9) * (height - paddingTop - paddingBottom);
      const yStress = height - paddingBottom - ((log.stressLevel - 1) / 9) * (height - paddingTop - paddingBottom);
      
      moodCoords.push({ x, y: yMood, val: log.mood, date: new Date(log.createdAt) });
      stressCoords.push({ x, y: yStress, val: log.stressLevel });
    });

    // Draw Mood Line
    if (moodCoords.length > 1) {
      const moodPath = document.createElementNS(SVG_NS, "path");
      let d = `M ${moodCoords[0].x} ${moodCoords[0].y}`;
      for (let i = 1; i < moodCoords.length; i++) {
        d += ` L ${moodCoords[i].x} ${moodCoords[i].y}`;
      }
      moodPath.setAttribute("d", d);
      moodPath.setAttribute("stroke", "#52d9a0");
      moodPath.setAttribute("stroke-width", "2.5");
      moodPath.setAttribute("fill", "none");
      moodPath.setAttribute("stroke-linecap", "round");
      svg.appendChild(moodPath);
    }

    // Draw Stress Line
    if (stressCoords.length > 1) {
      const stressPath = document.createElementNS(SVG_NS, "path");
      let d = `M ${stressCoords[0].x} ${stressCoords[0].y}`;
      for (let i = 1; i < stressCoords.length; i++) {
        d += ` L ${stressCoords[i].x} ${stressCoords[i].y}`;
      }
      stressPath.setAttribute("d", d);
      stressPath.setAttribute("stroke", "#ff6b8a");
      stressPath.setAttribute("stroke-width", "2.5");
      stressPath.setAttribute("fill", "none");
      stressPath.setAttribute("stroke-linecap", "round");
      svg.appendChild(stressPath);
    }

    // Dots and dates
    moodCoords.forEach((c, idx) => {
      // Mood Dot
      const mCircle = document.createElementNS(SVG_NS, "circle");
      mCircle.setAttribute("cx", c.x.toString());
      mCircle.setAttribute("cy", c.y.toString());
      mCircle.setAttribute("r", "4");
      mCircle.setAttribute("fill", "#52d9a0");
      mCircle.setAttribute("stroke", "#090a10");
      mCircle.setAttribute("stroke-width", "1.5");
      svg.appendChild(mCircle);

      // Stress Dot
      const sc = stressCoords[idx];
      const sCircle = document.createElementNS(SVG_NS, "circle");
      sCircle.setAttribute("cx", sc.x.toString());
      sCircle.setAttribute("cy", sc.y.toString());
      sCircle.setAttribute("r", "4");
      sCircle.setAttribute("fill", "#ff6b8a");
      sCircle.setAttribute("stroke", "#090a10");
      sCircle.setAttribute("stroke-width", "1.5");
      svg.appendChild(sCircle);

      // Date labels on X axis
      const dateTxt = document.createElementNS(SVG_NS, "text");
      dateTxt.setAttribute("x", c.x.toString());
      dateTxt.setAttribute("y", (height - 12).toString());
      dateTxt.setAttribute("fill", "var(--text-muted)");
      dateTxt.setAttribute("font-size", "9");
      dateTxt.setAttribute("text-anchor", "middle");
      dateTxt.textContent = c.date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
      svg.appendChild(dateTxt);
    });

    container.appendChild(svg);
  }

  /* ==========================================================================
     Breathing Coach Core Logic (CSS Transitions & Timers)
     ========================================================================== */
  
  function setBreathingState(active) {
    state.breathActive = active;
    
    const startBtn = document.getElementById('btn-breath-start');
    const stopBtn = document.getElementById('btn-breath-stop');
    
    if (active) {
      startBtn.setAttribute('disabled', 'true');
      stopBtn.removeAttribute('disabled');
      state.breathPhaseIndex = 0;
      state.breathCycleCount = 1;
      runBreathingTick();
    } else {
      startBtn.removeAttribute('disabled');
      stopBtn.setAttribute('disabled', 'true');
      if (state.breathTimer) {
        clearInterval(state.breathTimer);
        state.breathTimer = null;
      }
      
      // Reset circle scale
      const circle = document.getElementById('breathing-circle');
      circle.style.transition = 'transform 1.5s ease-out';
      circle.style.transform = 'scale(1.0)';
      
      document.getElementById('breathing-phase').textContent = 'Ready';
      document.getElementById('breathing-countdown').textContent = '';
      document.getElementById('breathing-instruction').textContent = 'Press start to begin your breathing session.';
      document.getElementById('breathing-status').textContent = 'Session stopped.';
      
      clearElement(document.getElementById('breathing-dots'));
    }
  }

  function runBreathingTick() {
    const phases = BREATH_PHASES[state.breathMode];
    const currentPhase = phases[state.breathPhaseIndex];
    state.breathTimeRemaining = currentPhase.duration;

    // Visual updates
    const phaseLabel = document.getElementById('breathing-phase');
    const countdown = document.getElementById('breathing-countdown');
    const instruction = document.getElementById('breathing-instruction');
    const status = document.getElementById('breathing-status');
    const circle = document.getElementById('breathing-circle');

    phaseLabel.textContent = currentPhase.name;
    countdown.textContent = state.breathTimeRemaining.toString();
    instruction.textContent = currentPhase.instruction;

    // Accessibility updates
    const a11yMsg = `${currentPhase.name} phase. Duration ${currentPhase.duration} seconds. ${currentPhase.instruction}`;
    status.textContent = a11yMsg;

    // Expand or shrink circle using transition
    circle.style.transition = `transform ${currentPhase.duration}s cubic-bezier(0.4, 0, 0.2, 1)`;
    circle.style.transform = `scale(${currentPhase.scale})`;

    updateBreathingProgressDots();

    if (state.breathTimer) clearInterval(state.breathTimer);
    
    state.breathTimer = setInterval(() => {
      state.breathTimeRemaining--;
      if (state.breathTimeRemaining >= 0) {
        countdown.textContent = state.breathTimeRemaining.toString();
      }
      
      if (state.breathTimeRemaining <= 0) {
        clearInterval(state.breathTimer);
        
        // Cycle phase transition
        state.breathPhaseIndex++;
        if (state.breathPhaseIndex >= phases.length) {
          state.breathPhaseIndex = 0;
          state.breathCycleCount++;
          if (state.breathCycleCount > 4) {
            // End session after 4 complete cycles
            showToast('Well done! You have completed your breathing session.', 'success');
            setBreathingState(false);
            return;
          }
        }
        runBreathingTick();
      }
    }, 1000);
  }

  function updateBreathingProgressDots() {
    const container = document.getElementById('breathing-dots');
    if (!container) return;
    clearElement(container);

    const phases = BREATH_PHASES[state.breathMode];
    phases.forEach((p, idx) => {
      const dot = document.createElement('div');
      dot.className = 'breath-dot';
      if (idx === state.breathPhaseIndex) {
        dot.classList.add('active');
        dot.setAttribute('aria-current', 'step');
      }
      container.appendChild(dot);
    });
  }

  /* ==========================================================================
     Chatbot Management (History States & OpenRouter Falls)
     ========================================================================== */
  
  function appendChatMessage(role, text) {
    const messagesWrap = document.getElementById('chat-messages');
    if (!messagesWrap) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble bubble-${role}`;

    // Sanitization and highlight insertion
    const cleanText = window.Core.sanitizeHTML(text);
    const textNodes = highlightText(cleanText, window.Core.ACADEMIC_KEYWORDS);
    bubble.appendChild(textNodes);

    messagesWrap.appendChild(bubble);
    messagesWrap.scrollTop = messagesWrap.scrollHeight;

    // Add to rolling history
    if (role !== 'system') {
      state.chatHistory.push({ role, content: text });
      if (state.chatHistory.length > 10) {
        state.chatHistory.shift();
      }
    }
  }

  async function handleUserChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendChatMessage('user', text);

    // Show typing
    const typing = document.getElementById('chat-typing');
    typing.style.display = 'flex';

    try {
      if (state.settings.openrouter_key) {
        // Fetch from cloud AI
        const aiResponse = await fetchOpenRouterAIResponse(text);
        typing.style.display = 'none';
        appendChatMessage('assistant', aiResponse);
      } else {
        // Simulate local fallback response
        throw new Error('Fallback trigger');
      }
    } catch (e) {
      // Offline or missing key - local AI Companion response
      setTimeout(() => {
        typing.style.display = 'none';
        
        // Scan for stress keywords in current chat log
        const detectedKeywords = window.Core.scanJournalForStressKeywords(text);
        
        // Fetch metrics from latest log if available to adapt simulated response
        const latest = state.logs[0] || { mood: 5, stressLevel: 5 };
        const response = window.Core.getMockCompanionResponse(
          latest.mood, 
          latest.stressLevel, 
          detectedKeywords.length > 0 ? detectedKeywords : ['general']
        );
        
        if (!state.settings.openrouter_key) {
          appendChatMessage('system', 'Aura is in offline simulated mode. Add an OpenRouter key in settings to enable cloud AI.');
        } else {
          appendChatMessage('system', 'Network connection issue. Reverted to local companion simulation.');
        }
        appendChatMessage('assistant', response);
      }, 1000);
    }
  }

  /* ==========================================================================
     Supabase Auth overlay functions
     ========================================================================== */
  
  async function submitAuth(mode) {
    const email = document.getElementById(mode === 'login' ? 'auth-email' : 'auth-signup-email').value.trim();
    const password = document.getElementById(mode === 'login' ? 'auth-password' : 'auth-signup-password').value.trim();
    const errorEl = document.getElementById(mode === 'login' ? 'auth-error' : 'auth-signup-error');

    errorEl.textContent = '';

    if (!state.settings.supabase_url || !state.settings.supabase_key) {
      errorEl.textContent = 'Please configure Supabase Project URL and Anon key in Settings first.';
      return;
    }

    if (!email || !password) {
      errorEl.textContent = 'Please fill out all fields.';
      return;
    }

    const btn = document.getElementById(mode === 'login' ? 'btn-auth-login' : 'btn-auth-signup');
    btn.setAttribute('disabled', 'true');

    try {
      let response;
      if (mode === 'login') {
        const url = `${state.settings.supabase_url}/auth/v1/token?grant_type=password`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': state.settings.supabase_key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });
      } else {
        const url = `${state.settings.supabase_url}/auth/v1/signup`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': state.settings.supabase_key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });
      }

      if (response.ok) {
        const data = await response.json();
        // Capture user session details
        state.user = {
          id: data.user.id,
          email: data.user.email,
          token: data.access_token
        };
        localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(state.user));
        
        showToast(mode === 'login' ? 'Logged in successfully.' : 'Account registered. Check email confirmation.', 'success');
        document.getElementById('auth-overlay').classList.remove('open');
        updateAuthButtonUI();
        
        // Trigger load cloud logs
        loadLogsFromSupabase();
      } else {
        const err = await response.json();
        errorEl.textContent = err.error_description || err.message || 'Authentication failed.';
      }
    } catch (e) {
      errorEl.textContent = 'Network error: could not connect to Supabase.';
    } finally {
      btn.removeAttribute('disabled');
    }
  }

  function updateAuthButtonUI() {
    const authBtn = document.getElementById('btn-open-auth');
    if (!authBtn) return;
    
    if (state.user) {
      authBtn.className = 'btn btn-ghost btn-icon';
      authBtn.style.color = 'var(--color-success)';
      authBtn.setAttribute('aria-label', `Logged in as ${state.user.email}. Click to sign out.`);
      authBtn.onclick = () => {
        if (confirm('Sign out from Aura cloud sync?')) {
          state.user = null;
          localStorage.removeItem(STORAGE_AUTH_KEY);
          showToast('Signed out.', 'info');
          updateAuthButtonUI();
          window.location.reload();
        }
      };
    } else {
      authBtn.className = 'btn btn-ghost btn-icon';
      authBtn.style.color = 'var(--text-secondary)';
      authBtn.setAttribute('aria-label', 'Sign in or create account');
      authBtn.onclick = () => document.getElementById('auth-overlay').classList.add('open');
    }
  }

  /* ==========================================================================
     Tab Control & Initializers
     ========================================================================== */
  
  function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Switch buttons selected state
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.setAttribute('aria-selected', 'false');
      }
    });

    // Switch panels visibility
    document.querySelectorAll('.tab-panel').forEach(panel => {
      if (panel.id === `tab-${tabId}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Handle view specific rendering
    if (tabId === 'history') {
      renderHistoryLogs();
    } else if (tabId === 'charts') {
      renderCharts();
    }
  }

  // Populate 5 days of dummy historical logs for demonstration
  function populateDemoData() {
    const demoLogs = [
      {
        id: "demo-5",
        mood: 4,
        sleepHours: 5,
        activityMinutes: 15,
        stressLevel: 8,
        journalText: "Studying JEE maths is completely overwhelming. The coaching center mock test rankings were released today and I dropped. I feel so far behind on the syllabus backlog.",
        wellnessScore: 42,
        burnoutScore: 72,
        keywords: ["jee", "coaching", "mock test", "syllabus", "backlog"],
        copingSuggestions: ["Analyze the errors, index concepts that failed, and keep a mistake journal.", "Divide large backlogs into small, 30-minute daily slots."],
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "demo-4",
        mood: 5,
        sleepHours: 6,
        activityMinutes: 0,
        stressLevel: 7,
        journalText: "NEET test series went poorly. Missed my physics target marks. Struggling to review chemistry revisions and manage coaching classes.",
        wellnessScore: 52,
        burnoutScore: 60,
        keywords: ["neet", "test series", "marks", "physics", "chemistry", "coaching"],
        copingSuggestions: ["Competitive preparation is a marathon. Maintain daily consistency and study desks breaks."],
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "demo-3",
        mood: 6,
        sleepHours: 6.5,
        activityMinutes: 30,
        stressLevel: 6,
        journalText: "Feeling slightly better today. Completed syllabus physics revision for boards exam. Mock test marks are still stressing me out though.",
        wellnessScore: 65,
        burnoutScore: 48,
        keywords: ["syllabus", "physics", "revision", "boards", "mock test", "marks"],
        copingSuggestions: ["Mock test scores are markers for learning, not final verdicts."],
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "demo-2",
        mood: 7,
        sleepHours: 7.5,
        activityMinutes: 45,
        stressLevel: 4,
        journalText: "Worked on mathematics syllabus backlog. Got a decent mock test score. Slept well last night.",
        wellnessScore: 82,
        burnoutScore: 36,
        keywords: ["maths", "syllabus", "backlog", "mock test"],
        copingSuggestions: ["Keep practicing box breathing to lower cortisol levels."],
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "demo-1",
        mood: 8,
        sleepHours: 8,
        activityMinutes: 20,
        stressLevel: 3,
        journalText: "Had a productive day. coaching revision went smoothly. Feeling prepared for Board Exams.",
        wellnessScore: 88,
        burnoutScore: 24,
        keywords: ["coaching", "revision", "boards"],
        copingSuggestions: ["Celebrate your effort today. Consistency matters far more than perfection."],
        createdAt: new Date().toISOString()
      }
    ];

    state.logs = demoLogs;
    localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(state.logs));
    updateDashboardUI();
    showToast('Loaded 5 days of dummy historical logs.', 'success');
    
    // Autofill text area
    const journalTextarea = document.getElementById('input-journal');
    if (journalTextarea) {
      journalTextarea.value = "I am feeling extremely overwhelmed. My UPSC mock tests are going terrible, and my marks are stuck at 85. The syllabus is massive, the exam is in three weeks, and my backlog of history and geography is piling up. My coaching institute ranks are dropping. I feel like a failure.";
      // Trigger detection
      journalTextarea.dispatchEvent(new Event('input'));
    }

    switchTab('dashboard');
  }

  // DOM elements initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Load local logs & settings
    const storedLogs = localStorage.getItem(STORAGE_LOGS_KEY);
    if (storedLogs) {
      try {
        state.logs = JSON.parse(storedLogs);
      } catch(e) {
        state.logs = [];
      }
    }

    const storedSettings = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (storedSettings) {
      try {
        state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
      } catch(e) {}
    }

    const storedAuth = localStorage.getItem(STORAGE_AUTH_KEY);
    if (storedAuth) {
      try {
        state.user = JSON.parse(storedAuth);
      } catch(e) {}
    }

    // Sync input settings elements in drawer modal
    document.getElementById('setting-or-key').value = state.settings.openrouter_key || '';
    document.getElementById('setting-model').value = state.settings.model || 'mistralai/mistral-7b-instruct';
    document.getElementById('setting-sb-url').value = state.settings.supabase_url || '';
    document.getElementById('setting-sb-key').value = state.settings.supabase_key || '';

    // Init UI
    updateAuthButtonUI();
    updateDashboardUI();
    appendChatMessage('assistant', 'Hello. I am Aura, your wellness mentor. Preparing for competitive exams is demanding. Feel free to talk to me about preparation pressure, mock tests, backlogs, or study plans.');

    // CSP-compliant event listeners
    const clearDataBtn = document.getElementById('btn-clear-data');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', () => {
        if (confirm('Delete all local journal entries? This cannot be undone.')) {
          localStorage.removeItem(STORAGE_LOGS_KEY);
          window.location.reload();
        }
      });
    }

    if (state.user) {
      loadLogsFromSupabase();
    }

    // Tab buttons event listeners
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // Range slider updates
    const sliders = [
      { id: 'input-mood', valId: 'val-mood' },
      { id: 'input-sleep', valId: 'val-sleep' },
      { id: 'input-stress', valId: 'val-stress' },
      { id: 'input-activity', valId: 'val-activity' }
    ];

    sliders.forEach(s => {
      const input = document.getElementById(s.id);
      const output = document.getElementById(s.valId);
      if (input && output) {
        input.addEventListener('input', (e) => {
          output.textContent = e.target.value;
          input.setAttribute('aria-valuenow', e.target.value);
        });
      }
    });

    // Live keyword badges updates
    const journalTextarea = document.getElementById('input-journal');
    if (journalTextarea) {
      journalTextarea.addEventListener('input', (e) => {
        const text = e.target.value;
        const keywords = window.Core.scanJournalForStressKeywords(text);
        const badgesContainer = document.getElementById('keyword-badges');
        const copingBox = document.getElementById('coping-suggestion');
        
        clearElement(badgesContainer);

        if (keywords.length > 0) {
          keywords.forEach(kw => {
            const badge = document.createElement('span');
            badge.className = 'keyword-badge';
            badge.textContent = kw;
            badgesContainer.appendChild(badge);
          });

          // Generate dynamic coping advice
          const tempMood = document.getElementById('input-mood').value;
          const tempStress = document.getElementById('input-stress').value;
          const tempSleep = document.getElementById('input-sleep').value;
          const tempActivity = document.getElementById('input-activity').value;
          const score = window.Core.calculateWellnessScore(tempMood, tempSleep, tempActivity, tempStress);
          const burnout = window.Core.calculateBurnoutPrediction(tempStress, tempSleep, keywords.length);
          const suggestions = window.Core.generateCopingSuggestions(score, burnout, keywords);

          if (suggestions.length > 0) {
            copingBox.querySelector('.coping-text').textContent = suggestions[0];
            copingBox.style.display = 'block';
          } else {
            copingBox.style.display = 'none';
          }
        } else {
          copingBox.style.display = 'none';
        }
      });
    }

    // Submit Log Entry
    const form = document.getElementById('journal-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const mood = Number(document.getElementById('input-mood').value);
        const sleep = Number(document.getElementById('input-sleep').value);
        const stress = Number(document.getElementById('input-stress').value);
        const activity = Number(document.getElementById('input-activity').value);
        const journal = document.getElementById('input-journal').value.trim();

        if (!journal) {
          showToast('Journal text is required before saving.', 'danger');
          return;
        }

        const keywords = window.Core.scanJournalForStressKeywords(journal);
        const wellnessScore = window.Core.calculateWellnessScore(mood, sleep, activity, stress);
        const burnoutScore = window.Core.calculateBurnoutPrediction(stress, sleep, keywords.length);
        const copingSuggestions = window.Core.generateCopingSuggestions(wellnessScore, burnoutScore, keywords);

        const newLog = {
          id: 'log-' + Date.now(),
          mood,
          sleepHours: sleep,
          activityMinutes: activity,
          stressLevel: stress,
          journalText: journal,
          wellnessScore,
          burnoutScore,
          keywords,
          copingSuggestions,
          createdAt: new Date().toISOString()
        };

        // Save locally
        state.logs.unshift(newLog);
        localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(state.logs));
        showToast('Journal entry saved locally.', 'success');

        // Reset inputs
        form.reset();
        document.getElementById('val-mood').textContent = '5';
        document.getElementById('val-sleep').textContent = '7';
        document.getElementById('val-stress').textContent = '5';
        document.getElementById('val-activity').textContent = '30';
        clearElement(document.getElementById('keyword-badges'));
        document.getElementById('coping-suggestion').style.display = 'none';

        // Update dashboard views
        updateDashboardUI();

        // Sync with Supabase in background
        if (state.settings.supabase_url && state.settings.supabase_key && state.user) {
          syncLogToSupabase(newLog);
        }

        // Switch to dashboard view
        switchTab('dashboard');
      });
    }

    // Load dummy demo buttons
    document.querySelectorAll('#btn-quick-demo, #btn-load-demo').forEach(btn => {
      btn.addEventListener('click', () => {
        populateDemoData();
      });
    });

    // Settings drawer overlays event listeners
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsDrawer = document.getElementById('settings-drawer');
    const closeSettings = document.getElementById('btn-close-settings');
    const openSettings = document.getElementById('btn-open-settings');
    const saveSettings = document.getElementById('btn-save-settings');

    if (openSettings) {
      openSettings.addEventListener('click', () => {
        settingsOverlay.classList.add('open');
      });
    }

    const hideDrawer = () => {
      settingsOverlay.classList.remove('open');
    };

    if (closeSettings) closeSettings.addEventListener('click', hideDrawer);
    if (settingsOverlay) {
      settingsOverlay.addEventListener('click', (e) => {
        if (!settingsDrawer.contains(e.target)) hideDrawer();
      });
    }

    if (saveSettings) {
      saveSettings.addEventListener('click', () => {
        const orKey = document.getElementById('setting-or-key').value.trim();
        const model = document.getElementById('setting-model').value;
        const sbUrl = document.getElementById('setting-sb-url').value.trim();
        const sbKey = document.getElementById('setting-sb-key').value.trim();

        state.settings = {
          openrouter_key: orKey,
          model,
          supabase_url: sbUrl,
          supabase_key: sbKey
        };

        localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(state.settings));
        showToast('Settings saved successfully.', 'success');
        hideDrawer();
        updateAuthButtonUI();
      });
    }

    // Auth Overlay toggles
    const authOverlay = document.getElementById('auth-overlay');
    const closeAuth = document.getElementById('btn-close-auth');
    if (closeAuth) {
      closeAuth.addEventListener('click', () => {
        authOverlay.classList.remove('open');
      });
    }

    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.getAttribute('data-mode');
        document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        document.querySelectorAll('.auth-panel').forEach(p => {
          if (p.getAttribute('data-mode') === mode) {
            p.style.display = 'flex';
          } else {
            p.style.display = 'none';
          }
        });
      });
    });

    // Auth Submits
    const loginBtn = document.getElementById('btn-auth-login');
    const signupBtn = document.getElementById('btn-auth-signup');
    if (loginBtn) loginBtn.addEventListener('click', () => submitAuth('login'));
    if (signupBtn) signupBtn.addEventListener('click', () => submitAuth('signup'));

    // Breathing coach cycle clicks
    document.querySelectorAll('.breath-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.breath-mode-btn').forEach(b => {
          b.className = 'btn btn-secondary breath-mode-btn';
          b.setAttribute('aria-pressed', 'false');
        });
        e.currentTarget.className = 'btn btn-primary breath-mode-btn';
        e.currentTarget.setAttribute('aria-pressed', 'true');

        state.breathMode = e.currentTarget.getAttribute('data-mode');
        setBreathingState(false);
      });
    });

    // Breathing control clicks
    const startBreath = document.getElementById('btn-breath-start');
    const stopBreath = document.getElementById('btn-breath-stop');
    if (startBreath) {
      startBreath.addEventListener('click', () => {
        setBreathingState(true);
      });
    }
    if (stopBreath) {
      stopBreath.addEventListener('click', () => {
        setBreathingState(false);
      });
    }

    // Chatbot companion event listeners
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    if (chatSend) {
      chatSend.addEventListener('click', () => {
        handleUserChatMessage();
      });
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleUserChatMessage();
        }
      });
    }
  });

})();
