import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addSource, clearAdminToken, deleteSource, getSourcesHealth, hasAdminToken,
    reactivateSource, refreshSources, setAdminToken
} from '../services/api';
import { AlertCircle, KeyRound, Loader2, LockKeyhole, LogOut, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function errorMessage(error, fallback) {
    return error?.response?.data?.error || error?.message || fallback;
}

function statusBadge(source) {
    if (!source.isActive) return ['Désactivée', 'bg-red-500/15 text-red-300 border-red-500/30'];
    if (source.isCoolingDown) return ['En pause', 'bg-amber-500/15 text-amber-300 border-amber-500/30'];
    if (source.consecutiveFailures > 0) return ['Dégradée', 'bg-orange-500/15 text-orange-300 border-orange-500/30'];
    return ['Opérationnelle', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'];
}

function AdminGate({ error, onUnlock }) {
    const [token, setToken] = useState('');
    const [validationError, setValidationError] = useState('');
    const handleSubmit = (event) => {
        event.preventDefault();
        if (token.trim().length < 32) return setValidationError('Le jeton administrateur doit comporter au moins 32 caractères.');
        setAdminToken(token);
        onUnlock();
    };

    return <section className="mx-auto max-w-xl surface-card rounded-2xl border theme-border p-7 text-center sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-accent"><LockKeyhole size={26} aria-hidden="true" /></div>
        <h1 className="mt-5 text-2xl font-black text-primary">Administration sécurisée</h1>
        <p className="mt-3 text-sm leading-6 text-secondary">Saisissez le jeton configuré côté serveur. Il reste uniquement dans cette session de navigateur.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
            <label className="block text-sm font-bold text-secondary" htmlFor="admin-token">Jeton administrateur</label>
            <div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} aria-hidden="true" /><input id="admin-token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} className="theme-input w-full rounded-xl py-3 pl-11 pr-4" placeholder="Jeton configuré dans ADMIN_TOKEN" required /></div>
            {(validationError || error) && <p className="text-sm text-red-300">{validationError || error}</p>}
            <button type="submit" className="w-full rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition-colors hover:bg-cyan-500">Déverrouiller l’administration</button>
        </form>
    </section>;
}

export default function Sources() {
    const queryClient = useQueryClient();
    const [hasAccess, setHasAccess] = useState(hasAdminToken);
    const [accessError, setAccessError] = useState('');
    const [refreshMessage, setRefreshMessage] = useState('');
    const [newSource, setNewSource] = useState({ name: '', url: '', category: 'Tech' });
    const sourceQuery = useQuery({ queryKey: ['sources-health'], queryFn: getSourcesHealth, enabled: hasAccess, refetchInterval: hasAccess ? 30000 : false, retry: false });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['sources-health'] });
        queryClient.invalidateQueries({ queryKey: ['articles'] });
        queryClient.invalidateQueries({ queryKey: ['article-stats'] });
    };
    const addMutation = useMutation({ mutationFn: addSource, onSuccess: () => { invalidate(); setNewSource({ name: '', url: '', category: 'Tech' }); } });
    const deleteMutation = useMutation({ mutationFn: deleteSource, onSuccess: invalidate });
    const reactivateMutation = useMutation({ mutationFn: reactivateSource, onSuccess: invalidate });
    const refreshMutation = useMutation({ mutationFn: refreshSources, onSuccess: (payload) => { setRefreshMessage(payload.message); setTimeout(invalidate, 2500); } });

    const handleDelete = (source) => {
        if (window.confirm(`Supprimer « ${source.name} » et tous ses articles ? Cette action est irréversible.`)) deleteMutation.mutate(source.id);
    };
    const lock = () => { clearAdminToken(); queryClient.removeQueries({ queryKey: ['sources-health'] }); setAccessError(''); setHasAccess(false); };
    const authorizationFailed = hasAccess && [401, 403, 503].includes(sourceQuery.error?.response?.status);
    if (!hasAccess || authorizationFailed) return <AdminGate error={authorizationFailed ? errorMessage(sourceQuery.error, 'Accès administrateur refusé.') : accessError} onUnlock={() => { setAccessError(''); setHasAccess(true); queryClient.invalidateQueries({ queryKey: ['sources-health'] }); }} />;

    const summary = sourceQuery.data?.summary;
    const rows = sourceQuery.data?.data || [];
    const mutationError = addMutation.error || deleteMutation.error || reactivateMutation.error || refreshMutation.error;

    return <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-accent"><ShieldCheck size={15} aria-hidden="true" /> Administration</div><h1 className="mt-2 text-3xl font-black text-primary">Fiabilité des sources</h1></div><div className="flex flex-wrap gap-3"><button onClick={lock} className="inline-flex items-center justify-center gap-2 rounded-lg border theme-border px-4 py-2 text-secondary transition-colors hover:bg-[var(--color-surface-muted)]"><LogOut size={18} aria-hidden="true" /> Verrouiller</button><button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white transition-colors hover:bg-cyan-500 disabled:opacity-60"><RefreshCw size={18} className={refreshMutation.isPending ? 'animate-spin' : ''} aria-hidden="true" />{refreshMutation.isPending ? 'Lancement…' : 'Lancer la synchronisation'}</button></div></div>
        {refreshMessage && <p className="mb-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{refreshMessage}</p>}
        {mutationError && <p className="mb-5 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{errorMessage(mutationError, 'L’action a échoué.')}</p>}
        {summary && <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">{[['Total', summary.total, 'text-primary'], ['Actives', summary.active, 'text-emerald-300'], ['En pause', summary.coolingDown, 'text-amber-300'], ['Désactivées', summary.disabled, 'text-red-300'], ['Dégradées', summary.failing, 'text-orange-300']].map(([label, value, color]) => <div key={label} className="surface-card rounded-xl border theme-border p-4"><p className="text-xs uppercase tracking-wider text-secondary">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{value}</p></div>)}</div>}
        <section className="mb-8 surface-card rounded-xl border theme-border p-6"><h2 className="mb-2 text-xl font-semibold text-primary">Ajouter un flux RSS</h2><p className="mb-4 text-sm text-secondary">L’URL est validée avant toute récupération afin de protéger le serveur.</p><form onSubmit={(event) => { event.preventDefault(); if (newSource.name.trim() && newSource.url.trim()) addMutation.mutate(newSource); }} className="grid grid-cols-1 gap-4 lg:grid-cols-5"><input type="text" placeholder="Nom de la source" value={newSource.name} onChange={(event) => setNewSource({ ...newSource, name: event.target.value })} className="theme-input rounded-lg px-4 py-2 lg:col-span-1" required /><input type="url" placeholder="https://exemple.fr/feed.xml" value={newSource.url} onChange={(event) => setNewSource({ ...newSource, url: event.target.value })} className="theme-input rounded-lg px-4 py-2 lg:col-span-2" required /><select value={newSource.category} onChange={(event) => setNewSource({ ...newSource, category: event.target.value })} className="theme-input rounded-lg px-4 py-2 lg:col-span-1"><option>Tech</option><option>Science</option><option>Business</option><option>IA</option><option>Cybersécurité</option></select><button type="submit" disabled={addMutation.isPending} aria-label="Ajouter la source" className="flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2 text-white transition-colors hover:bg-emerald-500 disabled:opacity-60">{addMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}</button></form></section>
        <section className="surface-card overflow-hidden rounded-xl border theme-border">{sourceQuery.isLoading ? <div className="p-12 text-center text-secondary">Chargement de la santé des sources…</div> : sourceQuery.isError ? <div className="flex gap-2 p-6 text-red-300"><AlertCircle size={18} aria-hidden="true" /><span>{errorMessage(sourceQuery.error, 'Impossible de charger les sources.')}</span></div> : rows.length === 0 ? <div className="p-12 text-center text-secondary">Aucune source configurée.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left"><thead className="surface-muted text-xs font-semibold uppercase text-secondary"><tr><th className="px-6 py-4">Nom</th><th className="px-6 py-4">Catégorie</th><th className="px-6 py-4">État</th><th className="px-6 py-4">Échecs</th><th className="px-6 py-4">Pause jusqu’au</th><th className="px-6 py-4">Dernière erreur</th><th className="px-6 py-4">Adresse</th><th className="px-6 py-4">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{rows.map((source) => { const [label, statusClass] = statusBadge(source); const canReactivate = !source.isActive || source.isCoolingDown || source.consecutiveFailures > 0; const isReactivating = reactivateMutation.isPending && reactivateMutation.variables === source.id; return <tr key={source.id} className="align-top transition-colors hover:bg-cyan-400/[0.08]"><td className="px-6 py-4 font-medium text-primary">{source.name}</td><td className="px-6 py-4 text-secondary">{source.category}</td><td className="px-6 py-4"><span className={`inline-flex rounded border px-2 py-1 text-xs ${statusClass}`}>{label}</span></td><td className="px-6 py-4 text-secondary">{source.consecutiveFailures}</td><td className="px-6 py-4 text-secondary">{formatDateTime(source.cooldownUntil)}</td><td className="max-w-xs break-words px-6 py-4 text-secondary">{source.lastError || '—'}</td><td className="max-w-xs break-all px-6 py-4 text-accent">{source.url}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => reactivateMutation.mutate(source.id)} disabled={!canReactivate || isReactivating} className="inline-flex items-center gap-1 rounded border border-cyan-400/40 px-2 py-1 text-xs text-accent hover:bg-cyan-400/10 disabled:opacity-40">{isReactivating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />} Réactiver</button><button onClick={() => handleDelete(source)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={14} aria-hidden="true" /> Supprimer</button></div></td></tr>; })}</tbody></table></div>}</section>
    </div>;
}
