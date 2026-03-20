import { CATEGORY_RULES } from "../rules/categoryRules.js";

export async function extractWebsiteIntelligence(page) {
  return page.evaluate((RULES) => {
    const text = (
      document.title +
      " " +
      document.body.innerText.slice(0, 6000)
    ).toLowerCase();

    const categoryScores = [];
    const websiteTags = new Set();

    for (const rule of RULES) {
      let score = 0;
      rule.keywords.forEach((k) => {
        if (text.includes(k)) score++;
      });

      if (score > 0) {
        categoryScores.push({ label: rule.label, score });
        rule.tags.forEach((t) => websiteTags.add(t));
      }
    }

    categoryScores.sort((a, b) => b.score - a.score);

    const categories = categoryScores.slice(0, 6).map((c) => c.label);
    const websiteType = categories[0] || "General Website";

    const relatedPhrases = categories.map(
      (c) => `websites similar to ${c.toLowerCase()} platforms`
    );

    return {
      websiteType,
      categories,
      websiteTags: [...websiteTags],
      relatedPhrases,
    };
  }, CATEGORY_RULES);
}