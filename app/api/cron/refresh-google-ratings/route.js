import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchGooglePlaceRating } from '@/lib/googlePlaces'

// Runs daily (see vercel.json) so every linked company's cached Google rating stays reasonably
// fresh without the customer booking page ever having to call Google live (that page only reads
// profiles.google_rating/google_rating_count). Companies that haven't linked a Google listing yet
// are skipped entirely — they keep ranking on in-app reviews (see lib/companyDirectory.js).
export async function GET(request) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 })

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

    const supabase = createSupabaseAdmin()
    const { data: companies, error } = await supabase
      .from('profiles')
      .select('id,google_place_id')
      .eq('role', 'system_admin')
      .not('google_place_id', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let refreshed = 0
    const results = []
    for (const company of companies || []) {
      try {
        const place = await fetchGooglePlaceRating(company.google_place_id)
        await supabase
          .from('profiles')
          .update({
            google_place_name: place.name,
            google_rating: place.rating,
            google_rating_count: place.userRatingCount,
            google_rating_synced_at: new Date().toISOString(),
          })
          .eq('id', company.id)
        refreshed += 1
        results.push({ host_admin_id: company.id, ok: true })
      } catch (placeError) {
        results.push({ host_admin_id: company.id, ok: false, error: placeError.message })
      }
    }

    return NextResponse.json({ ok: true, processed: (companies || []).length, refreshed, results })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
