/** 404 Not Found page. */
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
        404 — Page not found
      </h1>
      <p className="text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-touch items-center rounded-input bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2"
      >
        Go to Home
      </Link>
    </div>
  )
}
