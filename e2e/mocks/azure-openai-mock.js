const http = require('http')

const PORT = process.env.MOCK_AZURE_PORT || 4010

// Stands in for Azure OpenAI's chat/completions endpoint for AI-04 (tool-selection routing).
// Always returns BOTH tool calls in the same turn, regardless of the input message — the point of
// this test is app/api/agent/route.js's own precedence rule (prefer create_recurring_contract when
// both are present), not what the real model would decide to call for a given prompt. Real model
// behavior (day-name/time parsing, intent recognition) is out of scope here — manual-only, per the
// coverage map.
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404)
    res.end()
    return
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    const payload = {
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_schedule_mock',
              type: 'function',
              function: {
                name: 'propose_weekly_schedule',
                arguments: JSON.stringify({ start_date: '2026-08-10', end_date: '2026-08-17' }),
              },
            },
            {
              id: 'call_contract_mock',
              type: 'function',
              function: {
                name: 'create_recurring_contract',
                arguments: JSON.stringify({
                  contracts: [{
                    customer_name: 'AI-ROUTING-TEST Customer',
                    service_type: 'Home Cleaning',
                    days_of_week: ['monday'],
                    start_time: '19:00',
                    end_time: '21:00',
                    start_date: '2026-08-10',
                    end_date: '2026-08-16',
                  }],
                }),
              },
            },
          ],
        },
      }],
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
})

server.listen(PORT, () => {
  console.log(`Mock Azure OpenAI server listening on ${PORT}`)
})
