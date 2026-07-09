import Layout from '../../../components/Layout'
import CategoriesPanel from './CategoriesPanel'

export default function ManagerCategories() {
  return (
    <Layout role="manager">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <CategoriesPanel />
      </div>
    </Layout>
  )
}
