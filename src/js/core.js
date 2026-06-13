/**
 * core.js - Pure calculations, scoring logic, and sanitization functions.
 * Decoupled from DOM operations. Exported for both browser and Node/Jest testing.
 */

/**
 * Calculates a wellness score from 0 to 100 based on mood, sleep, physical activity, and stress.
 * Mood: 1 to 10 (higher is better)
 * Sleep Hours: 0 to 12 (7-9 is optimal)
 * Physical Activity: 0 to 120 (in minutes, 30-60 is optimal)
 * Stress Level: 1 to 10 (lower is better)
 */
function calculateWellnessScore(mood, sleepHours, physicalActivity, stressLevel) {
  // Validate and clamp inputs
  const parsedMood = (mood !== undefined && mood !== null && !isNaN(Number(mood))) ? Number(mood) : 5;
  const parsedSleep = (sleepHours !== undefined && sleepHours !== null && !isNaN(Number(sleepHours))) ? Number(sleepHours) : 7;
  const parsedActivity = (physicalActivity !== undefined && physicalActivity !== null && !isNaN(Number(physicalActivity))) ? Number(physicalActivity) : 30;
  const parsedStress = (stressLevel !== undefined && stressLevel !== null && !isNaN(Number(stressLevel))) ? Number(stressLevel) : 5;

  const m = Math.max(1, Math.min(10, parsedMood));
  const s = Math.max(0, Math.min(12, parsedSleep));
  const a = Math.max(0, Math.min(120, parsedActivity));
  const str = Math.max(1, Math.min(10, parsedStress));

  // 1. Mood contribution: max 40 points
  const moodScore = (m / 10) * 40;

  // 2. Sleep contribution: max 30 points (optimal 7-9 hours)
  let sleepScore = 0;
  if (s >= 7 && s <= 9) {
    sleepScore = 30;
  } else if (s < 7) {
    // Subtract 10 points for every hour below 7
    sleepScore = Math.max(0, 30 - (7 - s) * 10);
  } else {
    // Subtract 5 points for every hour above 9
    sleepScore = Math.max(0, 30 - (s - 9) * 5);
  }

  // 3. Physical activity contribution: max 15 points (optimal 30+ minutes)
  const activityScore = (Math.min(a, 30) / 30) * 15;

  // 4. Stress contribution: max 15 points (lower stress = higher score)
  // stress level 1 -> 15 points, stress level 10 -> 1.5 points
  const stressScore = ((11 - str) / 10) * 15;

  const total = moodScore + sleepScore + activityScore + stressScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

// Academic stress keywords to match in journal logs
const ACADEMIC_KEYWORDS = [
  'mock test',
  'percentile',
  'rank',
  'syllabus',
  'coaching',
  'boards',
  'board exam',
  'neet',
  'jee',
  'upsc',
  'ias',
  'ips',
  'backlog',
  'cutoff',
  'physics',
  'chemistry',
  'maths',
  'biology',
  'revision',
  'test series',
  'marks',
  'score',
  'aspirant',
  'pressure',
  'exam',
  'coaching institute',
  'preparation',
  'prelims',
  'mains'
];

/**
 * Scans a journal text for academic stress keywords.
 * Returns an array of matched unique keywords (lowercase).
 */
function scanJournalForStressKeywords(text) {
  if (typeof text !== 'string') return [];
  const normalized = text.toLowerCase();
  
  return ACADEMIC_KEYWORDS.filter(keyword => {
    // Use word boundaries or basic substring checking
    // Match the keyword as a substring safely (e.g. "mock tests" matches "mock test")
    return normalized.includes(keyword);
  });
}

/**
 * Calculates a burnout risk score from 0 to 100.
 * stressLevel: 1 to 10
 * sleepHours: 0 to 12
 * matchingKeywordsCount: number of detected academic keywords
 */
function calculateBurnoutPrediction(stressLevel, sleepHours, matchingKeywordsCount) {
  const parsedStress = (stressLevel !== undefined && stressLevel !== null && !isNaN(Number(stressLevel))) ? Number(stressLevel) : 5;
  const parsedSleep = (sleepHours !== undefined && sleepHours !== null && !isNaN(Number(sleepHours))) ? Number(sleepHours) : 7;
  const parsedKw = (matchingKeywordsCount !== undefined && matchingKeywordsCount !== null && !isNaN(Number(matchingKeywordsCount))) ? Number(matchingKeywordsCount) : 0;

  const str = Math.max(1, Math.min(10, parsedStress));
  const s = Math.max(0, Math.min(12, parsedSleep));
  const kwCount = Math.max(0, parsedKw);

  // 1. Stress level contribution: max 60 points
  const stressWeight = (str / 10) * 60;

  // 2. Sleep deprivation contribution: max 20 points (added if sleep is under 6 hours)
  let sleepDeprivationWeight = 0;
  if (s < 6) {
    sleepDeprivationWeight = (6 - s) * 4; // max 24 points, cap to 20
    if (sleepDeprivationWeight > 20) sleepDeprivationWeight = 20;
  }

  // 3. Keyword count contribution: max 20 points
  const keywordWeight = Math.min(kwCount, 5) * 4;

  const total = stressWeight + sleepDeprivationWeight + keywordWeight;
  return Math.round(Math.max(0, Math.min(100, total)));
}

/**
 * Generates array of coping suggestions based on scores and detected keywords.
 */
function generateCopingSuggestions(wellnessScore, burnoutScore, keywords) {
  const suggestions = [];

  // 1. Keyword-based responses
  if (keywords.includes('mock test') || keywords.includes('test series') || keywords.includes('marks') || keywords.includes('percentile')) {
    suggestions.push("Mock test scores are markers for learning, not final verdicts. Analyze the errors, index concepts that failed, and keep a mistake journal.");
  }
  
  if (keywords.includes('syllabus') || keywords.includes('backlog')) {
    suggestions.push("Divide large backlogs into small, 30-minute daily slots. Do not try to complete it all at once; consistent progression is key.");
  }

  if (keywords.includes('coaching') || keywords.includes('rank')) {
    suggestions.push("Your personal value is separate from coaching center rankings. Steer clear of toxic competitor comparison circles.");
  }

  if (keywords.includes('jee') || keywords.includes('neet') || keywords.includes('upsc') || keywords.includes('boards')) {
    suggestions.push("Competitive preparation is a marathon. Maintain daily consistency, eat nourishing meals, and step away from study desks every 2 hours.");
  }

  // 2. Score-based responses
  if (burnoutScore >= 65) {
    suggestions.push("High burnout risk detected. Protect your mind: suspend study sessions for 30 minutes, go outside, or engage in deep box breathing.");
  }

  if (wellnessScore < 50) {
    suggestions.push("Low wellness average. Set a strict bedtime tonight, aim for 7.5 hours of sleep, and spend 15 minutes walking in natural light.");
  }

  // Add default encouragement if suggestions list is short
  if (suggestions.length < 2) {
    suggestions.push("Keep practicing box breathing (4-4-4-4) to lower cortisol levels and calm your sympathetic nervous system.");
    suggestions.push("Celebrate your effort today. Consistency matters far more than perfection.");
  }

  // Cap suggestions to top 3
  return suggestions.slice(0, 3);
}

/**
 * Escapes HTML characters to prevent cross-site scripting (XSS).
 */
function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Simulates AI Companion fallback responses.
 */
function getMockCompanionResponse(mood, stressLevel, keywords) {
  const m = Number(mood) || 5;
  const s = Number(stressLevel) || 5;
  
  let examMentions = keywords.filter(k => ['jee', 'neet', 'upsc', 'boards'].includes(k));
  let examName = examMentions.length > 0 ? examMentions[0].toUpperCase() : 'your exams';

  if (keywords.includes('mock test') || keywords.includes('percentile') || keywords.includes('marks')) {
    return `I hear you, and it is completely normal to feel distressed about mock test scores. In competitive exams like ${examName}, mock tests are diagnostic tools, not your final capability. Let's focus on analyzing your errors systematically and keeping study blocks short. Remember to pace yourself!`;
  }

  if (keywords.includes('backlog') || keywords.includes('syllabus')) {
    return `Syllabus pressure is real. When backlogs pile up, it can feel paralyzing. Try selecting just one small topic to cover today. Can you spend 25 minutes on it, then take a 5-minute break? You don't have to fix everything today; small steps count.`;
  }

  if (s >= 8) {
    return `Your stress levels are very high right now (${s}/10). Let's take a momentary pause from your preparation. Close your eyes, let your shoulders drop, and navigate to the 'Breathe' tab for a few cycles of Box Breathing. You've got this, one breath at a time.`;
  }

  if (m <= 3) {
    return `I'm sorry you are feeling low today. Exam preparation takes a massive toll on energy and mood. Please ensure you are sleeping at least 7 hours and eating regularly. Your physical health is the foundation of your mental resilience.`;
  }

  return `Thank you for sharing. Preparing for competitive exams is a test of stamina and mental peace. Remember that your scores do not define your human worth. Keep going, take regular breaks, and protect your peace.`;
}

// Export for Node/Jest testing and Browser global environment
const Core = {
  calculateWellnessScore,
  scanJournalForStressKeywords,
  calculateBurnoutPrediction,
  generateCopingSuggestions,
  sanitizeHTML,
  getMockCompanionResponse,
  ACADEMIC_KEYWORDS
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = Core;
} else {
  window.Core = Core;
}
