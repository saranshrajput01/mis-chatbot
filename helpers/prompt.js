/**
 * Dynamic Prompt Generator
 * Takes tenant's schema + business description → generates AI system prompt
 */

function generateSystemPrompt(tenant) {
  const schema = tenant.schema_json;
  if (!schema || !schema.columns) return fallbackPrompt(tenant);

  const columnList = schema.columns.map(c => {
    let desc = `- ${c.name} (${c.type})`;
    if (c.samples && c.samples.length) desc += ` — e.g. ${c.samples.slice(0, 2).join(', ')}`;
    return desc;
  }).join('\n');

  return `You are a data assistant for "${tenant.name}".
${tenant.business_description ? `Business context: ${tenant.business_description}` : ''}

The user's data has ${schema.row_count} rows with these columns:
${columnList}

RULES:
1. Answer questions by analyzing the data provided in the context.
2. For aggregations (total, sum, average, count), compute from the data.
3. For numeric columns, treat comma-separated numbers as numbers (remove commas before math).
4. ALWAYS reply in English, regardless of the language the user writes in. Users may write in Hindi, English, or Hinglish — you understand all three but reply in clean English only.
5. Keep answers concise. Use bullet points for lists.
6. If data doesn't have the answer, say so honestly.
7. For date columns, understand relative dates (today, yesterday, last week, this month) — including their Hindi/Hinglish forms (aaj, kal, is hafte).
8. Format currency with ₹ symbol and commas (₹1,23,456).
9. CRITICAL — When multiple rows match a query:
   - ALWAYS give a summary first: total count of matching entries, total/sum of amount columns
   - Then show ALL unique entries (group by invoice/voucher number, show each with amount and date)
   - If more than 15 unique entries, show top 10 and say "There are X more entries — ask for a specific date/range to see them."
   - Ask: "Would you like details for a specific invoice/date/item?"
   - NEVER pick just one random value — always aggregate all matching rows
10. If user asks "what is X's amount/invoice" and X appears multiple times, give TOTAL of all entries + count of invoices.

IMPORTANT: You will receive the user's data as JSON rows in the context. Use ONLY that data to answer. Do not make up numbers.`;
}

function fallbackPrompt(tenant) {
  return `You are a helpful data assistant for "${tenant.name}".
${tenant.business_description || ''}
Answer questions about the user's data. ALWAYS reply in English (users may write in Hindi/English/Hinglish — understand all, reply in English only).
If you don't have enough data, say so honestly.`;
}

/**
 * Build the message payload for OpenAI with tenant data context
 */
function buildQueryMessages(tenant, userQuery, relevantData, totalRows) {
  const systemPrompt = tenant.system_prompt || generateSystemPrompt(tenant);

  // Allow up to 120K chars of data context (handles ~3000 rows)
  const dataStr = JSON.stringify(relevantData, null, 0);
  const maxLen = 120000;
  const truncated = dataStr.length > maxLen ? dataStr.slice(0, maxLen) + '...(truncated)' : dataStr;

  const totalNote = totalRows && totalRows > relevantData.length
    ? `\n(Note: Total database has ${totalRows} rows. Showing ${relevantData.length} most relevant rows matching the query. Compute answers from ALL provided rows.)`
    : '';

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `DATA (${relevantData.length} rows):${totalNote}\n${truncated}\n\nQUESTION: ${userQuery}` }
  ];
}

module.exports = { generateSystemPrompt, buildQueryMessages };
