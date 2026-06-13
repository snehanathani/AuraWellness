/**
 * core.test.js - 15 Comprehensive Jest Unit Tests for Core Business Logic.
 * Covers wellness scoring, stress keyword scanning, burnout prediction,
 * coping suggestions, and HTML XSS sanitization.
 */

const Core = require('../src/js/core');

describe('Aura Mental Wellness Tracker - Core Calculations', () => {

  // 1. calculateWellnessScore - Normal typical values
  test('calculateWellnessScore returns correct score for typical moderate inputs', () => {
    // Mood=7 (28 pts), Sleep=7.5 (30 pts), Activity=30 (15 pts), Stress=4 (10.5 pts) -> ~84
    const score = Core.calculateWellnessScore(7, 7.5, 30, 4);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(85);
  });

  // 2. calculateWellnessScore - Perfect inputs (max score 100)
  test('calculateWellnessScore yields 100 for ideal mental/physical state', () => {
    // Mood=10 (40 pts), Sleep=8 (30 pts), Activity=60 (15 pts), Stress=1 (15 pts) -> 100
    const score = Core.calculateWellnessScore(10, 8, 60, 1);
    expect(score).toBe(100);
  });

  // 3. calculateWellnessScore - Worst inputs
  test('calculateWellnessScore yields minimal score for highly distressed state', () => {
    // Mood=1 (4 pts), Sleep=0 (0 pts), Activity=0 (0 pts), Stress=10 (1.5 pts) -> ~6
    const score = Core.calculateWellnessScore(1, 0, 0, 10);
    expect(score).toBeLessThanOrEqual(10);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  // 4. calculateWellnessScore - Invalid / NaN parameters fallback
  test('calculateWellnessScore falls back to reasonable defaults on invalid inputs', () => {
    const score = Core.calculateWellnessScore('bad_string', null, undefined, NaN);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // 5. calculateWellnessScore - Excessive sleep penalty
  test('calculateWellnessScore applies penalty for oversleeping (e.g. 12 hours)', () => {
    // Sleep=12 hours: 30 - (12-9)*5 = 15 points (loses 15 points)
    const scoreNormal = Core.calculateWellnessScore(8, 8, 30, 3);
    const scoreOversleep = Core.calculateWellnessScore(8, 12, 30, 3);
    expect(scoreOversleep).toBeLessThan(scoreNormal);
  });

  // 6. scanJournalForStressKeywords - Multiple keywords present
  test('scanJournalForStressKeywords identifies JEE and NEET exam keywords', () => {
    const text = 'I am preparing for JEE and NEET mock tests. The syllabus backlog is worrying.';
    const matches = Core.scanJournalForStressKeywords(text);
    expect(matches).toContain('jee');
    expect(matches).toContain('neet');
    expect(matches).toContain('mock test');
    expect(matches).toContain('syllabus');
    expect(matches).toContain('backlog');
    expect(matches.length).toBe(5);
  });

  // 7. scanJournalForStressKeywords - Case insensitivity check
  test('scanJournalForStressKeywords is fully case-insensitive', () => {
    const text = 'UPSC PRELIMS and MAINS syllabus needs REVISION for board exam.';
    const matches = Core.scanJournalForStressKeywords(text);
    expect(matches).toContain('upsc');
    expect(matches).toContain('prelims');
    expect(matches).toContain('mains');
    expect(matches).toContain('syllabus');
    expect(matches).toContain('revision');
    expect(matches).toContain('board exam');
  });

  // 8. scanJournalForStressKeywords - No matches
  test('scanJournalForStressKeywords returns empty array when no keywords match', () => {
    const text = 'I went for a walk in the forest and watched the sunset. Feeling very happy.';
    const matches = Core.scanJournalForStressKeywords(text);
    expect(matches).toEqual([]);
  });

  // 9. scanJournalForStressKeywords - Null / undefined safe handling
  test('scanJournalForStressKeywords returns empty array for non-string inputs', () => {
    expect(Core.scanJournalForStressKeywords(null)).toEqual([]);
    expect(Core.scanJournalForStressKeywords(undefined)).toEqual([]);
    expect(Core.scanJournalForStressKeywords(12345)).toEqual([]);
  });

  // 10. calculateBurnoutPrediction - Zero stress, good sleep
  test('calculateBurnoutPrediction scores low risk for high sleep and low stress', () => {
    // Stress=1 (6 pts), Sleep=8 (0 pts), Keywords=0 (0 pts) -> 6
    const score = Core.calculateBurnoutPrediction(1, 8, 0);
    expect(score).toBe(6);
  });

  // 11. calculateBurnoutPrediction - Worst case scaling (capped at 100)
  test('calculateBurnoutPrediction caps risk to 100 in high-distress scenarios', () => {
    // Stress=10 (60 pts), Sleep=3 (12 pts), Keywords=10 (20 pts) -> 92
    // If stress=10, sleep=0 (20 pts), keywords=10 (20 pts) -> 100
    const score = Core.calculateBurnoutPrediction(10, 0, 10);
    expect(score).toBe(100);
  });

  // 12. calculateBurnoutPrediction - Graceful fallbacks
  test('calculateBurnoutPrediction handles invalid values without breaking', () => {
    const score = Core.calculateBurnoutPrediction('high', 'none', -5);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // 13. generateCopingSuggestions - Specific keyword prompts
  test('generateCopingSuggestions returns target suggestions for backlog and mock tests', () => {
    const suggestions = Core.generateCopingSuggestions(50, 40, ['backlog', 'mock test']);
    const adviceText = suggestions.join(' ');
    expect(adviceText).toContain('mistake journal');
    expect(adviceText).toContain('backlogs into small');
  });

  // 14. generateCopingSuggestions - Score-driven overrides
  test('generateCopingSuggestions advises pausing studies during high burnout', () => {
    const suggestions = Core.generateCopingSuggestions(30, 80, []);
    const adviceText = suggestions.join(' ');
    expect(adviceText).toContain('High burnout risk detected');
    expect(adviceText).toContain('Set a strict bedtime tonight');
  });

  // 15. sanitizeHTML - XSS sanitization of dangerous tags and elements
  test('sanitizeHTML escapes HTML markup tags, quotes, and symbols to block XSS', () => {
    const malicious = '<script>alert("XSS")</script> & href="javascript:void(0)"';
    const escaped = Core.sanitizeHTML(malicious);
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
    expect(escaped).not.toContain('"');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
  });

  // 16. calculateWellnessScore - Activity boundary checks
  test('calculateWellnessScore differentiates between 0 and 120 minutes of activity', () => {
    const scoreZero = Core.calculateWellnessScore(5, 7, 0, 5);
    const scoreMax = Core.calculateWellnessScore(5, 7, 120, 5);
    expect(scoreMax).toBeGreaterThan(scoreZero);
  });

  // 17. scanJournalForStressKeywords - Overlapping keywords uniqueness
  test('scanJournalForStressKeywords returns a unique list of keywords even if repeated', () => {
    const text = 'syllabus syllabus backlog backlog board exam';
    const matches = Core.scanJournalForStressKeywords(text);
    const uniques = [...new Set(matches)];
    expect(uniques.length).toBe(matches.length);
    expect(matches).toContain('syllabus');
    expect(matches).toContain('backlog');
    expect(matches).toContain('board exam');
  });

  // 18. generateCopingSuggestions - High wellness, high stress
  test('generateCopingSuggestions handles high wellness and high stress scenario', () => {
    const suggestions = Core.generateCopingSuggestions(90, 75, ['mock test']);
    const adviceText = suggestions.join(' ');
    expect(adviceText).toContain('High burnout risk detected');
    expect(adviceText.toLowerCase()).toContain('mock test');
  });

  // 19. getMockCompanionResponse - Positive mood, high stress
  test('getMockCompanionResponse offers box breathing when stress is very high', () => {
    const response = Core.getMockCompanionResponse(8, 9, ['jee']);
    expect(response).toContain('Breathe');
    expect(response).toContain('Box Breathing');
  });

  // 20. calculateBurnoutPrediction - Moderate stress, high keyword count
  test('calculateBurnoutPrediction calculates moderate risk for average stress but high academic load indicators', () => {
    const score = Core.calculateBurnoutPrediction(5, 7, 8); // stress=5 (30 pts), sleep=7 (0 pts), keywords=8 (20 pts) -> 50
    expect(score).toBe(50);
  });

});
