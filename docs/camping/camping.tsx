import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const WORKFLOW_REPO = 'me';
const CAMPING_PATH = 'camping';
const SCAN_DURATION_ESTIMATE_MS = 120000;

interface RecArea {
    id: string;
    name: string;
    provider: string;
}

interface RecAreasData {
    [key: string]: RecArea;
}

interface CampgroundFavorite {
    name: string;
    recAreaKey: string;
    recAreaName: string;
    notify: boolean;
}

interface FavoritesData {
    favorites: { [key: string]: CampgroundFavorite };
    settings: {
        dailyScanEnabled: boolean;
        weekendsOnly: boolean;
    };
}

interface Opening {
    recAreaKey: string;
    recAreaName: string;
    campgroundId?: string;
    campgroundName?: string;
    provider: string;
    dates?: string[];
    bookingUrl?: string;
    raw?: string;
}

interface AvailabilityData {
    lastScan: string;
    openings: Opening[];
}

async function githubAPI(token: string, endpoint: string, options: any = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }
    
    return response.json();
}

async function fetchFile(token: string, path: string): Promise<any> {
    try {
        const fileData = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`);
        const base64Content = fileData.content.replace(/\n/g, '');
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const content = new TextDecoder('utf-8').decode(bytes);
        return { data: JSON.parse(content), sha: fileData.sha };
    } catch (e) {
        return { data: null, sha: null };
    }
}

async function saveFile(token: string, path: string, data: any, sha: string | null, message: string) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    
    const body: any = {
        message,
        content
    };
    
    if (sha) {
        body.sha = sha;
    }
    
    await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

async function triggerScanWorkflow(token: string): Promise<void> {
    await fetch(`https://api.github.com/repos/${REPO_OWNER}/${WORKFLOW_REPO}/actions/workflows/camping-monitor.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            ref: 'master',
            inputs: {
                scan_type: 'full',
                update_rec_areas: 'true'
            }
        })
    });
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
    const [token, setToken] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        const savedToken = sessionStorage.getItem('githubToken');
        if (savedToken) {
            setToken(savedToken);
            handleLogin(savedToken);
        }
    }, []);
    
    const handleLogin = async (tokenToUse?: string) => {
        const loginToken = tokenToUse || token;
        setError(false);
        setLoading(true);
        
        try {
            await githubAPI(loginToken, '/user');
            sessionStorage.setItem('githubToken', loginToken);
            document.documentElement.style.visibility = 'visible';
            onLogin(loginToken);
        } catch (err) {
            console.error('Login failed:', err);
            setError(true);
            setLoading(false);
            document.documentElement.style.visibility = 'visible';
        }
    };
    
    return (
        <div id="login-screen">
            <div id="login-box">
                <h1>Camping</h1>
                <form id="login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                    <input 
                        type="text" 
                        name="username"
                        defaultValue="camping"
                        autoComplete="username"
                        style={{ display: 'none' }}
                        readOnly
                    />
                    <input 
                        type="password" 
                        id="token-input"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        name="password"
                        placeholder="Enter GitHub Token"
                        autoComplete="current-password"
                    />
                    <button id="login-button" type="submit">Enter</button>
                </form>
                <div id="error-message" style={{ display: error ? 'block' : 'none' }}>Bad Password.</div>
                <div id="loading-message" style={{ display: loading ? 'block' : 'none' }}>Loading...</div>
            </div>
        </div>
    );
}

function SearchBar({ searchQuery, onSearchChange }: { searchQuery: string, onSearchChange: (query: string) => void }) {
    return (
        <div className="search-container">
            <input
                type="text"
                placeholder="Search campgrounds..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="search-input"
            />
        </div>
    );
}

