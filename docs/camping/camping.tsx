import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Switch, FormControlLabel, Tooltip } from '@mui/material';

const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const WORKFLOW_REPO = 'me';
const CAMPING_PATH = 'camping';
const TOKEN_EXPIRY_DAYS = 3;

function getStoredToken(): string | null {
    const stored = localStorage.getItem('githubAuth');
    if (!stored) return null;
    try {
        const { token, expiry } = JSON.parse(stored);
        if (Date.now() < expiry) return token;
        localStorage.removeItem('githubAuth');
        return null;
    } catch {
        localStorage.removeItem('githubAuth');
        return null;
    }
}

function setStoredToken(token: string): void {
    const expiry = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem('githubAuth', JSON.stringify({ token, expiry }));
}

const WORKFLOWS = {
    rotation: 'camping-rotation.yml',
    favorites: 'camping-favorites.yml',
    manual: 'camping-manual.yml'
};

interface RecArea {
    id: string;
    name: string;
    state: string;
    latitude: number;
    longitude: number;
    distanceMiles: number;
    provider?: string;
    lastScanned?: string | null;
    bookingHorizon?: number | null;
    weekendDates?: string[];
    totalCampgrounds?: number;
    notified?: boolean;
    lastNotifiedAt?: string | null;
    scanError?: boolean;
}

interface FavoritesData {
    favorites: string[];
    disabled: string[];
    autoDisabled?: string[];
    settings: {
        notificationsEnabled: boolean;
    };
}

interface ScanState {
    currentIndex: number;
    sitesPerRun: number;
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

async function triggerScanWorkflow(token: string, areaId: string): Promise<void> {
    await fetch(`https://api.github.com/repos/${REPO_OWNER}/${WORKFLOW_REPO}/actions/workflows/camping-manual.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            ref: 'master',
            inputs: {
                sites: areaId
            }
        })
    });
}

interface WorkflowState {
    rotation: boolean;
    favorites: boolean;
}

async function getWorkflowStates(token: string): Promise<WorkflowState> {
    const states: WorkflowState = { rotation: false, favorites: false };
    
    for (const [key, filename] of Object.entries(WORKFLOWS)) {
        if (key === 'manual') continue;
        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${WORKFLOW_REPO}/actions/workflows/${filename}`,
                {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            if (response.ok) {
                const data = await response.json();
                states[key as keyof WorkflowState] = data.state === 'active';
            }
        } catch (e) {
            console.error(`Error fetching workflow state for ${key}:`, e);
        }
    }
    
    return states;
}

async function setWorkflowEnabled(token: string, workflow: 'rotation' | 'favorites', enabled: boolean): Promise<boolean> {
    const filename = WORKFLOWS[workflow];
    const action = enabled ? 'enable' : 'disable';
    
    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${WORKFLOW_REPO}/actions/workflows/${filename}/${action}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        return response.ok || response.status === 204;
    } catch (e) {
        console.error(`Error ${action}ing workflow ${workflow}:`, e);
        return false;
    }
}

const SCAN_COOLDOWN_MS = 15 * 60 * 1000;

function getScanTime(areaKey: string): number | null {
    const stored = localStorage.getItem(`camping-scan-${areaKey}`);
    return stored ? parseInt(stored, 10) : null;
}

function setScanTime(areaKey: string, time: number): void {
    localStorage.setItem(`camping-scan-${areaKey}`, time.toString());
}

function getMinutesSinceScan(areaKey: string): number | null {
    const scanTime = getScanTime(areaKey);
    if (!scanTime) return null;
    return Math.floor((Date.now() - scanTime) / 60000);
}

function canScan(areaKey: string): boolean {
    const scanTime = getScanTime(areaKey);
    if (!scanTime) return true;
    return Date.now() - scanTime >= SCAN_COOLDOWN_MS;
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
    const [token, setToken] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(() => {
        return !!getStoredToken();
    });
    const [showForm, setShowForm] = useState(() => {
        return !getStoredToken();
    });
    
    useEffect(() => {
        const savedToken = getStoredToken();
        if (savedToken) {
            handleLogin(savedToken);
        } else {
            document.documentElement.style.visibility = 'visible';
        }
    }, []);
    
    const handleLogin = async (tokenToUse?: string) => {
        const loginToken = tokenToUse || token;
        setError(false);
        setLoading(true);
        setShowForm(false);
        
        try {
            await githubAPI(loginToken, '/user');
            setStoredToken(loginToken);
            document.documentElement.style.visibility = 'visible';
            onLogin(loginToken);
        } catch (err) {
            console.error('Login failed:', err);
            setError(true);
            setLoading(false);
            setShowForm(true);
            document.documentElement.style.visibility = 'visible';
        }
    };
    
    return (
        <div id="login-screen">
            <div id="login-box">
                <h1>Camping</h1>
                {showForm && (
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
                )}
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
                placeholder="Search recreation areas..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="search-input"
            />
        </div>
    );
}

