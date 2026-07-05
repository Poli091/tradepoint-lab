/**
 * MODULE: API / groq.js
 * Groq (Llama 3.3 70B) — on-demand AI analysis.
 * No cache — always generates a fresh analysis on request.
 *
 * Used for: ticker deep-dives, earnings previews, risk summaries.
 */

import { API_KEYS, ENDPOINTS } from './config.js'

const BASE = ENDPOINTS.groq
const MODEL = 'llama-3.3-70b-versatile'

/**
 * Generate an AI analysis for a ticker.
 * @param {string} ticker
 * @param {object} context — fundamentals + analyst data to include in prompt
 * @returns {string} analysis text
 */
export async function analyzeTickerAI(ticker, context = {}) {
  if (!API_KEYS.groq) {
    throw new Error('Groq key not configured')
  }

  const { fundamentals, analyst, currentPrice, upside } = context

  const prompt = `You are a senior equity analyst. Provide a concise 3-paragraph analysis of ${ticker}.

Available data:
- Current price: ${currentPrice ? `$${currentPrice}` : 'N/A'}
- Analyst mean target: ${analyst?.targetMean ? `$${analyst.targetMean}` : 'N/A'}
- Implied upside: ${upside ? `${upside.toFixed(1)}%` : 'N/A'}
- Analyst consensus: ${analyst ? `${analyst.strongBuy} Strong Buy, ${analyst.buy} Buy, ${analyst.hold} Hold, ${analyst.sell} Sell` : 'N/A'}
- P/E ratio: ${fundamentals?.pe ?? 'N/A'}
- Revenue growth: ${fundamentals?.revenueGrowth ? `${(fundamentals.revenueGrowth * 100).toFixed(1)}%` : 'N/A'}
- Net margin: ${fundamentals?.netMargin ? `${(fundamentals.netMargin * 100).toFixed(1)}%` : 'N/A'}
- ROE: ${fundamentals?.roe ? `${(fundamentals.roe * 100).toFixed(1)}%` : 'N/A'}

Structure your response as:
1. Investment thesis (what's driving the bull case)
2. Key risks (what could go wrong)
3. Verdict (hold/add/trim recommendation with brief rationale)

Be direct and specific. No disclaimers. Max 200 words total.`

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEYS.groq}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Groq ${res.status}: ${err.error?.message ?? 'unknown error'}`)
  }

  const data = await res.json()
  return data.choices[0]?.message?.content ?? ''
}
