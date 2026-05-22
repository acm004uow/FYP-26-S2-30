import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Sparkles, User, X as XIcon } from 'lucide-react'

const roleNames = {
  manager: 'Manager',
  department: 'Department Staff',
  staffMember: 'Staff Member',
  admin: 'System Admin',
}

const assistantSuggestions = {
  manager: ['What needs attention?', 'How do recommendations work?', 'Where are reports?'],
  department: ['Create urgent request', 'Track my request', 'Cancel a request'],
  staffMember: ['Update availability', 'Start a task', 'Upload proof'],
  admin: ['Who are you?', 'How do I reset a password?', 'Explain audit logs'],
}

const roleHelp = {
  manager: {
    overview: 'I can help you review pending task requests, check staff availability, understand allocation recommendations, and find reports.',
    actions: 'Useful places: Task Requests for approvals, Staff Profiles for availability and workload, Reports for task and staff metrics.',
  },
  department: {
    overview: 'I can help you create task requests, track request status, mark urgent work, and understand what each request status means.',
    actions: 'Use New Request to submit work. Active Requests shows pending or approved work, and Completion History shows finished tasks.',
  },
  staffMember: {
    overview: 'I can help you manage assigned tasks, update availability, start work, complete tasks, upload proof, and check feedback.',
    actions: 'Use Toggle Status for availability. Open a task card to start it or mark it complete when proof is ready.',
  },
  admin: {
    overview: 'I help system admins manage accounts, reset passwords, monitor security logs, review audit logs, and tune global parameters.',
    actions: 'Use User Accounts for account changes, Security Logs for login/security events, Audit Logs for system activity, and Global Parameters for allocation settings.',
  },
}

const normalizeRole = (role) => ({
  system_admin: 'admin',
  staff_member: 'staffMember',
  department_staff: 'department',
}[role] || role)

const includesAny = (input, words) => words.some(word => input.includes(word))

