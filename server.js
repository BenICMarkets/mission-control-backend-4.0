const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'online', version: '2.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// AI endpoint — calls Claude from Railway (US server), bypasses SA geo-block
app.post('/api/ai', async (req, res) => {
  const { message, projects } = req.body;
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ message: 'ANTHROPIC_API_KEY not set in Railway Variables.', updates: [] });
  }
  try {
    const system = `You are a project management AI. Interpret commands and respond with pure JSON only.
Projects: ${JSON.stringify(projects)}
Today: ${new Date().toISOString().split('T')[0]}
Respond ONLY with this JSON format:
{"message":"confirmation or answer","updates":[
  {"type":"log_time","projectId":"...","hours":3,"date":"YYYY-MM-DD","note":"..."},
  {"type":"complete_milestone","projectId":"...","milestoneId":"..."},
  {"type":"update_status","projectId":"...","status":"active|planning|paused|launched|archived"},
  {"type":"add_revenue","projectId":"...","amount":5000},
  {"type":"add_expense","projectId":"...","name":"...","amount":800},
  {"type":"add_milestone","projectId":"...","name":"...","dueDate":"..."},
  {"type":"add_task","projectId":"...","name":"...","status":"todo","hours":0},
  {"type":"update_priority","projectId":"...","priority":2}
]}
Match project names case-insensitively. Return empty updates array for questions. PURE JSON ONLY — no markdown, no explanation.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ message: data.error.message, updates: [] });

    const text = data.content?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { parsed = { message: text, updates: [] }; }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ message: `Server error: ${err.message}`, updates: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mission Control running on port ${PORT}`));