function RecAreaCard({ 
    areaId,
    area,
    isFavorite,
    isDisabled,
    isAutoDisabled,
    favoriteCount,
    isSaving,
    onToggleFavorite,
    onToggleDisabled,
    onScan
}: { 
    areaId: string;
    area: RecArea;
    isFavorite: boolean;
    isDisabled: boolean;
    isAutoDisabled: boolean;
    favoriteCount: number;
    isSaving: boolean;
    onToggleFavorite: () => void;
    onToggleDisabled: () => void;
    onScan: () => void;
}) {
    const [isScanning, setIsScanning] = React.useState(false);
    const weekendDates = area.weekendDates || [];
    const hasAvailability = weekendDates.length > 0;
    const scannable = canScan(areaId);
    const minutesAgo = getMinutesSinceScan(areaId);
    
    // Extract numeric rec area ID for URL building
    const numericId = areaId.replace('recgov-', '').replace('reserveca-', '');
    const provider = area.provider || 'RecreationDotGov';
    
    // Build booking URLs based on provider
    const buildBookingUrl = (date: string) => {
        // Parse date in local timezone
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        
        if (provider === 'ReserveCalifornia') {
            // Format: https://reservecalifornia.com/park/{parkId}?date=YYYY-MM-DD&night=1
            return `https://reservecalifornia.com/park/${numericId}?date=${date}&night=1`;
        } else {
            // RecreationDotGov
            // Format: checkin=MM/DD/YYYY&checkout=MM/DD/YYYY (1 night)
            const checkin = dateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            const checkoutDate = new Date(year, month - 1, day + 1);
            const checkout = checkoutDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            
            return `https://www.recreation.gov/search?entity_id=${numericId}&entity_type=recarea&inventory_type=camping&checkin=${checkin}&checkout=${checkout}`;
        }
    };
    
    const handleScanClick = async () => {
        setIsScanning(true);
        await onScan();
        setTimeout(() => setIsScanning(false), 1000);
    };
    
    return (
        <div className={`rec-area-card ${(isDisabled || isAutoDisabled) ? 'disabled' : ''}`}>
            <div className="card-header">
                <div className="card-title">
                    <h3>{area.name}</h3>
                    <div className="card-meta">
                        <span className="distance">{Math.round(area.distanceMiles)} mi</span>
                        {area.totalCampgrounds !== undefined && (
                            <span className="campground-count">{area.totalCampgrounds} campgrounds</span>
                        )}
                        {area.bookingHorizon && (
                            <span className="booking-horizon">{area.bookingHorizon}d horizon</span>
                        )}
                    </div>
                </div>
                <div className="card-actions">
                    <button 
                        className={`favorite-button ${isFavorite ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        disabled={isSaving || (!isFavorite && favoriteCount >= 5)}
                    >
                        {isFavorite ? '★' : '☆'}
                    </button>
                    <button 
                        className={`disable-button ${(isDisabled || isAutoDisabled) ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleDisabled(); }}
                        title={(isDisabled || isAutoDisabled) ? 'Enable in rotation' : 'Disable from rotation'}
                        disabled={isSaving}
                    >
                        {(isDisabled || isAutoDisabled) ? '✓' : '✕'}
                    </button>
                </div>
            </div>
            
            <div className="card-content">
                {hasAvailability ? (
                    <div className="availability-info">
                        <div className="booking-buttons">
                            {weekendDates.slice(0, 5).map((date, idx) => {
                                // Parse date in local timezone to avoid UTC offset issues
                                const [year, month, day] = date.split('-').map(Number);
                                const dateObj = new Date(year, month - 1, day);
                                const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                                const displayDate = dateObj.toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric' 
                                });
                                
                                return (
                                    <a
                                        key={idx}
                                        href={buildBookingUrl(date)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="booking-button"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="booking-button-name">{dayOfWeek}</div>
                                        <div className="booking-button-date">{displayDate}</div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                ) : isAutoDisabled ? (
                    <div className="availability-status no-availability">
                        Disabled (no campgrounds found)
                    </div>
                ) : isDisabled ? (
                    <div className="availability-status no-availability">
                        Disabled manually
                    </div>
                ) : area.scanError ? (
                    <div className="availability-status scan-error">
                        Scan failed
                    </div>
                ) : area.lastScanned ? (
                    <div className="availability-status no-availability">
                        No weekend availability found
                    </div>
                ) : (
                    <div className="availability-status not-scanned">
                        Not yet scanned
                    </div>
                )}
                
                <div className="card-footer">
                    <span className="provider-label">{area.provider || 'Recreation.gov'}</span>
                    <div className="footer-right">
                        {area.lastScanned && (
                            <span className="last-scanned">
                                {new Date(area.lastScanned).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                })}
                            </span>
                        )}
                        <button 
                            className={`scan-button ${!scannable || isScanning ? 'on-cooldown' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleScanClick(); }}
                            disabled={!scannable || isScanning}
                        >
                            {isScanning ? 'Scanning...' : scannable ? 'Scan now' : `Scanned ${minutesAgo}m ago`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabBar({ activeTab, onTabChange, favoriteCount }: { 
    activeTab: 'all' | 'favorites', 
    onTabChange: (tab: 'all' | 'favorites') => void,
    favoriteCount: number
}) {
    return (
        <div className="tab-bar">
            <button 
                className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => onTabChange('all')}
            >
                All Areas
            </button>
            <button 
                className={`tab-button ${activeTab === 'favorites' ? 'active' : ''}`}
                onClick={() => onTabChange('favorites')}
            >
                Favorites {favoriteCount > 0 && `(${favoriteCount})`}
            </button>
        </div>
    );
}

function CampingApp({ token }: { token: string }) {
    const [recAreas, setRecAreas] = useState<RecArea[]>([]);
    const [favorites, setFavorites] = useState<FavoritesData>({ favorites: [], disabled: [], autoDisabled: [], settings: { notificationsEnabled: false } });
    const [favoritesSha, setFavoritesSha] = useState<string | null>(null);
    const [scanState, setScanState] = useState<ScanState>({
        currentIndex: 0,
        sitesPerRun: 4
    });
    const [scanStateSha, setScanStateSha] = useState<string | null>(null);
    const [workflowStates, setWorkflowStates] = useState<WorkflowState>({ rotation: false, favorites: false });
    const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingAreaId, setSavingAreaId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [recAreasResult, favResult, scanStateResult, workflows] = await Promise.all([
                fetchFile(token, `${CAMPING_PATH}/rec-areas.json`),
                fetchFile(token, `${CAMPING_PATH}/favorites.json`),
                fetchFile(token, `${CAMPING_PATH}/scan-state.json`),
                getWorkflowStates(token)
            ]);
            
            if (recAreasResult.data) {
                setRecAreas(recAreasResult.data as RecArea[]);
            }
            
            if (favResult.data) {
                setFavorites(favResult.data);
                setFavoritesSha(favResult.sha);
            }
            
            if (scanStateResult.data) {
                setScanState(scanStateResult.data);
                setScanStateSha(scanStateResult.sha);
            }
            
            setWorkflowStates(workflows);
        } catch (e) {
            console.error('Error loading data:', e);
        }
        setLoading(false);
    };


    const handleScan = async (areaId: string) => {
        try {
            await triggerScanWorkflow(token, areaId);
            setScanTime(areaId, Date.now());
        } catch (e) {
            console.error('Error triggering scan:', e);
        }
    };

    const saveFavorites = async (newFavorites: FavoritesData, areaId: string) => {
        setSavingAreaId(areaId);
        
        // Optimistically update state immediately
        setFavorites(newFavorites);
        
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
        } catch (e) {
            console.error('Error saving favorites:', e);
            // On error, reload to get actual state from GitHub
            const result = await fetchFile(token, `${CAMPING_PATH}/favorites.json`);
            setFavorites(result.data);
            setFavoritesSha(result.sha);
        }
        setSavingAreaId(null);
    };

    const saveScanState = async (newScanState: ScanState) => {
        try {
            await saveFile(
                token,
                `${CAMPING_PATH}/scan-state.json`,
                newScanState,
                scanStateSha,
                'Update scan settings'
            );
            const result = await fetchFile(token, `${CAMPING_PATH}/scan-state.json`);
            setScanStateSha(result.sha);
            setScanState(newScanState);
        } catch (e) {
            console.error('Error saving scan state:', e);
        }
    };

    const toggleFavorite = (areaKey: string) => {
        const newFavorites = { ...favorites };
        
        if (newFavorites.favorites.includes(areaKey)) {
            newFavorites.favorites = newFavorites.favorites.filter(f => f !== areaKey);
        } else {
            if (newFavorites.favorites.length >= 5) {
                return;
            }
            newFavorites.favorites = [...newFavorites.favorites, areaKey];
        }
        
        saveFavorites(newFavorites, areaKey);
    };

    const toggleDisabled = (areaKey: string) => {
        const newFavorites = { ...favorites };
        const isAutoDisabled = (newFavorites.autoDisabled || []).includes(areaKey);
        const isManuallyDisabled = newFavorites.disabled.includes(areaKey);
        
        if (isAutoDisabled) {
            newFavorites.autoDisabled = (newFavorites.autoDisabled || []).filter(d => d !== areaKey);
        } else if (isManuallyDisabled) {
            newFavorites.disabled = newFavorites.disabled.filter(d => d !== areaKey);
        } else {
            newFavorites.disabled = [...newFavorites.disabled, areaKey];
        }
        
        saveFavorites(newFavorites, areaKey);
    };

    const toggleWorkflow = async (workflow: 'rotation' | 'favorites') => {
        const currentState = workflowStates[workflow];
        const newState = !currentState;
        setWorkflowStates(prev => ({ ...prev, [workflow]: newState }));
        const success = await setWorkflowEnabled(token, workflow, newState);
        if (!success) {
            setWorkflowStates(prev => ({ ...prev, [workflow]: currentState }));
        }
    };

    const toggleNotifications = () => {
        const newFavorites = {
            ...favorites,
            settings: {
                ...favorites.settings,
                notificationsEnabled: !favorites.settings.notificationsEnabled
            }
        };
        saveFavorites(newFavorites, '');
    };

    const filteredAreas = recAreas.filter(area => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return area.name.toLowerCase().includes(query);
    });

    const sortedAreas = [...filteredAreas].sort((areaA, areaB) => {
        const isFavA = favorites.favorites.includes(areaA.id);
        const isFavB = favorites.favorites.includes(areaB.id);
        const isDisabledA = favorites.disabled.includes(areaA.id) || (favorites.autoDisabled || []).includes(areaA.id);
        const isDisabledB = favorites.disabled.includes(areaB.id) || (favorites.autoDisabled || []).includes(areaB.id);
        const hasAvailA = (areaA.weekendDates || []).length > 0;
        const hasAvailB = (areaB.weekendDates || []).length > 0;
        const hasErrorA = (areaA.scanError || false) && !isDisabledA;
        const hasErrorB = (areaB.scanError || false) && !isDisabledB;
        const hasNoAvailA = !!areaA.lastScanned && !hasAvailA && !hasErrorA && !isDisabledA;
        const hasNoAvailB = !!areaB.lastScanned && !hasAvailB && !hasErrorB && !isDisabledB;
        
        const getPriority = (isFav: boolean, hasAvail: boolean, hasError: boolean, hasNoAvail: boolean, isDisabled: boolean) => {
            if (isFav) return 0;
            if (hasAvail) return 1;
            if (hasError) return 2;
            if (hasNoAvail) return 3;
            if (isDisabled) return 5;
            return 4;
        };
        
        const priorityA = getPriority(isFavA, hasAvailA, hasErrorA, hasNoAvailA, isDisabledA);
        const priorityB = getPriority(isFavB, hasAvailB, hasErrorB, hasNoAvailB, isDisabledB);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        return areaA.distanceMiles - areaB.distanceMiles;
    });

    const displayAreas = activeTab === 'favorites'
        ? sortedAreas.filter(area => favorites.favorites.includes(area.id))
        : sortedAreas;

    if (loading) {
        return <div id="loading-screen">Loading...</div>;
    }

    // Calculate last scan from most recent area scan
    const lastScanDate = recAreas.length > 0
        ? (() => {
            const scannedAreas = recAreas.filter(a => a.lastScanned);
            if (scannedAreas.length === 0) return 'Never';
            const mostRecent = scannedAreas.reduce((latest, area) => {
                const areaTime = new Date(area.lastScanned!).getTime();
                const latestTime = new Date(latest.lastScanned!).getTime();
                return areaTime > latestTime ? area : latest;
            });
            return new Date(mostRecent.lastScanned!).toLocaleString();
        })()
        : 'Never';

    const favoriteCount = favorites.favorites.length;
    const totalAreas = recAreas.length;
    const scannedAreas = recAreas.filter(a => a.lastScanned).length;

    const scrollToBottom = () => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div id="camping-app">
            <header id="camping-header">
                <div>
                    <h1>California Camping</h1>
                    <div className="stats">
                        <span>{totalAreas} recreation areas</span>
                        <span>•</span>
                        <span>{scannedAreas} scanned</span>
                        <span>•</span>
                        <span>Last scan: {lastScanDate}</span>
                    </div>
                </div>
                <Tooltip title="Jump to bottom" arrow>
                    <button
                        onClick={scrollToBottom}
                        className="jump-to-bottom-button"
                        aria-label="Jump to bottom"
                    >
                        ↓
                    </button>
                </Tooltip>
            </header>
            
            <div className="scan-controls">
                <div className="settings-row">
                    <FormControlLabel
                        control={
                            <Switch
                                checked={workflowStates.rotation}
                                onChange={() => toggleWorkflow('rotation')}
                                sx={{
                                    '& .MuiSwitch-switchBase': {
                                        color: '#9c9588',
                                    },
                                    '& .MuiSwitch-track': {
                                        backgroundColor: '#6b635a',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: '#4ade80',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: '#4ade80',
                                    },
                                }}
                            />
                        }
                        label="Daily Rotation Scan"
                        sx={{ color: '#e8e4df', '& .MuiFormControlLabel-label': { fontSize: '14px' } }}
                    />
                    
                    <FormControlLabel
                        control={
                            <Switch
                                checked={workflowStates.favorites}
                                onChange={() => toggleWorkflow('favorites')}
                                sx={{
                                    '& .MuiSwitch-switchBase': {
                                        color: '#9c9588',
                                    },
                                    '& .MuiSwitch-track': {
                                        backgroundColor: '#6b635a',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: '#4ade80',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: '#4ade80',
                                    },
                                }}
                            />
                        }
                        label="Favorites Scan (2x/day)"
                        sx={{ color: '#e8e4df', '& .MuiFormControlLabel-label': { fontSize: '14px' } }}
                    />
                    
                    <FormControlLabel
                        control={
                            <Switch
                                checked={favorites.settings.notificationsEnabled}
                                onChange={toggleNotifications}
                                sx={{
                                    '& .MuiSwitch-switchBase': {
                                        color: '#9c9588',
                                    },
                                    '& .MuiSwitch-track': {
                                        backgroundColor: '#6b635a',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: '#4ade80',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: '#4ade80',
                                    },
                                }}
                            />
                        }
                        label="Discord Notifications"
                        sx={{ color: '#e8e4df', '& .MuiFormControlLabel-label': { fontSize: '14px' } }}
                    />
                </div>
            </div>
            
            <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} favoriteCount={favoriteCount} />
            
            {activeTab === 'favorites' && (
                <div className="favorites-limit-label">You can have up to 5 favorites</div>
            )}
            
            <div id="rec-areas-list">
                {displayAreas.length === 0 ? (
                    <div className="empty-state">
                        {activeTab === 'favorites' 
                            ? 'No favorites yet. Star some recreation areas from the All Areas tab!'
                            : totalAreas === 0
                            ? 'No recreation areas loaded. This may be a data loading issue.'
                            : 'No areas match your search.'
                        }
                    </div>
                ) : (
                    displayAreas.map(area => (
                        <RecAreaCard
                            key={area.id}
                            areaId={area.id}
                            area={area}
                            isFavorite={favorites.favorites.includes(area.id)}
                            isDisabled={favorites.disabled.includes(area.id)}
                            isAutoDisabled={(favorites.autoDisabled || []).includes(area.id)}
                            favoriteCount={favoriteCount}
                            isSaving={savingAreaId === area.id}
                            onToggleFavorite={() => toggleFavorite(area.id)}
                            onToggleDisabled={() => toggleDisabled(area.id)}
                            onScan={() => handleScan(area.id)}
                        />
                    ))
                )}
            </div>
            
            <div className="scroll-to-top-container">
                <Tooltip title="Jump to top" arrow>
                    <button
                        onClick={scrollToTop}
                        className="jump-to-top-button"
                        aria-label="Jump to top"
                    >
                        ↑
                    </button>
                </Tooltip>
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

