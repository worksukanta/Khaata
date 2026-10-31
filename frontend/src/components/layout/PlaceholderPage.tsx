/** Placeholder page — used for routes not yet implemented in FE-001. */
interface PlaceholderPageProps {
  title: string
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
        {title}
      </h1>
      <p className="text-text-secondary">
        This screen will be implemented in a future milestone.
      </p>
    </div>
  )
}
