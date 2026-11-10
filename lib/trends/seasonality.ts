// lib/trends/seasonality.ts — PRD §24 Seasonal Engine.
// Evaluates multi-year / 12-month baseline cycles to identify topics likely
// to surge in the upcoming 30 to 60 days, providing dated historical evidence.

import type { SeasonalSurgeForecast } from "./types.ts";

interface SeasonalPattern {
  keywordRegex: RegExp;
  category: string;
  surgeMonths: number[]; // 0-indexed (0 = Jan, 11 = Dec)
  surgeWindowDays: number;
  topicName: string;
  historicalEvidenceTemplate: string;
  actionRecommendation: string;
}

const KNOWN_SEASONAL_PATTERNS: SeasonalPattern[] = [
  {
    keywordRegex: /(?:tax|w2|1099|deduction|write-off|accountant|irs|filing)/i,
    category: "finance",
    surgeMonths: [1, 2, 3], // Feb, Mar, Apr
    surgeWindowDays: 45,
    topicName: "Small Business & Freelance Tax Prep Checklist",
    historicalEvidenceTemplate: "Calendar prior, not measured from stored data: filing-season interest is expected between February and April.",
    actionRecommendation: "Publish printable deductible expense matrix and 1099 deadline flowchart 30 days prior to filing peak.",
  },
  {
    keywordRegex: /(?:syllabus|semester|college|study schedule|exam|dorm|freshman)/i,
    category: "education",
    surgeMonths: [7, 8, 0], // Aug, Sep, Jan
    surgeWindowDays: 30,
    topicName: "College Semester Organization & Study Planner",
    historicalEvidenceTemplate: "Calendar prior, not measured from stored data: back-to-school interest is expected in August, September and January.",
    actionRecommendation: "Release structured weekly course syllabus tracker and habit workbook.",
  },
  {
    keywordRegex: /(?:black friday|cyber monday|holiday gift|ecommerce inventory|q4 ad)/i,
    category: "business",
    surgeMonths: [9, 10], // Oct, Nov
    surgeWindowDays: 60,
    topicName: "E-Commerce Holiday Q4 Logistics & Ad Strategy Playbook",
    historicalEvidenceTemplate: "Calendar prior, not measured from stored data: holiday-quarter interest is expected from October to November.",
    actionRecommendation: "Bundle pre-launch promotional calendar with inventory risk checklist.",
  },
  {
    keywordRegex: /(?:resolution|new year|habit tracker|fitness routine|annual goal)/i,
    category: "productivity",
    surgeMonths: [11, 0], // Dec, Jan
    surgeWindowDays: 40,
    topicName: "New Year Goal Execution & Weekly Habit System",
    historicalEvidenceTemplate: "Calendar prior, not measured from stored data: new-year goal interest is expected in December and January.",
    actionRecommendation: "Prepare 90-day execution workbook and daily streak diagnostic printable.",
  },
  {
    keywordRegex: /(?:spring clean|garden|planting|seed starting|soil)/i,
    category: "lifestyle",
    surgeMonths: [2, 3, 4], // Mar, Apr, May
    surgeWindowDays: 45,
    topicName: "Spring Seed Starting & Garden Planting Calendar",
    historicalEvidenceTemplate: "Calendar prior, not measured from stored data: planting interest is expected from March to May.",
    actionRecommendation: "Publish zone-based planting calendar and soil amendment cheat sheet.",
  },
];

export function checkTopicSeasonality(
  topicName: string,
  observedMonthsWithSpikes: number[] = [],
  currentDate: Date = new Date()
): { isSeasonal: boolean; surgeMonths: number[]; reasoning?: string } {
  const currentMonth = currentDate.getUTCMonth();

  for (const pattern of KNOWN_SEASONAL_PATTERNS) {
    if (pattern.keywordRegex.test(topicName)) {
      const isCurrentlySurging = pattern.surgeMonths.includes(currentMonth);
      const isUpcoming = pattern.surgeMonths.some((m) => (m - currentMonth + 12) % 12 <= 2);
      const statusNote = isCurrentlySurging
        ? "Active annual peak window."
        : isUpcoming
          ? "Approaching annual peak window in next 60 days."
          : "Historical cyclical cluster.";

      return {
        isSeasonal: true,
        surgeMonths: pattern.surgeMonths,
        reasoning: `${pattern.historicalEvidenceTemplate} ${statusNote} (Observed seasonal cluster in months: ${pattern.surgeMonths.map(m => m + 1).join(", ")})`,
      };
    }
  }

  // Check empirical spikes in 12-month data if provided
  if (observedMonthsWithSpikes.length >= 1) {
    return {
      isSeasonal: true,
      surgeMonths: observedMonthsWithSpikes,
      reasoning: `Observed cyclical volume concentration in month(s) ${observedMonthsWithSpikes.map(m => m + 1).join(", ")} over 12m history.`,
    };
  }

  return { isSeasonal: false, surgeMonths: [] };
}

// A forecast is a calendar prior, not an observation: it is only returned for a pattern that
// matches the name of a stored market (`marketNames`). With no stored markets it returns nothing.
export function predictUpcomingSeasonalSurges(
  currentDate: Date = new Date(),
  marketNames: string[] = []
): SeasonalSurgeForecast[] {
  const currentMonth = currentDate.getUTCMonth();
  const nextMonth = (currentMonth + 1) % 12;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const forecasts: SeasonalSurgeForecast[] = [];

  for (const pattern of KNOWN_SEASONAL_PATTERNS) {
    if (!marketNames.some((n) => pattern.keywordRegex.test(n))) continue;
    // Check if the pattern's surge is either active now or peaks within next 60 days
    const thirdMonth = (currentMonth + 2) % 12;
    if (pattern.surgeMonths.includes(currentMonth) || pattern.surgeMonths.includes(nextMonth) || pattern.surgeMonths.includes(thirdMonth)) {
      const peakMonthIndex = pattern.surgeMonths[0];
      forecasts.push({
        topicName: pattern.topicName,
        category: pattern.category,
        expectedSurgeWindowDays: pattern.surgeWindowDays,
        peakCalendarMonth: monthNames[peakMonthIndex],
        historicalEvidence: pattern.historicalEvidenceTemplate,
        actionRecommendation: pattern.actionRecommendation,
      });
    }
  }

  return forecasts;
}
