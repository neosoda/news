import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSources, addSource, deleteSource, refreshSources } from '../services/api';
import { Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';

export default function Sources() {
    const queryClient = useQueryClient();
    const [newSource, setNewSource] = useState({ name: '', url: '', category: 'Tech' });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { data: sources, isLoading } = useQuery({ queryKey: ['sources'], queryFn: getSources });

    const addmutation = useMutation({
        mutationFn: addSource,
        onSuccess: () => {
            queryClient.invalidateQueries(['sources']);
            setNewSource({ name: '', url: '', category: 'Tech' });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteSource,
        onSuccess: () => queryClient.invalidateQueries(['sources'])
    });

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshSources();
            queryClient.invalidateQueries(['articles']); // Also refresh articles
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (newSource.name && newSource.url) {
            addmutation.mutate(newSource);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Manage Sources</h1>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                    <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh All'}</span>
                </button>
            </div>

            {/* Add Source Form */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Add New RSS Feed</h2>
                <form onSubmit={handleSubmit} className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Source Name (e.g. TechCrunch)"
                        value={newSource.name}
                        onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <input
                        type="url"
                        placeholder="RSS URL"
                        value={newSource.url}
                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                        className="flex-2 w-96 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <select
                        value={newSource.category}
                        onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option>Tech</option>
                        <option>Science</option>
                        <option>Business</option>
                        <option>AI</option>
                        <option>Security</option>
                    </select>
                    <button
                        type="submit"
                        disabled={addmutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center justify-center font-medium transition-colors"
                    >
                        {addmutation.isPending ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                    </button>
                </form>
            </div>

            {/* Sources List */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs font-semibold">
                        <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">URL</th>
                            <th className="px-6 py-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                            <tr><td colSpan="4" className="p-8 text-center text-gray-500">Loading sources...</td></tr>
                        ) : sources?.length === 0 ? (
                            <tr><td colSpan="4" className="p-8 text-center text-gray-500">No sources added yet.</td></tr>
                        ) : (
                            sources?.map((source) => (
                                <tr key={source.id} className="hover:bg-gray-700/30 transition-colors">
                                    <td className="px-6 py-4 text-white font-medium">{source.name}</td>
                                    <td className="px-6 py-4 text-gray-400">
                                        <span className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300">{source.category}</span>
                                    </td>
                                    <td className="px-6 py-4 text-blue-400 truncate max-w-xs">{source.url}</td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => deleteMutation.mutate(source.id)}
                                            className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-900/20 rounded"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
