import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addSource,
    clearAdminToken,
    deleteSource,
    getSourcesHealth,
    hasAdminToken,
    reactivateSource,
    refreshSources,
    setAdminToken
} from '../services/api';
import { formatDateTime } from '../utils/url';
import {
    AlertCircle,
    KeyRound,
    Loader2,
    LockKeyhole,
    LogOut,
    Plus,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Trash2
} from 'lucide-react';

function errorMessage(error, fallback) {
    return error?.response?.data?.error || error?.message || fallback;
}

function statusBadge(source) {
    if (!source.isActive) return ['Désactivée', 'bg-red-500/10 text-red-300 border-red-500/30'];
    if (source.isCoolingDown) return ['En pause', 'bg-amber-500/10 text-amber-200 border-amber-500/30'];
    if (source.consecutiveFailures > 0) return ['Dégradée', 'bg-orange-500/10 text-orange-200 border-orange-500/30'];
    return ['Opérationnelle', 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'];
}

function AdminGate({ error, onUnlock }) {
    const [token, setToken] = useState('');
    const [validationError, setValidationError] = useState('');

    const handleSubmit = (event) => {
        event.preventDefault();
        if (token.trim().length < 32) {
            setValidationError('Le jeton administrateur doit comporter au moins 32 caractères.');
            return;
        }
        setValidationError('');
        setAdminToken(token);
        onUnlock();
    };

    return (
        <section className="mx-auto max-w-xl surface-card p-7 sm:p-9 mt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border theme-border surface-muted text-accent">
                <LockKeyhole size={22} aria-hidden="true" />
            </div>
            <h1 className="mt-5 font-serif text-3xl font-semibold text-primary">
                Administration sécurisée
            </h1>
            <p className="mt-2.5 text-sm leading-6 text-secondary">
                Saisissez le jeton configuré côté serveur (`ADMIN_TOKEN`). Il est conservé uniquement pour cette session de navigateur.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5" htmlFor="admin-token">
                        Jeton administrateur
                    </label>
                    <div className="relative">
                        <KeyRound
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                            size={16}
                            aria-hidden="true"
                        />
                        <input
                            id="admin-token"
                            type="password"
                            autoComplete="current-password"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            className="theme-input w-full rounded-lg py-2.5 pl-10 pr-4 text-sm"
                            placeholder="Jeton d’au moins 32 caractères"
                            required
                        />
                    </div>
                </div>
                {(validationError || error) && (
                    <p role="alert" className="text-sm text-red-300">
                        {validationError || error}
                    </p>
                )}
                <button type="submit" className="editorial-btn-primary w-full py-2.5">
                    Déverrouiller l’administration
                </button>
            </form>
        </section>
    );
}

export default function Sources() {
    const queryClient = useQueryClient();
    const [hasAccess, setHasAccess] = useState(hasAdminToken);
    const [accessError, setAccessError] = useState('');
    const [refreshMessage, setRefreshMessage] = useState('');
    const [newSource, setNewSource] = useState({ name: '', url: '', category: 'Développement' });

    const sourceQuery = useQuery({
        queryKey: ['sources-health'],
        queryFn: getSourcesHealth,
        enabled: hasAccess,
        refetchInterval: (query) => {
            const status = query.state.error?.response?.status;
            if ([401, 403, 503].includes(status)) return false;
            return hasAccess ? 30000 : false;
        },
        retry: false
    });

    const authorizationFailed = hasAccess && [401, 403, 503].includes(sourceQuery.error?.response?.status);

    React.useEffect(() => {
        if (!authorizationFailed) return;
        const message = errorMessage(sourceQuery.error, 'Accès administrateur refusé.');
        clearAdminToken();
        queryClient.removeQueries({ queryKey: ['sources-health'] });
        setAccessError(message);
        setHasAccess(false);
    }, [authorizationFailed, sourceQuery.error, queryClient]);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['sources-health'] });
        queryClient.invalidateQueries({ queryKey: ['articles'] });
        queryClient.invalidateQueries({ queryKey: ['article-stats'] });
        queryClient.invalidateQueries({ queryKey: ['source-observatory'] });
    };

    const addMutation = useMutation({
        mutationFn: addSource,
        onSuccess: () => {
            invalidate();
            setNewSource({ name: '', url: '', category: 'Développement' });
        }
    });
    const deleteMutation = useMutation({ mutationFn: deleteSource, onSuccess: invalidate });
    const reactivateMutation = useMutation({ mutationFn: reactivateSource, onSuccess: invalidate });
    const refreshMutation = useMutation({
        mutationFn: refreshSources,
        onSuccess: (payload) => {
            setRefreshMessage(payload.message);
            setTimeout(invalidate, 2500);
        }
    });

    const handleDelete = (source) => {
        if (window.confirm(`Supprimer « ${source.name} » et tous ses articles ? Cette action est irréversible.`)) {
            deleteMutation.mutate(source.id);
        }
    };

    const lock = () => {
        clearAdminToken();
        queryClient.removeQueries({ queryKey: ['sources-health'] });
        setAccessError('');
        setHasAccess(false);
    };

    if (!hasAccess || authorizationFailed) {
        return (
            <AdminGate
                error={authorizationFailed ? errorMessage(sourceQuery.error, 'Accès administrateur refusé.') : accessError}
                onUnlock={() => {
                    setAccessError('');
                    setHasAccess(true);
                    queryClient.invalidateQueries({ queryKey: ['sources-health'] });
                }}
            />
        );
    }

    const summary = sourceQuery.data?.summary;
    const rows = sourceQuery.data?.data || [];
    const mutationError = addMutation.error || deleteMutation.error || reactivateMutation.error || refreshMutation.error;

    return (
        <div className="mx-auto max-w-7xl space-y-7">
            <header className="border-b theme-border pb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        <ShieldCheck size={14} aria-hidden="true" />
                        Administration
                    </p>
                    <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold text-primary">
                        Fiabilité des sources RSS
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2.5">
                    <button type="button" onClick={lock} className="editorial-btn">
                        <LogOut size={15} aria-hidden="true" />
                        Verrouiller
                    </button>
                    <button
                        type="button"
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending}
                        className="editorial-btn-primary"
                    >
                        <RefreshCw size={15} className={refreshMutation.isPending ? 'animate-spin' : ''} aria-hidden="true" />
                        {refreshMutation.isPending ? 'Lancement…' : 'Lancer la synchronisation'}
                    </button>
                </div>
            </header>

            {refreshMessage && (
                <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                    {refreshMessage}
                </p>
            )}
            {mutationError && (
                <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {errorMessage(mutationError, 'L’action a échoué.')}
                </p>
            )}

            {summary && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                        ['Total', summary.total, 'text-primary'],
                        ['Actives', summary.active, 'text-emerald-300'],
                        ['En pause', summary.coolingDown, 'text-amber-200'],
                        ['Désactivées', summary.disabled, 'text-red-300'],
                        ['Dégradées', summary.failing, 'text-orange-200']
                    ].map(([label, value, color]) => (
                        <div key={label} className="surface-card p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
                            <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            <section className="surface-card p-5 sm:p-6">
                <h2 className="font-serif text-xl font-semibold text-primary">Ajouter un flux RSS</h2>
                <p className="mt-1 mb-4 text-xs text-secondary">
                    L’URL et sa résolution DNS sont validées côté serveur avant toute récupération (protection SSRF).
                </p>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (newSource.name.trim() && newSource.url.trim()) {
                            addMutation.mutate(newSource);
                        }
                    }}
                    className="grid grid-cols-1 gap-3 lg:grid-cols-12 items-end"
                >
                    <label className="text-xs font-medium text-secondary lg:col-span-3">
                        Nom de la source
                        <input
                            type="text"
                            placeholder="Ex. Next.ink"
                            value={newSource.name}
                            onChange={(event) => setNewSource({ ...newSource, name: event.target.value })}
                            className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                            required
                        />
                    </label>
                    <label className="text-xs font-medium text-secondary lg:col-span-5">
                        URL du flux RSS / Atom
                        <input
                            type="url"
                            placeholder="https://exemple.fr/feed.xml"
                            value={newSource.url}
                            onChange={(event) => setNewSource({ ...newSource, url: event.target.value })}
                            className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                            required
                        />
                    </label>
                    <label className="text-xs font-medium text-secondary lg:col-span-3">
                        Catégorie
                        <select
                            value={newSource.category}
                            onChange={(event) => setNewSource({ ...newSource, category: event.target.value })}
                            className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="Cybersecurité">Cybersecurité</option>
                            <option value="Intelligence Artificielle">Intelligence Artificielle</option>
                            <option value="Cloud">Cloud</option>
                            <option value="Développement">Développement</option>
                            <option value="Hardware">Hardware</option>
                            <option value="Web">Web</option>
                            <option value="Business">Business</option>
                            <option value="Société">Société</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </label>
                    <button
                        type="submit"
                        disabled={addMutation.isPending}
                        aria-label="Ajouter la source"
                        className="editorial-btn-primary py-2 lg:col-span-1"
                    >
                        {addMutation.isPending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                    </button>
                </form>
            </section>

            <section className="surface-card overflow-hidden">
                {sourceQuery.isLoading ? (
                    <div role="status" className="p-12 text-center text-sm text-secondary">
                        Chargement de la santé des sources…
                    </div>
                ) : sourceQuery.isError ? (
                    <div role="alert" className="flex items-center gap-2 p-6 text-sm text-red-300">
                        <AlertCircle size={18} aria-hidden="true" />
                        <span>{errorMessage(sourceQuery.error, 'Impossible de charger les sources.')}</span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center text-sm text-secondary">Aucune source configurée.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1050px] text-left text-sm">
                            <thead className="surface-muted border-b theme-border text-xs font-semibold uppercase tracking-wider text-muted">
                                <tr>
                                    <th scope="col" className="px-5 py-3.5">Nom</th>
                                    <th scope="col" className="px-5 py-3.5">Catégorie</th>
                                    <th scope="col" className="px-5 py-3.5">État</th>
                                    <th scope="col" className="px-5 py-3.5">Échecs</th>
                                    <th scope="col" className="px-5 py-3.5">Pause jusqu’au</th>
                                    <th scope="col" className="px-5 py-3.5">Dernière erreur</th>
                                    <th scope="col" className="px-5 py-3.5">Adresse</th>
                                    <th scope="col" className="px-5 py-3.5">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {rows.map((source) => {
                                    const [label, statusClass] = statusBadge(source);
                                    const canReactivate = !source.isActive || source.isCoolingDown || source.consecutiveFailures > 0;
                                    const isReactivating = reactivateMutation.isPending && reactivateMutation.variables === source.id;

                                    return (
                                        <tr key={source.id} className="align-top hover:bg-[var(--color-surface-muted)] transition-colors">
                                            <th scope="row" className="px-5 py-3.5 font-medium text-primary">
                                                {source.name}
                                            </th>
                                            <td className="px-5 py-3.5 text-secondary">{source.category}</td>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                                                    {label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 font-mono tabular-nums text-secondary">
                                                {source.consecutiveFailures}
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap text-xs text-secondary tabular-nums">
                                                {formatDateTime(source.cooldownUntil)}
                                            </td>
                                            <td className="max-w-xs break-words px-5 py-3.5 text-xs text-secondary">
                                                {source.lastError || '—'}
                                            </td>
                                            <td className="max-w-xs break-all px-5 py-3.5 text-xs text-accent">
                                                {source.url}
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => reactivateMutation.mutate(source.id)}
                                                        disabled={!canReactivate || isReactivating}
                                                        className="inline-flex items-center gap-1 rounded-md border theme-border px-2.5 py-1 text-xs font-semibold text-accent hover:border-[var(--color-border-strong)] disabled:opacity-40"
                                                    >
                                                        {isReactivating ? (
                                                            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                                        ) : (
                                                            <RotateCcw size={13} aria-hidden="true" />
                                                        )}
                                                        Réactiver
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(source)}
                                                        disabled={deleteMutation.isPending}
                                                        className="inline-flex items-center gap-1 rounded-md border border-red-500/35 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                                    >
                                                        <Trash2 size={13} aria-hidden="true" />
                                                        Supprimer
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
            </section>
        </div>
    );
}
