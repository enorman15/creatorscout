import { Navigate } from 'react-router-dom'

/** /home is the scaffold's post-sign-in route; the app's home is the dashboard. */
export default function HomePage() {
  return <Navigate to="/dashboard" replace />
}
