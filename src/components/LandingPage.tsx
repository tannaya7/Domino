interface LandingPageProps {
  onGetStarted: () => void
}

function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <h1 className="text-3xl font-semibold text-gray-900">Blast Radius</h1>
      <p className="max-w-md text-gray-600">
        See what breaks before it breaks — map your system's dependencies and understand
        the blast radius of any change.
      </p>
      <button
        onClick={onGetStarted}
        className="mt-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Get Started
      </button>
    </div>
  )
}

export default LandingPage
