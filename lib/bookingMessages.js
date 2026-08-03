const SELECT_COLUMNS = 'id,booking_id,sender_id,message,created_at,sender:profiles!booking_messages_sender_id_fkey(full_name)'

// Two-way chat thread scoped to a single booking — read/written by the requester
// (bookings.created_by) and the assigned staff member (staff_profiles.user_id).
export async function fetchBookingMessages(supabase, bookingId) {
  const { data, error } = await supabase
    .from('booking_messages')
    .select(SELECT_COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function sendBookingMessage(supabase, { bookingId, senderId, message }) {
  const { data, error } = await supabase
    .from('booking_messages')
    .insert({ booking_id: bookingId, sender_id: senderId, message })
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data
}

// Caller owns the channel lifecycle (subscribe in useEffect, supabase.removeChannel on cleanup) —
// same pattern as the bookings channel in src/actors/staff-member/dashboard/index.js.
export function subscribeToBookingMessages(supabase, bookingId, onInsert) {
  return supabase
    .channel(`booking-messages-${bookingId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe()
}
