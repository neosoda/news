import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Bookmarks from './pages/Bookmarks';
import DailyBrief from './pages/DailyBrief';

function App() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  return (
    <Layout onSearch={setSearch}>
      <Routes>
        <Route path="/" element={<Dashboard search={search} category={category} setCategory={setCategory} />} />
        <Route path="/daily-brief" element={<DailyBrief />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/sources" element={<Sources />} />
      </Routes>
    </Layout>
  );
}

export default App;
