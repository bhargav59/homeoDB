import React, { useState } from 'react';
import { Search, Loader2, Database, Shield, Activity, Beaker, Zap } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  React.useEffect(() => {
    axios.get(`${API_BASE_URL}/stats`).then(res => setStats(res.data)).catch(console.error);
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/search`, { query, n_results: 10 });
      setResults(res.data.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to search remedies.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 font-sans relative overflow-x-hidden transition-colors duration-500">

      {/* Dynamic Background with Glowing Orbs */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-br from-indigo-600 via-purple-700 to-blue-900 -z-20 rounded-b-[4rem] shadow-[0_0_80px_rgba(79,70,229,0.3)] opacity-100 transform -translate-y-5">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
      </div>
      <div className="fixed top-20 left-10 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-[150px] opacity-30 -z-10 animate-pulse"></div>
      <div className="fixed top-40 right-10 w-96 h-96 bg-fuchsia-500 rounded-full mix-blend-screen filter blur-[150px] opacity-20 -z-10 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-16 pb-24">
        <header className="mb-16 text-center text-white">
          <div className="inline-flex items-center justify-center p-5 bg-white/10 rounded-3xl backdrop-blur-xl mb-8 shadow-2xl ring-1 ring-white/30 transform hover:scale-110 transition-transform duration-300">
            <Zap className="w-12 h-12 text-blue-200 fill-blue-400 opacity-90" />
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 drop-shadow-2xl text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-indigo-200">
            HomeoIntelligence
          </h1>
          <p className="text-indigo-100 text-lg md:text-2xl font-medium max-w-3xl mx-auto drop-shadow-lg opacity-90 leading-relaxed">
            Semantic exploration of 2,600+ AI-structured homeopathic remedies & products.
          </p>
        </header>

        {/* Stats Dashboard */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-5xl mx-auto">
            <div className="glass-panel p-8 text-center group hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden backdrop-blur-2xl bg-white/80 dark:bg-slate-800/60 border border-white/40 dark:border-white/10">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-400 to-indigo-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Total Indexed</p>
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">{stats.total_remedies.toLocaleString()}</h2>
            </div>
            <div className="glass-panel p-8 text-center group hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden backdrop-blur-2xl bg-white/80 dark:bg-slate-800/60 border border-white/40 dark:border-white/10">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-purple-400 to-fuchsia-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Materia Medica</p>
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-fuchsia-600 dark:from-purple-400 dark:to-fuchsia-400">{stats.sources['Materia Medica'].toLocaleString()}</h2>
            </div>
            <div className="glass-panel p-8 text-center group hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden backdrop-blur-2xl bg-white/80 dark:bg-slate-800/60 border border-white/40 dark:border-white/10">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Retail Products</p>
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400">{stats.sources['Dr. Reckeweg Catalog'].toLocaleString()}</h2>
            </div>
          </div>
        )}

        {/* Powerful Animated Search Section */}
        <div className="mb-20 max-w-4xl mx-auto relative group">
          <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-3xl blur-md opacity-40 group-hover:opacity-100 transition duration-700 z-0 animate-pulse"></div>
          <div className="glass-panel p-4 md:p-5 relative z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/50 dark:border-slate-700/50 rounded-3xl shadow-2xl flex flex-col sm:flex-row gap-4 items-center">
            <form onSubmit={handleSearch} className="flex-grow w-full flex items-center gap-4">
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                  <Search className="h-7 w-7 text-indigo-500 dark:text-indigo-400" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask anything (e.g., severe anxiety, cold sweat, rhus tox...)"
                  className="w-full bg-slate-50 border-2 border-transparent dark:bg-slate-800/50 rounded-2xl pl-16 pr-6 py-5 text-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-indigo-500 transition-all font-medium shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-12 py-5 text-xl font-extrabold flex items-center gap-3 transition-all transform active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:shadow-[0_0_30px_rgba(79,70,229,0.8)] min-w-[180px] justify-center"
              >
                {loading ? <Loader2 className="w-7 h-7 animate-spin" /> : 'Search'}
              </button>
            </form>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="glass-panel border-red-400 bg-red-50/90 dark:bg-red-900/40 text-red-800 dark:text-red-200 p-6 mb-12 flex items-center gap-5 shadow-[0_0_30px_rgba(239,68,68,0.2)] rounded-3xl">
            <Shield className="w-12 h-12 text-red-500 drop-shadow flex-shrink-0" />
            <div>
              <h3 className="font-extrabold text-2xl mb-1">Search Interrupted</h3>
              <p className="opacity-90 text-lg">{error}</p>
            </div>
          </div>
        )}

        {/* Magnificent Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {results.map((res, index) => (
            <div
              key={res.file_name + index}
              className="glass-panel p-8 hover:-translate-y-3 hover:shadow-[0_20px_50px_-10px_rgba(79,70,229,0.4)] dark:hover:shadow-[0_20px_50px_-10px_rgba(79,70,229,0.2)] bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl transition-all duration-300 group flex flex-col border border-white/60 dark:border-slate-700/60 rounded-3xl"
            >
              <div className="flex justify-between items-start mb-6 gap-4">
                <h3 className="text-3xl font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight drop-shadow-sm">
                  {res.profile?.name || res.file_name.replace('processed_', '').replace('.json', '')}
                </h3>
                {res.score && (
                  <div className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 text-sm font-black px-4 py-2 rounded-2xl whitespace-nowrap border border-indigo-200 dark:border-indigo-500/30 shadow-sm flex items-center gap-1">
                    <Zap className="w-4 h-4" /> {(res.score * 100).toFixed(0)}%
                  </div>
                )}
              </div>

              {res.profile?.common_names?.length > 0 && (
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mb-6 bg-indigo-50 dark:bg-indigo-900/40 py-2.5 px-4 rounded-xl inline-block self-start border border-indigo-100 dark:border-indigo-800/50">
                  {res.profile.common_names.join(', ')}
                </p>
              )}

              <div className="space-y-6 flex-grow">
                {res.profile?.key_symptoms?.length > 0 && (
                  <div className="bg-slate-50/80 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-300 uppercase tracking-widest mb-4">
                      <Activity className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> Key Symptoms
                    </h4>
                    <ul className="text-slate-700 dark:text-slate-300 space-y-3 text-base font-medium">
                      {res.profile.key_symptoms.slice(0, 3).map((sym, i) => (
                        <li key={i} className="flex leading-relaxed">
                          <span className="mr-3 text-indigo-500 dark:text-indigo-400 font-bold mt-0.5">•</span>
                          <span className="opacity-95">{sym}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(!res.profile?.key_symptoms || res.profile.key_symptoms.length === 0) && res.profile?.guiding_symptoms?.length > 0 && (
                  <div className="bg-slate-50/80 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-300 uppercase tracking-widest mb-4">
                      <Activity className="w-5 h-5 text-teal-500 dark:text-teal-400" /> Guiding Symptoms
                    </h4>
                    <ul className="text-slate-700 dark:text-slate-300 space-y-3 text-base font-medium">
                      {res.profile.guiding_symptoms.slice(0, 3).map((sym, i) => (
                        <li key={i} className="flex leading-relaxed">
                          <span className="mr-3 text-teal-500 dark:text-teal-400 font-bold mt-0.5">•</span>
                          <span className="opacity-95">{sym}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!res.profile?.key_symptoms && !res.profile?.guiding_symptoms && (
                  <div className="bg-slate-50/80 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-center h-32">
                    <p className="text-slate-500 dark:text-slate-400 text-base font-medium italic text-center">
                      Detailed symptom narrative not available.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-sm font-bold text-slate-500 dark:text-slate-400 min-h-[40px]">
                <span className="flex items-center border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm truncate max-w-[180px]" title={res.profile?.source?.url}>
                  {res.profile?.source?.url ? new URL(res.profile.source.url).hostname : 'Local DB'}
                </span>
                <button className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors flex items-center gap-1 group-hover:translate-x-2 duration-300 ml-auto bg-indigo-50/50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-xl">
                  Analyze <span className="text-lg leading-none">&rarr;</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && !loading && !error && (
          <div className="text-center mt-24 p-16 glass-panel max-w-3xl mx-auto border-dashed border-2 border-indigo-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 backdrop-blur-2xl rounded-[3rem]">
            <div className="w-28 h-28 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner ring-4 ring-white dark:ring-slate-800">
              <Database className="w-14 h-14 text-indigo-500 dark:text-indigo-400" />
            </div>
            <h2 className="text-4xl font-extrabold text-slate-800 dark:text-slate-200 mb-6 drop-shadow-sm">Semantic Knowledge Base</h2>
            <p className="text-slate-600 dark:text-slate-400 text-xl font-medium max-w-xl mx-auto leading-relaxed">
              Explore thousands of scraped material medica texts and products. Just type natural language symptoms and the AI will match the closest profiles.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
