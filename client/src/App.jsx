import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Bookmarks from './pages/Bookmarks';
import DailyBrief from './pages/DailyBrief';

function App() {
  const [search, setSearch] = useState('');

  return (
    <Layout onSearch={setSearch}>
      <Routes>
        <Route path="/" element={<Dashboard search={search} />} />
        <Route path="/daily-brief" element={<DailyBrief />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/sources" element={<Sources />} />
      </Routes>
    </Layout>
  );
}

export default App;
