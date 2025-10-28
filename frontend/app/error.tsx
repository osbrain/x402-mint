'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center space-y-6 max-w-md mx-auto">
        <h1 className="text-6xl font-bold text-red-400">500</h1>
        <h2 className="text-2xl font-semibold">Something went wrong!</h2>
        <p className="text-gray-400">
          We encountered an unexpected error. Please try again later.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-left">
            <p className="text-sm font-mono text-red-400 break-words">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-gray-400 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}
        <div className="space-y-3">
          <button
            onClick={reset}
            className="block w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold px-6 py-3 rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-200"
          >
            Try again
          </button>
          <a 
            href="/" 
            className="block w-full bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-gray-600 transition-all duration-200"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}