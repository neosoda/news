import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Bookmarks from './pages/Bookmarks';
import DailyBrief from './pages/DailyBrief';
import Videos from './pages/Videos';

const THEME_STORAGE_KEY = 'newsai-theme';
const DEFAULT_THEME = 'dark';

function getInitialTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : DEFAULT_THEME;
}

function App() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <Layout onSearch={setSearch} theme={theme} onToggleTheme={toggleTheme}>
      <Routes>
        <Route path="/" element={<Dashboard search={search} category={category} setCategory={setCategory} />} />
        <Route path="/daily-brief" element={<DailyBrief />} />
        <Route path="/videos" element={<Videos search={search} />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/sources" element={<Sources />} />
      </Routes>
    </Layout>
  );
}

export default App;
