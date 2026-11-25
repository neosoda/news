import React, { useDeferredValue, useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, useSearchParams, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
const Sources=lazy(()=>import('./pages/Sources'));
const Bookmarks=lazy(()=>import('./pages/Bookmarks'));
const DailyBrief=lazy(()=>import('./pages/DailyBrief'));
const Videos=lazy(()=>import('./pages/Videos'));
const Breaches=lazy(()=>import('./pages/Breaches'));
const Editorial=lazy(()=>import('./pages/Editorial'));
const CyberRadar=lazy(()=>import('./pages/CyberRadar'));
const SourceObservatory=lazy(()=>import('./pages/SourceObservatory'));
const ReadingHistory=lazy(()=>import('./pages/ReadingHistory'));

const THEME_STORAGE_KEY = 'newsai-theme';
const DEFAULT_THEME = 'dark';

function getInitialTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : DEFAULT_THEME;
}

function App() {
  const [searchInput, setSearchInput] = useState('');
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const activeSearch = location.pathname === '/' ? params.get('q') || '' : searchInput;
  const search = useDeferredValue(activeSearch);
  const setSearch = value => {
    if (location.pathname === '/') setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set('q',value); else next.delete('q');
      return next;
    },{replace:true});
    else setSearchInput(value);
  };
  const category=params.get('category')||'';
  const setCategory=value=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set('category',value);else next.delete('category');return next;},{replace:true});
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <Layout search={activeSearch} onSearch={setSearch} theme={theme} onToggleTheme={toggleTheme}>
      <Suspense fallback={<p role="status" className="p-6 text-secondary">Chargement de la page…</p>}>
      <Routes>
        <Route path="/" element={<Dashboard search={search} category={category} setCategory={setCategory} />} />
        <Route path="/cyber" element={<CyberRadar />} />
        <Route path="/editorial" element={<Editorial />} />
        <Route path="/daily-brief" element={<DailyBrief />} />
        <Route path="/videos" element={<Videos search={search} />} />
        <Route path="/breaches" element={<Breaches search={search} />} />
        <Route path="/history" element={<ReadingHistory />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/observatory" element={<SourceObservatory />} />
        <Route path="/sources" element={<Sources />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default App;
