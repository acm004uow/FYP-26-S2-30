import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Sparkles, User, X as XIcon } from 'lucide-react'

const roleNames = {
  manager: 'Manager',
  staffMember: 'Staff Member',
  admin: 'Owner',
  customer: 'Customer',
}

const CHATBOT_ROLE_THEME = {
  manager: {
    main: 'bg-blue-600',
    hover: 'hover:bg-blue-700',
    text: 'text-blue-600',
    lightBg: 'hover:bg-blue-50',
    border: 'hover:border-blue-300',
    ring: 'focus:ring-blue-300',
  },

  staffMember: {
    main: 'bg-emerald-700',
    hover: 'hover:bg-emerald-800',
    text: 'text-emerald-700',
    lightBg: 'hover:bg-emerald-50',
    border: 'hover:border-emerald-300',
    ring: 'focus:ring-emerald-300',
  },

  admin: {
    main: 'bg-purple-600',
    hover: 'hover:bg-purple-700',
    text: 'text-purple-600',
    lightBg: 'hover:bg-purple-50',
    border: 'hover:border-purple-300',
    ring: 'focus:ring-purple-300',
  },

  customer: {
    main: 'bg-sky-600',
    hover: 'hover:bg-sky-700',
    text: 'text-sky-600',
    lightBg: 'hover:bg-sky-50',
    border: 'hover:border-sky-300',
    ring: 'focus:ring-sky-300',
  },
}

const assistantSuggestions = {
  manager: ['Generate quick report', 'Check allocation status', 'Show availability'],
  staffMember: ['Update availability', 'Start a task', 'Upload proof'],
  admin: ['Reset a password', 'Review security logs', 'Explain audit logs'],
  customer: ['Check my booking status', 'How do I book a cleaning?', 'How do I cancel a booking?'],
}

const normalizeRole = (role) => ({
  system_admin: 'admin',
  staff_member: 'staffMember',
}[role] || role)

const formatChatText = (text) => String(text || '')
  .replace(/,?\s*open\s+\/tasks\/create\?role=dept/gi, ', open the task creation page')
  .replace(/\/tasks\/create\?role=dept/gi, 'the task creation page')
  .replace(/```[\s\S]*?```/g, block => block.replace(/```/g, ''))
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .trim()

const readChatbotResponse = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()

  const text = await response.text()
  const nextData = text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (nextData?.[1]) {
    try {
      const parsed = JSON.parse(nextData[1])
      return { error: parsed.err?.message || `Chatbot server returned ${response.status}.` }
    } catch {
      return { error: `Chatbot server returned ${response.status}.` }
    }
  }
  return { error: `Chatbot server returned ${response.status}.` }
}

export default function Chatbot({ role, addNotification }) {
  const [isOpen, setIsOpen] = useState(false)
  const normalizedRole = normalizeRole(role)
  const chatbotTheme =
    CHATBOT_ROLE_THEME[normalizedRole] || CHATBOT_ROLE_THEME.manager
  const messagesEndRef = useRef(null)
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: `Hello! I'm your AI assistant for ${roleNames[normalizedRole] || 'your dashboard'}`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isOpen])

  const requestGeminiReply = async (message, nextMessages) => {
    const { supabase } = await import('../../lib/supabaseClient')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/chatbot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        message,
        role,
        history: nextMessages.slice(-8),
      }),
    })
    const data = await readChatbotResponse(response)
    if (!response.ok) throw new Error(data.error || 'AI request failed.')
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
      const formattedReply = formatChatText(reply)
      setMessages(prev => [...prev, { role: 'bot', content: formattedReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (addNotification) addNotification(`Chatbot: ${reply.substring(0, 50)}...`)
    } catch (error) {
      const errorReply = formatChatText(`AI error: ${error.message}`)
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
          id="chatbot-toggle-button"
          aria-label="Open AI assistant"
          className={`fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-lg transition flex items-center justify-center z-50 ${chatbotTheme.main} ${chatbotTheme.hover}`}
          >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
      {isOpen && (
        <section className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden" style={{ height: '520px' }} aria-label="AI assistant">
          <div className={`text-white p-4 rounded-t-2xl flex justify-between items-center ${chatbotTheme.main}`}>
            <div className="flex items-center gap-2"><Bot className="w-5 h-5" /><h3 className="font-medium">Buddy</h3></div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-lg" aria-label="Close AI assistant"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${chatbotTheme.main}`}>
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div>
                  <div className={`px-4 py-2 rounded-2xl max-w-xs text-sm whitespace-pre-line leading-relaxed ${msg.role === 'user' ? `${chatbotTheme.main} text-white` : 'bg-gray-100 text-gray-800'}`}>{formatChatText(msg.content)}</div>
                  <p className={`mt-1 text-[10px] text-gray-400 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>{msg.time}</p>
                </div>
                {msg.role === 'user' && <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-gray-600" /></div>}
              </div>
            ))}
            {isSending && (
              <div className="flex gap-2 justify-start">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${chatbotTheme.main}`}><Bot className="w-4 h-4 text-white" /></div>
                <div className="px-4 py-2 rounded-2xl max-w-xs text-sm bg-gray-100 text-gray-500">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Sparkles className={`h-4 w-4 shrink-0 ${chatbotTheme.text}`} />
              {(assistantSuggestions[normalizedRole] || assistantSuggestions.manager).map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className={`shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs transition ${chatbotTheme.border} ${chatbotTheme.lightBg} ${chatbotTheme.text}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 border-t">
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask the assistant..." className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" disabled={isSending} />
              <button
                type="submit"
                className={`text-white p-2 rounded-lg transition disabled:opacity-60 ${chatbotTheme.main} ${chatbotTheme.hover}`}
                aria-label="Send message"
                disabled={isSending}
              ></button>
            </form>
          </div>
        </section>
      )}
    </>
  )
}
