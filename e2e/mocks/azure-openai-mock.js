const http = require('http')

const PORT = process.env.MOCK_AZURE_PORT || 4010

// Stands in for Azure OpenAI's chat/completions endpoint.
//
// Mode 1 (AI-04, tool-selection routing): the default response — always returns BOTH tool calls
// in the same turn, regardless of the input message. The point of that test is
// app/api/agent/route.js's own precedence rule (prefer create_recurring_contract when both are
// present), not what the real model would decide to call for a given prompt.
//
// Mode 2 (REC-06/07/09/10/11, recurring-visit generation): a test-controlled trigger for
// propose_weekly_schedule ONLY, with an exact date range the test itself picks (so it can seed a
// recurring_bookings row and know precisely which date to inspect afterward). Activated when the
// last user message starts with "SCHEDULE_RANGE:" followed by a {start_date,end_date} JSON blob.
//
// Real model behavior (day-name/time parsing, intent recognition, prompt quality) is out of scope
// for both modes — manual-only, per the coverage map.
const SCHEDULE_RANGE_MARKER = 'SCHEDULE_RANGE:'

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404)
    res.end()
    return
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    let toolCalls
    let parsedBody
    try { parsedBody = JSON.parse(body) } catch (e) { parsedBody = null }
    const lastUserMessage = [...(parsedBody?.messages || [])].reverse().find((m) => m.role === 'user')?.content || ''

    if (lastUserMessage.startsWith(SCHEDULE_RANGE_MARKER)) {
      const range = JSON.parse(lastUserMessage.slice(SCHEDULE_RANGE_MARKER.length))
      toolCalls = [{
        id: 'call_schedule_mock',
        type: 'function',
        function: { name: 'propose_weekly_schedule', arguments: JSON.stringify(range) },
      }]
    } else {
      toolCalls = [
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
      ]
    }

    const payload = { choices: [{ message: { role: 'assistant', tool_calls: toolCalls } }] }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
})

server.listen(PORT, () => {
  console.log(`Mock Azure OpenAI server listening on ${PORT}`)
})
