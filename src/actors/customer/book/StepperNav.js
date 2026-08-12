const STEPS = [
  { id: 1, label: 'What you need' },
  { id: 2, label: 'Choose a company' },
  { id: 3, label: 'Address and time' },
]

// A step is only clickable if the customer has already reached it once (maxStepReached) — lets
// them jump back to review/change an earlier choice, but not skip ahead of where they've gotten to.
export default function StepperNav({ currentStep, maxStepReached, onStepClick }) {
  return (
    <div className="mb-8 inline-flex flex-wrap gap-2 rounded-full bg-white p-1.5 shadow-sm border border-gray-100">
      {STEPS.map(step => {
        const isActive = step.id === currentStep
        const isReachable = step.id <= maxStepReached
        return (
          <button
            key={step.id}
            type="button"
            disabled={!isReachable}
            onClick={() => isReachable && onStepClick(step.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-[#003152] text-white'
                : isReachable
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            {step.id}. {step.label}
          </button>
        )
      })}
    </div>
  )
}