function AvailabilityCard({ 
    opening,
    isFavorite,
    notifyEnabled,
    onToggleFavorite,
    onToggleNotify
}: { 
    opening: Opening;
    isFavorite: boolean;
    notifyEnabled: boolean;
    onToggleFavorite: () => void;
    onToggleNotify: () => void;
}) {
    const campgroundKey = opening.campgroundId || opening.recAreaKey;
    const displayName = opening.campgroundName || opening.recAreaName;
    
    return (
        <div className="availability-card">
            <div className="card-header">
                <div className="card-title">
                    <h3>{displayName}</h3>
                    <span className="rec-area-label">{opening.recAreaName}</span>
                </div>
                <div className="card-actions">
                    <button 
                        className={`favorite-button ${isFavorite ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                        {isFavorite ? '★' : '☆'}
                    </button>
                    {isFavorite && (
                        <label className="notify-toggle" onClick={(e) => e.stopPropagation()}>
                            <input 
                                type="checkbox"
                                checked={notifyEnabled}
                                onChange={onToggleNotify}
                            />
                            <span className="notify-label">Notify</span>
                        </label>
                    )}
                </div>
            </div>
            
            <div className="card-content">
                {opening.dates && opening.dates.length > 0 && (
                    <div className="dates-list">
                        <span className="dates-label">Available dates:</span>
                        <span className="dates-value">{opening.dates.slice(0, 5).join(', ')}{opening.dates.length > 5 ? ` +${opening.dates.length - 5} more` : ''}</span>
                    </div>
                )}
                {opening.raw && !opening.dates && (
                    <div className="raw-availability">{opening.raw}</div>
                )}
                <div className="provider-label">{opening.provider}</div>
            </div>
            
            {opening.bookingUrl && (
                <a 
                    href={opening.bookingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="book-button"
                    onClick={(e) => e.stopPropagation()}
                >
                    Book Now →
                </a>
            )}
        </div>
    );
}

function TabBar({ activeTab, onTabChange }: { activeTab: 'all' | 'favorites', onTabChange: (tab: 'all' | 'favorites') => void }) {
    return (
        <div className="tab-bar">
            <button 
                className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => onTabChange('all')}
            >
                All Availability
            </button>
            <button 
                className={`tab-button ${activeTab === 'favorites' ? 'active' : ''}`}
                onClick={() => onTabChange('favorites')}
            >
                Favorites
            </button>
        </div>
    );
}

function CampingApp({ token }: { token: string }) {
    const [availability, setAvailability] = useState<AvailabilityData | null>(null);
    const [favorites, setFavorites] = useState<FavoritesData>({ favorites: {}, settings: { dailyScanEnabled: false, weekendsOnly: true } });
    const [favoritesSha, setFavoritesSha] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [scanStatus, setScanStatus] = useState<'idle' | 'running' | 'complete'>('idle');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [availResult, favResult] = await Promise.all([
                fetchFile(token, `${CAMPING_PATH}/availability.json`),
                fetchFile(token, `${CAMPING_PATH}/favorites.json`)
            ]);
            
            if (availResult.data) {
                setAvailability(availResult.data);
            }
            
            if (favResult.data) {
                setFavorites(favResult.data);
                setFavoritesSha(favResult.sha);
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
        setLoading(false);
    };

    const saveFavorites = async (newFavorites: FavoritesData) => {
        setSaving(true);
        try {
            await saveFile(
                token,
                `${CAMPING_PATH}/favorites.json`,
                newFavorites,
                favoritesSha,
                'Update camping favorites'
            );
            const result = await fetchFile(token, `${CAMPING_PATH}/favorites.json`);
            setFavoritesSha(result.sha);
            setFavorites(newFavorites);
        } catch (e) {
            console.error('Error saving favorites:', e);
        }
        setSaving(false);
    };

    const toggleFavorite = (opening: Opening) => {
        const key = opening.campgroundId || opening.recAreaKey;
        const newFavorites = { ...favorites };
        
        if (newFavorites.favorites[key]) {
            delete newFavorites.favorites[key];
        } else {
            newFavorites.favorites[key] = {
                name: opening.campgroundName || opening.recAreaName,
                recAreaKey: opening.recAreaKey,
                recAreaName: opening.recAreaName,
                notify: false
            };
        }
        
        saveFavorites(newFavorites);
    };

    const toggleNotify = (opening: Opening) => {
        const key = opening.campgroundId || opening.recAreaKey;
        if (!favorites.favorites[key]) return;
        
        const newFavorites = { ...favorites };
        newFavorites.favorites[key] = {
            ...newFavorites.favorites[key],
            notify: !newFavorites.favorites[key].notify
        };
        
        saveFavorites(newFavorites);
    };

    const toggleDailyScan = () => {
        const newFavorites = { 
            ...favorites,
            settings: {
                ...favorites.settings,
                dailyScanEnabled: !favorites.settings.dailyScanEnabled
            }
        };
        saveFavorites(newFavorites);
    };

    const runScan = async () => {
        setScanStatus('running');
        try {
            await triggerScanWorkflow(token);
            setTimeout(() => {
                setScanStatus('complete');
            }, SCAN_DURATION_ESTIMATE_MS);
        } catch (e) {
            console.error('Error triggering scan:', e);
            setScanStatus('idle');
        }
    };

    const filteredOpenings = (availability?.openings || []).filter(opening => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const name = (opening.campgroundName || opening.recAreaName || '').toLowerCase();
        return name.includes(query);
    });

    const displayOpenings = activeTab === 'favorites'
        ? filteredOpenings.filter(o => favorites.favorites[o.campgroundId || o.recAreaKey])
        : filteredOpenings;

    if (loading) {
        return <div id="loading-screen">Loading camping data...</div>;
    }

    const lastScanDate = availability?.lastScan 
        ? new Date(availability.lastScan).toLocaleString()
        : 'Never';

    const notifyCount = Object.values(favorites.favorites).filter(f => f.notify).length;

    return (
        <div id="camping-app">
            <header id="camping-header">
                <h1>Camping Availability</h1>
                <div className="last-scan">Last scan: {lastScanDate}</div>
            </header>
            
            <div className="scan-controls">
                <div className="scan-actions">
                    <button 
                        className="run-scan-button"
                        onClick={runScan}
                        disabled={scanStatus === 'running'}
                    >
                        {scanStatus === 'running' ? 'Populating...' : 'Populate all sites'}
                    </button>
                    {scanStatus === 'running' && (
                        <span className="scan-message">Population in progress. This takes ~2 minutes...</span>
                    )}
                    {scanStatus === 'complete' && (
                        <span className="scan-message complete">
                            Population likely complete. <button className="refresh-link" onClick={() => window.location.reload()}>Refresh page</button> to see updates.
                        </span>
                    )}
                </div>
                <label className="scan-toggle">
                    <input 
                        type="checkbox"
                        checked={favorites.settings.dailyScanEnabled}
                        onChange={toggleDailyScan}
                    />
                    <span>Auto Daily Scan</span>
                    <span className="scan-status">{favorites.settings.dailyScanEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>
                {notifyCount > 0 && (
                    <div className="notify-status">
                        {notifyCount} site{notifyCount !== 1 ? 's' : ''} with 15-min notifications
                    </div>
                )}
            </div>
            
            <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            
            {saving && <div className="saving-indicator">Saving...</div>}
            
            <div id="availability-list">
                {displayOpenings.length === 0 ? (
                    <div className="empty-state">
                        {activeTab === 'favorites' 
                            ? 'No favorites yet. Star some campgrounds from the All Availability tab!'
                            : 'No availability data yet. Run a scan to check for openings.'
                        }
                    </div>
                ) : (
                    displayOpenings.map((opening, index) => {
                        const key = opening.campgroundId || opening.recAreaKey;
                        return (
                            <AvailabilityCard
                                key={`${key}-${index}`}
                                opening={opening}
                                isFavorite={!!favorites.favorites[key]}
                                notifyEnabled={favorites.favorites[key]?.notify || false}
                                onToggleFavorite={() => toggleFavorite(opening)}
                                onToggleNotify={() => toggleNotify(opening)}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}

function App() {
    const [token, setToken] = useState<string | null>(null);

    if (!token) {
        return <LoginScreen onLogin={setToken} />;
    }

    return <CampingApp token={token} />;
}

const container = document.getElementById('app');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}

