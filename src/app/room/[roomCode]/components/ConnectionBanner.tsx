export default function ConnectionBanner({ status }: { status: 'connected' | 'reconnecting' | 'disconnected' }) {
  if (status === 'connected') return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-40 py-2 px-4 text-center text-sm font-medium animate-fade-in-down ${
      status === 'reconnecting'
        ? 'bg-warning/90 text-black'
        : 'bg-danger/90 text-white'
    }`}>
      {status === 'reconnecting' ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reconnecting...
        </span>
      ) : (
        'Connection lost. Please check your internet.'
      )}
    </div>
  );
}
