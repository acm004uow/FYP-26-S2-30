import Layout from '../../../components/Layout'
import BookingsReviewPanel from '../bookings/BookingsReviewPanel'

// Manager/department-created tasks (from the New Task form), kept separate from the customer
// Bookings page (src/actors/manager/bookings/index.js) — see BookingsReviewPanel's sourceScope prop.
export default function ManagerTasks() {
  return (
    <Layout role="manager">
      <BookingsReviewPanel sourceScope="tasks" />
    </Layout>
  )
}