function getBotResponse(userInput, role) {
  const input = userInput.toLowerCase()
  const normalizedRole = normalizeRole(role)
  const help = roleHelp[normalizedRole] || roleHelp.manager

  if (includesAny(input, ['who are you', 'what are you', 'your name', 'introduce', 'about you'])) {
    return `I'm your Smart Task Allocation assistant for ${roleNames[normalizedRole] || 'this dashboard'}. ${help.overview}`
  }

  if (includesAny(input, ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
    return `Hello! ${help.overview} What would you like to do next?`
  }

  if (includesAny(input, ['help', 'what can you do', 'menu', 'guide', 'support'])) {
    return `${help.overview}\n\n${help.actions}`
  }

  if (includesAny(input, ['where', 'open', 'go to', 'find', 'navigate'])) {
    if (includesAny(input, ['report', 'metric', 'analytics'])) return 'Open Reports from the top navigation to view task volume, completion, and staff metrics.'
    if (includesAny(input, ['staff', 'availability', 'workload'])) return 'Open Staff Profiles to review live availability, workload, skills, region, and ratings.'
    if (includesAny(input, ['request', 'allocation', 'approve', 'pending'])) return 'Open Task Requests to review pending requests and assign staff.'
    if (includesAny(input, ['admin', 'audit', 'security', 'parameter', 'user'])) return 'Open the Admin Panel. User Accounts, Security Logs, Audit Logs, and Global Parameters are all on that page.'
    return help.actions
  }

  if (includesAny(input, ['status', 'pending', 'approved', 'rejected', 'cancelled', 'completed', 'in progress'])) {
    return 'Status guide: Pending means waiting for manager review. Approved means staff has been assigned. In Progress means work has started. Completed means proof was submitted and the task is finished. Rejected or Cancelled means no further work is needed.'
  }

  if (includesAny(input, ['recommend', 'allocation', 'assign', 'best staff', 'suggest'])) {
    return 'Recommendations rank staff using availability, skills, assigned region, current workload, working-hour eligibility, and performance rating. Review the suggested staff before approving the request.'
  }

  if (includesAny(input, ['urgent', 'priority', 'high priority'])) {
    return 'For urgent work, create or edit the request with High priority. Managers should review high-priority pending requests first in Task Requests.'
  }

  if (includesAny(input, ['proof', 'upload', 'complete', 'finish'])) {
    return 'Open the assigned task, choose Mark Complete, attach proof if required, then confirm completion. The task will move into completed history.'
  }

  if (includesAny(input, ['availability', 'available', 'unavailable', 'busy', 'leave'])) {
    if (normalizedRole === 'staffMember') return 'Use Toggle Status on your dashboard to switch between Available and Unavailable. Managers will see the updated availability in staff views.'
    return 'Managers can check staff availability from Staff Profiles. Availability is updated from each staff member dashboard.'
  }

  if (includesAny(input, ['password', 'reset'])) {
    if (normalizedRole === 'admin') return 'In Admin Panel, find the user under User Accounts, click Reset, enter a temporary password, and confirm. Tell the user to change it after signing in.'
    return 'Password resets are handled by a System Admin from the Admin Panel.'
  }

  if (includesAny(input, ['audit', 'activity', 'history'])) {
    return 'Audit Logs show important system actions such as task creation, status changes, account updates, and parameter changes. Use them when troubleshooting who changed what and when.'
  }

  if (includesAny(input, ['security', 'login', 'failed', 'unauthorized'])) {
    return 'Security Logs show login and access events. Review failed authentication or suspicious access patterns first, then deactivate risky accounts if needed.'
  }

  if (includesAny(input, ['parameter', 'configuration', 'settings', 'threshold', 'radius', 'weight'])) {
    return 'Global Parameters affect allocation behavior. Workload Threshold limits task load, Proximity Radius controls distance matching, and Performance Weight adjusts how strongly ratings influence recommendations.'
  }

  if (normalizedRole === 'manager') {
    if (input.includes('report')) return 'Open Reports to generate the latest task and staff metrics from Supabase.'
    if (input.includes('task')) return 'Use Task Requests to review pending work, approve or reject requests, and assign staff with recommendation support.'
    return "I can help with reports, task requests, staff availability, recommendations, or allocation status. Try asking: 'What needs attention?'"
  }

  if (normalizedRole === 'department') {
    if (input.includes('task') || input.includes('request')) return 'Use New Request to submit a task. Active Requests lets you track whether it is pending, approved, or completed.'
    return "I can help you create, search, cancel, and track task requests. Try asking: 'How do I create an urgent request?'"
  }

  if (normalizedRole === 'staffMember') {
    if (input.includes('task')) return 'Your task cards show location, due date, priority, status, and available actions. Expand a card to start or complete work.'
    return "I can help with assigned tasks, availability, proof upload, or performance feedback. Try asking: 'How do I upload proof?'"
  }

  if (normalizedRole === 'admin') {
    return "I can help with user accounts, password resets, security logs, audit logs, and global parameters. Try asking: 'Explain audit logs' or 'How do I reset a password?'"
  }

  return 'Please ask about tasks, availability, reports, recommendations, proof upload, account management, logs, or allocation status.'
}

export default function Chatbot({ role, addNotification }) {
  const [isOpen, setIsOpen] = useState(false)
  const normalizedRole = normalizeRole(role)
  const messagesEndRef = useRef(null)
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: `Hello! I'm your AI assistant for ${roleNames[normalizedRole] || 'your dashboard'}. Ask me about tasks, accounts, reports, logs, or recommendations.`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }])
  const [input, setInput] = useState('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isOpen])

  const sendMessage = (message) => {
    const trimmed = message.trim()
    if (!trimmed) return
    const userMsg = { role: 'user', content: trimmed, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTimeout(() => {
      const reply = getBotResponse(trimmed, role)
      setMessages(prev => [...prev, { role: 'bot', content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (addNotification) addNotification(`Chatbot: ${reply.substring(0, 50)}...`)
    }, 300)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  return (
    <>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-green-500 text-white rounded-full shadow-lg hover:shadow-xl transition flex items-center justify-center z-50">
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
      {isOpen && (
        <section className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden" style={{ height: '520px' }} aria-label="AI assistant">
          <div className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
            <div className="flex items-center gap-2"><Bot className="w-5 h-5" /><h3 className="font-medium">AI Assistant</h3></div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-lg" aria-label="Close AI assistant"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>}
                <div>
                  <div className={`px-4 py-2 rounded-2xl max-w-xs text-sm whitespace-pre-line leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>{msg.content}</div>
                  <p className={`mt-1 text-[10px] text-gray-400 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>{msg.time}</p>
                </div>
                {msg.role === 'user' && <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-gray-600" /></div>}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
              {(assistantSuggestions[normalizedRole] || assistantSuggestions.manager).map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 border-t">
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask the assistant..." className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <button type="submit" className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-2 rounded-lg" aria-label="Send message"><Send className="w-5 h-5" /></button>
            </form>
          </div>
        </section>
      )}
    </>
  )
}
