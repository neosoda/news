import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addSource,
    deleteSource,
    getSourcesHealth,
    reactivateSource,
    refreshSources
} from '../services/api';
import { AlertCircle, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

function formatDateTime(value) {
    if (!value) {
        return 'n/a';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return 'n/a';
    }

    return parsed.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusBadge(source) {
    if (!source.isActive) {
        return { label: 'Disabled', className: 'bg-red-500/15 text-red-300 border-red-500/30' };
    }

    if (source.isCoolingDown) {
        return { label: 'Cooldown', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }

    if (source.consecutiveFailures > 0) {
        return { label: 'Degraded', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' };
    }

    return { label: 'Healthy', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
}

export default function Sources() {
    const queryClient = useQueryClient();
    const [newSource, setNewSource] = useState({ name: '', url: '', category: 'Tech' });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const {
        data: sourcesHealth,
        isLoading,
        isError,
        error
    } = useQuery({
        queryKey: ['sources-health'],
        queryFn: getSourcesHealth,
        refetchInterval: 60000
    });

    const addMutation = useMutation({
        mutationFn: addSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sources-health'] });
            setNewSource({ name: '', url: '', category: 'Tech' });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sources-health'] });
        }
    });

    const reactivateMutation = useMutation({
        mutationFn: reactivateSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sources-health'] });
        }
    });

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshSources();
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['sources-health'] });
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (newSource.name && newSource.url) {
            addMutation.mutate(newSource);
        }
    };

    const summary = sourcesHealth?.summary;
    const rows = sourcesHealth?.data || [];

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
                <h1 className="text-3xl font-bold text-white">Source Reliability Control</h1>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                    <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh All'}</span>
                </button>
            </div>

            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-gray-400">Total</p>
                        <p className="text-2xl font-black text-white mt-1">{summary.total}</p>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-gray-400">Active</p>
                        <p className="text-2xl font-black text-emerald-300 mt-1">{summary.active}</p>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-gray-400">Cooldown</p>
                        <p className="text-2xl font-black text-amber-300 mt-1">{summary.coolingDown}</p>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-gray-400">Disabled</p>
                        <p className="text-2xl font-black text-red-300 mt-1">{summary.disabled}</p>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-gray-400">Failing</p>
                        <p className="text-2xl font-black text-orange-300 mt-1">{summary.failing}</p>
                    </div>
                </div>
            )}

            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Add RSS Feed</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <input
                        type="text"
                        placeholder="Source name"
                        value={newSource.name}
                        onChange={(event) => setNewSource({ ...newSource, name: event.target.value })}
                        className="lg:col-span-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <input
                        type="url"
                        placeholder="https://example.com/feed.xml"
                        value={newSource.url}
                        onChange={(event) => setNewSource({ ...newSource, url: event.target.value })}
                        className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <select
                        value={newSource.category}
                        onChange={(event) => setNewSource({ ...newSource, category: event.target.value })}
                        className="lg:col-span-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option>Tech</option>
                        <option>Science</option>
                        <option>Business</option>
                        <option>AI</option>
                        <option>Security</option>
                    </select>
                    <button
                        type="submit"
                        disabled={addMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center justify-center font-medium transition-colors disabled:opacity-60"
                    >
                        {addMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                    </button>
                </form>

                {addMutation.isError && (
                    <p className="mt-3 text-sm text-red-300">{addMutation.error?.response?.data?.error || addMutation.error?.message || 'Unable to add source.'}</p>
                )}
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-400">Loading source health...</div>
                ) : isError ? (
                    <div className="p-6 text-red-300 flex items-center gap-2">
                        <AlertCircle size={18} />
                        <span>{error?.response?.data?.error || error?.message || 'Failed to load source health.'}</span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">No sources found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[1100px]">
                            <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Failures</th>
                                    <th className="px-6 py-4">Cooldown Until</th>
                                    <th className="px-6 py-4">Last Error</th>
                                    <th className="px-6 py-4">URL</th>
                                    <th className="px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {rows.map((source) => {
                                    const status = getStatusBadge(source);
                                    const canReactivate = !source.isActive || source.isCoolingDown || source.consecutiveFailures > 0;
                                    const isReactivating = reactivateMutation.isPending && reactivateMutation.variables === source.id;

                                    return (
                                        <tr key={source.id} className="hover:bg-gray-700/20 transition-colors align-top">
                                            <td className="px-6 py-4 text-white font-medium">{source.name}</td>
                                            <td className="px-6 py-4 text-gray-300">{source.category}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex px-2 py-1 rounded text-xs border ${status.className}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">{source.consecutiveFailures}</td>
                                            <td className="px-6 py-4 text-gray-300">{formatDateTime(source.cooldownUntil)}</td>
                                            <td className="px-6 py-4 text-gray-300 max-w-xs break-words">{source.lastError || '-'}</td>
                                            <td className="px-6 py-4 text-blue-300 max-w-xs break-all">{source.url}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => reactivateMutation.mutate(source.id)}
                                                        disabled={!canReactivate || isReactivating}
                                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 disabled:opacity-40"
                                                    >
                                                        {isReactivating ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                                        Reactivate
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMutation.mutate(source.id)}
                                                        disabled={deleteMutation.isPending}
                                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                                    >
                                                        <Trash2 size={14} />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {(deleteMutation.isError || reactivateMutation.isError) && (
                <p className="mt-4 text-sm text-red-300">
                    {deleteMutation.error?.response?.data?.error ||
                        reactivateMutation.error?.response?.data?.error ||
                        deleteMutation.error?.message ||
                        reactivateMutation.error?.message ||
                        'Action failed.'}
                </p>
            )}
        </div>
    );
}