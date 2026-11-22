import api from './lib/axios'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Order Manager
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          React + TypeScript + Tailwind CSS + Axios initialized.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-mono text-slate-700">
          API Base URL: {api.defaults.baseURL}
        </div>
      </div>
    </div>
  )
}

export default App
