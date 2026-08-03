import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { fetchBookingMessages, sendBookingMessage, subscribeToBookingMessages } from '../../lib/bookingMessages'
import { roleTheme } from '../config/roleTheme'

// Two-way chat thread for a single booking, reused by the department staff who created the
// request (src/actors/department/history/index.js) and the staff member assigned to it
// (src/actors/staff-member/dashboard/index.js) — the only two parties who can see it.
export default function BookingMessagesPanel({ bookingId, currentUserId, role, otherPartyLabel, notifyUserId, notifyContext, onClose }) {
  const theme = roleTheme[role] || roleTheme.manager
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    fetchBookingMessages(supabase, bookingId)
      .then(rows => { if (!cancelled) setMessages(rows) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    const channel = subscribeToBookingMessages(supabase, bookingId, (row) => {
      setMessages(prev => (prev.some(message => message.id === row.id) ? prev : [...prev, row]))
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [bookingId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError('')
    try {
      const row = await sendBookingMessage(supabase, { bookingId, senderId: currentUserId, message: body })
      setMessages(prev => (prev.some(message => message.id === row.id) ? prev : [...prev, row]))
      setDraft('')

      if (notifyUserId) {
        await supabase.from('notifications').insert({
          user_id: notifyUserId,
          title: 'New message',
          message: `New message on ${notifyContext}.`,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg max-h-[80vh] flex-col rounded-xl bg-white shadow-lg" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.icon}`}>
              <MessageCircle className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-gray-900">{otherPartyLabel}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400">No messages yet — start the conversation.</p>
          ) : (
            messages.map(message => {
              const isOwn = message.sender_id === currentUserId
              return (
                <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${isOwn ? `${theme.solid} text-white` : 'bg-gray-100 text-gray-800'}`}>
                    {!isOwn && <p className="mb-0.5 text-xs font-semibold opacity-70">{message.sender?.full_name || 'Unknown'}</p>}
                    <p className="whitespace-pre-wrap">{message.message}</p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-4 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
          <input
            type="text"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Type a message..."
            className={`flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition disabled:opacity-60 ${theme.solid}`}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
