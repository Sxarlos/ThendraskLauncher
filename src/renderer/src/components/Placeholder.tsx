export default function Placeholder({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="text-3xl mb-3 opacity-70">🚧</div>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-muted max-w-sm">{subtitle}</p>
    </div>
  )
}
