import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Sparkles, User, X as XIcon } from 'lucide-react'

const roleNames = {
  manager: 'Manager',
  department: 'Department Staff',
  staffMember: 'Staff Member',
  admin: 'System Admin',
}

const assistantSuggestions = {
  manager: ['Generate quick report', 'Check allocation status', 'Show availability'],
  department: ['Create urgent request', 'Track my request', 'Cancel a request'],
  staffMember: ['Update availability', 'Start a task', 'Upload proof'],
  admin: ['Reset a password', 'Review security logs', 'Explain audit logs'],
}

const normalizeRole = (role) => ({
  system_admin: 'admin',
  staff_member: 'staffMember',
  department_staff: 'department',
}[role] || role)

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
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isOpen])

  const requestGeminiReply = async (message, nextMessages) => {
    const response = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        role,
        history: nextMessages.slice(-8),
      }),
    })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
      ? await response.json()
      : { error: `Expected JSON from /api/chatbot but received ${contentType || 'a non-JSON response'}.` }
    if (!response.ok) throw new Error(data.error || 'Gemini request failed.')
    return data.reply
  }

  const sendMessage = async (message) => {
    const trimmed = message.trim()
    if (!trimmed || isSending) return
    const userMsg = { role: 'user', content: trimmed, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setIsSending(true)

    try {
      const reply = await requestGeminiReply(trimmed, nextMessages)
      setMessages(prev => [...prev, { role: 'bot', content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (addNotification) addNotification(`Chatbot: ${reply.substring(0, 50)}...`)
    } catch (error) {
      const errorReply = `AI error: ${error.message}`
      setMessages(prev => [...prev, { role: 'bot', content: errorReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (addNotification) addNotification(`Chatbot: ${error.message}`)
    } finally {
      setIsSending(false)
    }
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
            {isSending && (
              <div className="flex gap-2 justify-start">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                <div className="px-4 py-2 rounded-2xl max-w-xs text-sm bg-gray-100 text-gray-500">Thinking...</div>
              </div>
            )}
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
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask the assistant..." className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" disabled={isSending} />
              <button type="submit" className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-2 rounded-lg disabled:opacity-60" aria-label="Send message" disabled={isSending}><Send className="w-5 h-5" /></button>
            </form>
          </div>
        </section>
      )}
    </>
  )
}
