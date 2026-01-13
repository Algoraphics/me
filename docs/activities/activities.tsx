import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Slider, ToggleButtonGroup, ToggleButton } from '@mui/material';

const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const ACTIVITIES_PATH = 'activities/activities.json';
const TOKEN_EXPIRY_DAYS = 3;

const DEV_MODE = false;

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

function clearStoredToken(): void {
    localStorage.removeItem('githubAuth');
}


interface Activity {
    name: string;
    description: string;
    idealWeather?: string[];
    avoidWeather?: string[];
    months?: string[];
    numPeople: { min: number; max: number };
    distance: string;
    fitnessLevel: string;
    setting: string;
    timeCommitment: { min: number; max: number };
}

interface ActivitiesData {
    [key: string]: Activity;
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

function getCachedActivities() {
    const cached = localStorage.getItem('activitiesCache');
    if (!cached) return null;
    
    try {
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        const hoursSinceCache = (now - timestamp) / (1000 * 60 * 60);
        
        if (hoursSinceCache < 24) {
            console.log(`Using cached data (${hoursSinceCache.toFixed(1)} hours old)`);
            return data;
        } else {
            console.log('Cache expired (>24 hours)');
            return null;
        }
    } catch (e) {
        console.error('Error reading cache:', e);
        return null;
    }
}

function setCachedActivities(data: ActivitiesData) {
    const cacheData = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem('activitiesCache', JSON.stringify(cacheData));
}

function invalidateCache() {
    localStorage.removeItem('activitiesCache');
    console.log('Cache invalidated');
}

async function fetchActivities(token: string, useCache = true): Promise<ActivitiesData> {
    if (useCache) {
        const cached = getCachedActivities();
        if (cached) {
            return cached;
        }
    }
    
    console.log('Fetching activities from GitHub...');
    const fileData = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ACTIVITIES_PATH}`);
    
    const base64Content = fileData.content.replace(/\n/g, '');
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const content = new TextDecoder('utf-8').decode(bytes);
    const activities = JSON.parse(content);
    
    setCachedActivities(activities);
    return activities;
}

function LoginScreen({ onLogin }: { onLogin: (token: string, data: ActivitiesData) => void }) {
    const [token, setToken] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        const savedToken = getStoredToken();
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
            // Clear cache and fetch fresh data on login
            invalidateCache();
            const data = await fetchActivities(loginToken, false);
            
            setStoredToken(loginToken);
            document.documentElement.style.visibility = 'visible';
            onLogin(loginToken, data);
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
                <h1>Activities</h1>
                <form id="login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                    <input 
                        type="text" 
                        name="username"
                        defaultValue="activities"
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
                <div id="loading-message" style={{ display: loading ? 'block' : 'none' }}>Loading activities...</div>
            </div>
        </div>
    );
}

const WEATHER_OPTIONS = [
    { value: 'sun', src: '../emoji/blob/emoji_u2600.svg', label: 'Sun', alt: '☀️' },
    { value: 'overcast', src: '../emoji/blob/emoji_u2601.svg', label: 'Overcast', alt: '☁️' },
    { value: 'foggy', src: '../emoji/blob/emoji_u1f32b.svg', label: 'Foggy', alt: '🌫️' },
    { value: 'windy', src: '../emoji/blob/emoji_u1f4a8.svg', label: 'Windy', alt: '💨' },
    { value: 'rain', src: '../emoji/blob/emoji_u1f327.svg', label: 'Rain', alt: '🌧️' },
    { value: 'wet', src: '../emoji/blob/emoji_u1f302.svg', label: 'Wet', alt: '🌂' },
    { value: 'hot', src: '../emoji/blob/emoji_u1f525.svg', label: 'Hot', alt: '🔥' },
    { value: 'cold', src: '../emoji/blob/emoji_u2744.svg', label: 'Cold', alt: '❄️' }
];

const FITNESS_OPTIONS = [
        { value: 'relaxing', src: '../emoji/blob/emoji_u1f3d6.svg', label: 'Chill', alt: '🏖️' },
    { value: 'easy', src: '../emoji/blob/person walking.svg', label: 'Easy', alt: '🚶' },
    { value: 'moderate', src: '../emoji/blob/person biking.svg', label: 'Moderate', alt: '🚴' },
    { value: 'hard', src: '../emoji/blob/person surfing.svg', label: 'Hard', alt: '🏄' }
];

const SETTING_OPTIONS = [
    { value: 'nature', src: '../emoji/blob/emoji_u1f3de.svg', label: 'Nature', alt: '🏞️' },
    { value: 'city', src: '../emoji/blob/emoji_u1f3d9.svg', label: 'City', alt: '🏙️' },
    { value: 'home', src: '../emoji/blob/emoji_u1f3e1.svg', label: 'Home', alt: '🏡' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_DATA = [
    { name: 'Jan', emoji: '../emoji/blob/emoji_u26c4.svg' }, // ⛄ snowman
    { name: 'Feb', emoji: '../emoji/blob/emoji_u1f496.svg' }, // 💖 sparkling heart
    { name: 'Mar', emoji: '../emoji/blob/emoji_u1f340.svg' }, // 🍀 four leaf clover
    { name: 'Apr', emoji: '../emoji/blob/emoji_u1f327.svg' }, // 🌧️ rain
    { name: 'May', emoji: '../emoji/blob/emoji_u1f337.svg' }, // 🌷 tulip
    { name: 'Jun', emoji: '../emoji/blob/emoji_u1f3d6.svg' }, // 🏖️ beach
    { name: 'Jul', emoji: '../emoji/blob/emoji_u1f386.svg' }, // 🎆 firework
    { name: 'Aug', emoji: '../emoji/blob/emoji_u1f33e.svg' }, // 🌾 ear of rice
    { name: 'Sep', emoji: '../emoji/blob/emoji_u1f342.svg' }, // 🍂 fallen leaves
    { name: 'Oct', emoji: '../emoji/blob/emoji_u1f383.svg' }, // 🎃 pumpkin
    { name: 'Nov', emoji: '../emoji/blob/emoji_u1f983.svg' }, // 🦃 turkey
    { name: 'Dec', emoji: '../emoji/blob/emoji_u1f384.svg' }  // 🎄 christmas tree
];

const toggleStyles = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    '& .MuiToggleButtonGroup-grouped': {
        margin: 0,
        border: '2px solid #575757',
        '&:not(:first-of-type)': {
            borderLeft: 'none',
            marginLeft: 0
        },
        '&:first-of-type': {
            borderTopLeftRadius: '6px',
            borderBottomLeftRadius: '6px'
        },
        '&:last-of-type': {
            borderTopRightRadius: '6px',
            borderBottomRightRadius: '6px'
        }
    },
    '& .MuiToggleButton-root': {
        padding: '6px',
        minWidth: 'auto',
        color: '#b0b0b0',
        position: 'relative' as const,
        '&:hover': {
            backgroundColor: '#3d3d3d',
            boxShadow: 'inset 0 0 0 2px #20c997',
            zIndex: 2
        },
        '&.Mui-selected': {
            backgroundColor: '#10644b',
            color: '#e0e0e0',
            borderColor: '#10644b',
            zIndex: 1,
            '&:hover': {
                backgroundColor: '#127559',
                zIndex: 2
            }
        }
    }
};

function WeatherToggleGroup({ value, onChange }: { value: string[], onChange: (v: string[]) => void }) {
    return (
        <div className="mui-toggle-container">
            <ToggleButtonGroup 
                value={value} 
                onChange={(e, v) => onChange(v || [])} 
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    width: '100%',
                    '& .MuiToggleButtonGroup-grouped': {
                        margin: 0,
                        border: '2px solid #575757',
                        '&:nth-of-type(2), &:nth-of-type(3), &:nth-of-type(4), &:nth-of-type(6), &:nth-of-type(7), &:nth-of-type(8)': {
                            borderLeft: 'none'
                        },
                        '&:nth-of-type(n+5)': {
                            borderTop: 'none'
                        },
                        '&:nth-of-type(1)': {
                            borderTopLeftRadius: '6px'
                        },
                        '&:nth-of-type(4)': {
                            borderTopRightRadius: '6px'
                        },
                        '&:nth-of-type(5)': {
                            borderBottomLeftRadius: '6px'
                        },
                        '&:nth-of-type(8)': {
                            borderBottomRightRadius: '6px'
                        }
                    },
                    '& .MuiToggleButton-root': {
                        ...toggleStyles['& .MuiToggleButton-root']
                    }
                }}
            >
                {WEATHER_OPTIONS.map(opt => (
                    <ToggleButton value={opt.value} key={opt.value}>
                        <img src={opt.src} className="blob-emoji" alt={opt.alt} title={opt.label} />
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </div>
    );
}

function FitnessToggleGroup({ value, onChange, singleSelect }: { value: any, onChange: (v: any) => void, singleSelect?: boolean }) {
    return (
        <div className="mui-toggle-container">
            <ToggleButtonGroup 
                value={value} 
                onChange={(e, v) => {
                    if (singleSelect) {
                        onChange(v || '');
                    } else {
                        onChange(v || []);
                    }
                }} 
                sx={{...toggleStyles, width: '100%'}}
                exclusive={singleSelect}
            >
                {FITNESS_OPTIONS.map(opt => (
                    <ToggleButton value={opt.value} key={opt.value} sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 6px'}}>
                        <img src={opt.src} className="blob-emoji" alt={opt.alt} />
                        <span style={{fontSize: '11px'}}>{opt.label}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </div>
    );
}

function SettingToggleGroup({ value, onChange, singleSelect }: { value: any, onChange: (v: any) => void, singleSelect?: boolean }) {
    return (
        <div className="mui-toggle-container">
            <ToggleButtonGroup 
                value={value} 
                onChange={(e, v) => {
                    if (singleSelect) {
                        onChange(v || '');
                    } else {
                        onChange(v || []);
                    }
                }} 
                sx={{...toggleStyles, width: '100%'}}
                exclusive={singleSelect}
            >
                {SETTING_OPTIONS.map(opt => (
                    <ToggleButton value={opt.value} key={opt.value} sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 6px'}}>
                        <img src={opt.src} className="blob-emoji" alt={opt.alt} />
                        <span style={{fontSize: '11px'}}>{opt.label}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </div>
    );
}

function MonthsToggleGroup({ value, onChange }: { value: string[], onChange: (v: string[]) => void }) {
    return (
        <div className="mui-toggle-container">
            <ToggleButtonGroup 
                value={value} 
                onChange={(e, v) => onChange(v || [])} 
                sx={{...toggleStyles, '& .MuiToggleButton-root': {...toggleStyles['& .MuiToggleButton-root'], fontSize: '13px', padding: '8px 10px'}}}
            >
                {MONTH_NAMES.map(month => (
                    <ToggleButton value={month} key={month}>
                        {month}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </div>
    );
}

function MonthSelector({ selectedMonths, onChange, isFilter = false }: { selectedMonths: string[], onChange: (months: string[]) => void, isFilter?: boolean }) {
    const [selectionState, setSelectionState] = useState<{ firstMonth: number | null, secondMonth: number | null }>({
        firstMonth: null,
        secondMonth: null
    });

    // Calculate range from first to second month (with wrap-around)
    const calculateRange = (start: number, end: number): number[] => {
        const range: number[] = [];
        let current = start;
        
        while (true) {
            range.push(current);
            if (current === end) break;
            current = (current + 1) % 12;
        }
        
        return range;
    };

    const handleMonthClick = (monthIndex: number) => {
        if (isFilter) {
            // Filter mode: single month selection
            const monthName = MONTH_DATA[monthIndex].name;
            const newSelection = selectedMonths.includes(monthName) ? [] : [monthName];
            onChange(newSelection);
        } else {
            // Form mode: range selection logic
            if (selectionState.firstMonth === null) {
                // First selection
                setSelectionState({ firstMonth: monthIndex, secondMonth: null });
                onChange([MONTH_DATA[monthIndex].name]);
            } else if (selectionState.secondMonth === null && monthIndex !== selectionState.firstMonth) {
                // Second selection - calculate range
                const range = calculateRange(selectionState.firstMonth, monthIndex);
                const monthNames = range.map(i => MONTH_DATA[i].name);
                setSelectionState({ firstMonth: selectionState.firstMonth, secondMonth: monthIndex });
                onChange(monthNames);
            } else {
                // Third selection or clicking same month - reset and start over
                setSelectionState({ firstMonth: monthIndex, secondMonth: null });
                onChange([MONTH_DATA[monthIndex].name]);
            }
        }
    };

    const isMonthSelected = (monthIndex: number): boolean => {
        return selectedMonths.includes(MONTH_DATA[monthIndex].name);
    };

    const getMonthState = (monthIndex: number): 'first' | 'second' | 'selected' | 'none' => {
        if (isFilter) {
            // Filter mode: only show selected state
            return isMonthSelected(monthIndex) ? 'selected' : 'none';
        } else {
            // Form mode: show range selection states
            if (selectionState.firstMonth === monthIndex) return 'first';
            if (selectionState.secondMonth === monthIndex) return 'second';
            if (isMonthSelected(monthIndex)) return 'selected';
            return 'none';
        }
    };

    return (
        <div className="month-selector">
            <div className="month-grid">
                {MONTH_DATA.map((month, index) => {
                    const state = getMonthState(index);
                    return (
                        <button
                            key={month.name}
                            type="button"
                            className={`month-button ${state}`}
                            onClick={() => handleMonthClick(index)}
                        >
                            <img src={month.emoji} className="month-emoji blob-emoji" alt={month.name} />
                            <span className="month-name">{month.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function PeopleSlider({ value, onChange, isRange }: { value: number | number[], onChange: (v: any) => void, isRange?: boolean }) {
    const peopleMarks = [1, 2, 3, 4, 5, 6, 7, 8].map(v => ({ value: v, label: v.toString() }));
    
    return (
        <div className="mui-slider-container">
            <Slider
                value={value}
                onChange={(e, v) => onChange(v)}
                min={1}
                max={8}
                step={1}
                marks={peopleMarks}
                valueLabelDisplay="auto"
                track={isRange !== false ? 'normal' : false}
                sx={{
                    color: '#20c997',
                    '& .MuiSlider-markLabel': { color: '#b0b0b0', fontSize: '12px' },
                    '& .MuiSlider-mark': { backgroundColor: '#575757' },
                    '& .MuiSlider-rail': { backgroundColor: '#3d3d3d' },
                    '& .MuiSlider-valueLabel': { backgroundColor: '#20c997' }
                }}
            />
        </div>
    );
}

function TimeCommitmentSlider({ value, onChange, isRange }: { value: number | number[], onChange: (v: any) => void, isRange?: boolean }) {
    const timeMarks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => ({ value: v, label: `${v}h` }));
    
    return (
        <div className="mui-slider-container">
            <Slider
                value={value}
                onChange={(e, v) => onChange(v)}
                min={1}
                max={10}
                step={0.5}
                marks={timeMarks}
                valueLabelDisplay="auto"
                track={isRange !== false ? 'normal' : false}
                valueLabelFormat={(v) => {
                    const hours = Math.floor(v);
                    const minutes = Math.round((v % 1) * 60);
                    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
                }}
                sx={{
                    color: '#20c997',
                    '& .MuiSlider-markLabel': { color: '#b0b0b0', fontSize: '11px' },
                    '& .MuiSlider-mark': { backgroundColor: '#575757' },
                    '& .MuiSlider-rail': { backgroundColor: '#3d3d3d' },
                    '& .MuiSlider-valueLabel': { backgroundColor: '#20c997' }
                }}
            />
        </div>
    );
}


function FiltersPanel({ 
    weatherFilter, setWeatherFilter,
    monthsFilter, setMonthsFilter,
    hideYearRound, setHideYearRound,
    peopleMin, setPeopleMin,
    timeCommitMax, setTimeCommitMax,
    fitnessFilter, setFitnessFilter,
    settingFilter, setSettingFilter,
    expandedSections, setExpandedSections,
    panelCollapsed, setPanelCollapsed,
    onClear
}: {
    weatherFilter: string[];
    setWeatherFilter: (v: string[]) => void;
    monthsFilter: string[];
    setMonthsFilter: (v: string[]) => void;
    hideYearRound: boolean;
    setHideYearRound: (v: boolean) => void;
    peopleMin: number;
    setPeopleMin: (v: number) => void;
    timeCommitMax: number;
    setTimeCommitMax: (v: number) => void;
    fitnessFilter: string[];
    setFitnessFilter: (v: string[]) => void;
    settingFilter: string[];
    setSettingFilter: (v: string[]) => void;
    expandedSections: Set<string>;
    setExpandedSections: (v: Set<string>) => void;
    panelCollapsed: boolean;
    setPanelCollapsed: (v: boolean) => void;
    onClear: () => void;
}) {
    const toggleSection = (section: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(section)) {
            newExpanded.delete(section);
        } else {
            newExpanded.add(section);
        }
        setExpandedSections(newExpanded);
    };
    
    const allSections = ['weather', 'fitness', 'setting', 'months', 'timeCommit', 'people'];
    const allCollapsed = expandedSections.size === 0;
    
    const toggleAllSections = () => {
        if (allCollapsed) {
            setExpandedSections(new Set(allSections));
        } else {
            setExpandedSections(new Set());
        }
    };
    
    return (
        <div id="filter-panel" className={panelCollapsed ? 'collapsed' : ''}>
            <div id="filter-header" onClick={() => setPanelCollapsed(!panelCollapsed)}>
                <h2>Filters</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button id="collapse-filters-button" onClick={(e) => { e.stopPropagation(); toggleAllSections(); }}>
                        {allCollapsed ? 'Enable All' : 'Disable All'}
                    </button>
                    <button id="clear-filters-button" onClick={(e) => { e.stopPropagation(); onClear(); }}>Reset All</button>
                    <button id="toggle-filters-button">▼</button>
                </div>
            </div>
            <div id="filter-content">
                <div className={`filter-section ${!expandedSections.has('weather') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('weather')}>
                        <span>Weather</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <WeatherToggleGroup value={weatherFilter} onChange={setWeatherFilter} />
                    </div>
                </div>
                
                <div className={`filter-section ${!expandedSections.has('fitness') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('fitness')}>
                        <span>Fitness Level</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <FitnessToggleGroup value={fitnessFilter} onChange={setFitnessFilter} />
                    </div>
                </div>
                
                <div className={`filter-section ${!expandedSections.has('setting') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('setting')}>
                        <span>Setting</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <SettingToggleGroup value={settingFilter} onChange={setSettingFilter} />
                    </div>
                </div>
                
                <div className={`filter-section ${!expandedSections.has('months') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('months')}>
                        <span>Months</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <MonthSelector selectedMonths={monthsFilter} onChange={setMonthsFilter} isFilter={true} />
                        <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#b0b0b0' }}>
                                <input 
                                    type="checkbox" 
                                    checked={hideYearRound}
                                    onChange={(e) => setHideYearRound(e.target.checked)}
                                    className="custom-checkbox"
                                />
                                Disable year-round activities
                            </label>
                        </div>
                    </div>
                </div>
                
                <div className={`filter-section ${!expandedSections.has('timeCommit') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('timeCommit')}>
                        <span>Max Time Commitment</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <TimeCommitmentSlider value={timeCommitMax} onChange={setTimeCommitMax} isRange={false} />
                    </div>
                </div>
                
                
                <div className={`filter-section ${!expandedSections.has('people') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('people')}>
                        <span>Number of People</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <PeopleSlider value={peopleMin} onChange={setPeopleMin} isRange={false} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SearchBar({ searchQuery, onSearchChange }: { searchQuery: string, onSearchChange: (query: string) => void }) {
    return (
        <div className="search-container">
            <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="search-input"
            />
        </div>
    );
}

function ActivityCard({ 
    activityId, 
    activity, 
    expanded, 
    onToggle, 
    onEdit 
}: { 
    activityId: string; 
    activity: Activity; 
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
}) {
    // Convert URLs in text to clickable links, emojis to blob emojis, and newlines to <br>
    const processText = (text: string) => {
        // First convert newlines to <br> tags
        let processedText = text.replace(/\n/g, '<br>');
        
        // Then convert URLs to links
        processedText = processedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Finally convert emojis to blob emojis
        processedText = processedText.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, (match) => {
            const codePoint = match.codePointAt(0);
            if (codePoint) {
                const hex = codePoint.toString(16).toLowerCase().padStart(4, '0');
                return `<img src="../emoji/blob/emoji_u${hex}.svg" class="blob-emoji" alt="${match}" style="display: inline; vertical-align: middle;">`;
            }
            return match;
        });
        
        return processedText;
    };
    return (
        <div 
            className={`activity-card ${expanded ? 'expanded' : ''}`}
            data-activity-id={activityId}
            onClick={onToggle}
        >
            <div className="activity-header">
                <div>
                    <div className="activity-name" dangerouslySetInnerHTML={{ __html: processText(activity.name) }} />
                    <div className="activity-tags">
                        {activity.setting && (
                            <span className="activity-tag">
                                <img 
                                    src={SETTING_OPTIONS.find(opt => opt.value === activity.setting)?.src || '../emoji/blob/emoji_u1f3e1.svg'} 
                                    className="blob-emoji tag-emoji" 
                                    alt={activity.setting}
                                    title={activity.setting.charAt(0).toUpperCase() + activity.setting.slice(1)}
                                />
                            </span>
                        )}
                        {activity.fitnessLevel && (
                            <span className="activity-tag">
                                {activity.fitnessLevel.charAt(0).toUpperCase() + activity.fitnessLevel.slice(1)}
                            </span>
                        )}
                        {activity.timeCommitment && (
                            <span className="activity-tag">
                                {activity.timeCommitment.min === activity.timeCommitment.max 
                                    ? `${activity.timeCommitment.min} hours`
                                    : `${activity.timeCommitment.min}-${activity.timeCommitment.max} hours`
                                }
                            </span>
                        )}
                        {activity.distance && (
                            <span className="activity-tag">{activity.distance}</span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {expanded && (
                        <button 
                            className="edit-activity-button"
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        >
                            Edit
                        </button>
                    )}
                    <div className="expand-icon">▶</div>
                </div>
            </div>
            
            <div 
                className="activity-description" 
                dangerouslySetInnerHTML={{ __html: processText(activity.description) }}
                onClick={(e) => e.stopPropagation()}
            />
            
            <div className="activity-details" onClick={(e) => e.stopPropagation()}>
                {activity.idealWeather && activity.idealWeather.length > 0 && (
                    <div className="detail-item">
                        <div className="detail-label">Ideal weather</div>
                        <div className="detail-value">{activity.idealWeather.join(', ')}</div>
                    </div>
                )}
                {activity.avoidWeather && activity.avoidWeather.length > 0 && (
                    <div className="detail-item">
                        <div className="detail-label">Bad weather</div>
                        <div className="detail-value">{activity.avoidWeather.join(', ')}</div>
                    </div>
                )}
                {activity.months && activity.months.length > 0 && (
                    <div className="detail-item">
                        <div className="detail-label">Best Months</div>
                        <div className="detail-value">{activity.months.join(', ')}</div>
                    </div>
                )}
                {activity.numPeople && (
                    <div className="detail-item">
                        <div className="detail-label">Number of People</div>
                        <div className="detail-value">{activity.numPeople.min} - {activity.numPeople.max}</div>
                    </div>
                )}
                {activity.timeCommitment && (
                    <div className="detail-item">
                        <div className="detail-label">Time Commitment</div>
                        <div className="detail-value">{activity.timeCommitment.min} - {activity.timeCommitment.max} hours</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ActivityList({ 
    activities, 
    expandedActivities,
    onToggle,
    onEdit,
    filters 
}: { 
    activities: ActivitiesData;
    expandedActivities: Set<string>;
    onToggle: (id: string) => void;
    onEdit: (id: string, activity: Activity) => void;
    filters: any;
}) {
    console.log('🎨 ActivityList rendering with:', Object.keys(activities).length, 'activities');
    console.log('📝 Activity names in render:', Object.values(activities).map(a => a.name));
    const activityMatchesFilters = (activity: Activity): boolean => {
        if (filters.weather.length > 0) {
            const hasAvoidMatch = activity.avoidWeather && 
                activity.avoidWeather.some(w => filters.weather.includes(w));
            
            if (hasAvoidMatch) return false;
        }
        
        if (filters.months.length > 0) {
            if (!activity.months || !activity.months.some(m => filters.months.includes(m))) {
                return false;
            }
        }
        
        if (filters.hideYearRound) {
            if (activity.months && activity.months.length === 12) {
                return false;
            }
        }
        
        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            const nameMatch = activity.name.toLowerCase().includes(query);
            const descMatch = activity.description.toLowerCase().includes(query);
            if (!nameMatch && !descMatch) {
                return false;
            }
        }
        
        if (filters.peopleMin !== null || filters.peopleMax !== null) {
            if (!activity.numPeople) return false;
            if (filters.peopleMin !== null && activity.numPeople.max < filters.peopleMin) return false;
            if (filters.peopleMax !== null && activity.numPeople.min > filters.peopleMax) return false;
        }
        
        if (filters.timeMin !== null || filters.timeMax !== null) {
            if (!activity.timeCommitment) return false;
            if (filters.timeMin !== null && activity.timeCommitment.max < filters.timeMin) return false;
            if (filters.timeMax !== null && activity.timeCommitment.min > filters.timeMax) return false;
        }
        
        if (filters.fitness.length > 0) {
            if (!activity.fitnessLevel || !filters.fitness.includes(activity.fitnessLevel)) {
                return false;
            }
        }
        
        if (filters.settings.length > 0) {
            if (!activity.setting || !filters.settings.includes(activity.setting)) {
                return false;
            }
        }
        
        
        return true;
    };
    
    const filteredIds = Object.keys(activities).filter(id => activityMatchesFilters(activities[id]));
    console.log('🔍 After filtering:', filteredIds.length, 'activities match filters');
    console.log('📝 Filtered activity names:', filteredIds.map(id => activities[id].name));
    
    const sortedIds = filteredIds.sort((a, b) => {
        const activityA = activities[a];
        const activityB = activities[b];
        
        if (filters.weather.length > 0) {
            const aHasIdeal = activityA.idealWeather && 
                activityA.idealWeather.some(w => filters.weather.includes(w));
            const bHasIdeal = activityB.idealWeather && 
                activityB.idealWeather.some(w => filters.weather.includes(w));
            
            if (aHasIdeal && !bHasIdeal) return -1;
            if (!aHasIdeal && bHasIdeal) return 1;
        }
        
        return activityA.name.localeCompare(activityB.name);
    });
    const displayIds = sortedIds;
    
    if (displayIds.length === 0) {
        return (
            <div id="activities-list">
                <div id="loading-activities">No activities match the current filters.</div>
            </div>
        );
    }
    
    console.log('🎭 About to render', displayIds.length, 'ActivityCard components');
    console.log('🆔 Display IDs:', displayIds);
    
    return (
        <div id="activities-list">
            {displayIds.map(id => (
                <ActivityCard
                    key={id}
                    activityId={id}
                    activity={activities[id]}
                    expanded={expandedActivities.has(id)}
                    onToggle={() => onToggle(id)}
                    onEdit={() => onEdit(id, activities[id])}
                />
            ))}
        </div>
    );
}

function AddActivityForm({
    onClose,
    onSave,
    onDelete,
    editingActivity,
    token
}: {
    onClose: () => void;
    onSave: (activity: Activity, id?: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    editingActivity: { id: string; activity: Activity } | null;
    token: string;
}) {
    const [formData, setFormData] = useState<any>({
        name: '',
        description: '',
        idealWeather: [],
        avoidWeather: [],
        selectedMonths: [] as string[],
        people: [1, 8],
        fitnessLevel: 'easy',
        setting: 'wilderness',
        timeCommitment: [2, 4],
        reverseWeather: false
    });
    
    const [status, setStatus] = useState<{ message: string; type: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    
    useEffect(() => {
        if (editingActivity) {
            const act = editingActivity.activity;
            
            const selectedMonths = act.months || [];
            
            setFormData({
                name: act.name,
                description: act.description,
                idealWeather: act.idealWeather || [],
                avoidWeather: act.avoidWeather || [],
                selectedMonths: selectedMonths,
                people: [act.numPeople.min, act.numPeople.max],
                fitnessLevel: act.fitnessLevel,
                setting: act.setting,
                timeCommitment: [act.timeCommitment.min, act.timeCommitment.max],
                reverseWeather: false
            });
        } else {
            setFormData({
                name: '',
                description: '',
                idealWeather: [],
                avoidWeather: [],
                selectedMonths: [] as string[],
                people: [1, 8],
                fitnessLevel: 'easy',
                setting: 'wilderness',
                timeCommitment: [2, 4],
                reverseWeather: false
            });
        }
        setDeleteConfirm(false);
        setStatus(null);
    }, [editingActivity]);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate required fields
        if (!formData.name.trim()) {
            setStatus({ message: 'Activity name is required', type: 'error' });
            return;
        }
        
        const formatTime = (hours: number) => {
            const h = Math.floor(hours);
            const m = Math.round((hours % 1) * 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };
        
        const selectedMonths = formData.selectedMonths;
        
        const activity: Activity = {
            name: formData.name,
            description: formData.description,
            idealWeather: formData.idealWeather,
            avoidWeather: formData.avoidWeather,
            months: selectedMonths,
            numPeople: { min: formData.people[0], max: formData.people[1] },
            distance: '',
            fitnessLevel: formData.fitnessLevel,
            setting: formData.setting,
            timeCommitment: { min: formData.timeCommitment[0], max: formData.timeCommitment[1] }
        };
        
        try {
            await onSave(activity, editingActivity?.id);
            setStatus({ message: `Activity ${editingActivity ? 'updated' : 'added'} successfully!`, type: 'success' });
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error: any) {
            setStatus({ message: 'Failed to save: ' + error.message, type: 'error' });
        }
    };
    
    const handleDelete = async () => {
        if (!deleteConfirm) {
            setDeleteConfirm(true);
            return;
        }
        
        if (editingActivity) {
            try {
                await onDelete(editingActivity.id);
                setStatus({ message: 'Activity deleted successfully!', type: 'success' });
                setTimeout(() => {
                    onClose();
                }, 1500);
            } catch (error: any) {
                setStatus({ message: 'Failed to delete: ' + error.message, type: 'error' });
                setDeleteConfirm(false);
            }
        }
    };
    
    
    return (
        <div className="form-container">
            <div className="form-content">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Activity Name *</label>
                        <input 
                            type="text" 
                            value={formData.name} 
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            required 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Description *</label>
                        <textarea 
                            rows={4}
                            value={formData.description} 
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            required 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Should do this if weather is...</label>
                        <WeatherToggleGroup 
                            value={formData.idealWeather} 
                            onChange={(v) => setFormData({...formData, idealWeather: v})} 
                        />
                    </div>
                    
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <label>Don't do this if weather is...</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#b0b0b0' }}>
                                <input 
                                    type="checkbox" 
                                    checked={formData.reverseWeather}
                                    onChange={(e) => {
                                        const isReverse = e.target.checked;
                                        setFormData({
                                            ...formData, 
                                            reverseWeather: isReverse,
                                            avoidWeather: isReverse 
                                                ? WEATHER_OPTIONS.map(opt => opt.value).filter(w => !formData.idealWeather.includes(w))
                                                : []
                                        });
                                    }}
                                    className="custom-checkbox"
                                />
                                Reverse
                            </label>
                        </div>
                        <WeatherToggleGroup 
                            value={formData.avoidWeather} 
                            onChange={(v) => {
                                setFormData({...formData, avoidWeather: v});
                                // If reverse is checked, update it based on manual changes
                                if (formData.reverseWeather) {
                                    setFormData(prev => ({...prev, reverseWeather: false}));
                                }
                            }} 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Fitness Level</label>
                        <FitnessToggleGroup 
                            value={formData.fitnessLevel} 
                            onChange={(v) => setFormData({...formData, fitnessLevel: v})} 
                            singleSelect 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Setting</label>
                        <SettingToggleGroup 
                            value={formData.setting} 
                            onChange={(v) => setFormData({...formData, setting: v})} 
                            singleSelect 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Months</label>
                        <MonthSelector 
                            selectedMonths={formData.selectedMonths} 
                            onChange={(months) => setFormData({...formData, selectedMonths: months})} 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Time Commitment</label>
                        <TimeCommitmentSlider 
                            value={formData.timeCommitment} 
                            onChange={(v) => setFormData({...formData, timeCommitment: v})} 
                        />
                    </div>
                    
                    
                    <div className="form-group">
                        <label>Number of People</label>
                        <PeopleSlider 
                            value={formData.people} 
                            onChange={(v) => setFormData({...formData, people: v})} 
                        />
                    </div>
                    
                    <div className="form-actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        {editingActivity && (
                            <button 
                                type="button"
                                onClick={handleDelete}
                                style={{ background: '#8b0000' }}
                            >
                                {deleteConfirm ? 'Sure?' : 'Delete Activity'}
                            </button>
                        )}
                        <button type="submit" className="primary">{editingActivity ? 'Update Activity' : 'Add Activity'}</button>
                    </div>
                    {status && (
                        <div id="form-status" className={status.type} style={{ display: 'block' }}>
                            {status.message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}

function ActivitiesApp() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [token, setToken] = useState('');
    const [activities, setActivities] = useState<ActivitiesData | null>(null);
    const [fileSha, setFileSha] = useState<string | null>(null);
    const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
    const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit'>('list');
    const [editingActivity, setEditingActivity] = useState<{ id: string; activity: Activity } | null>(null);
    
    const [weatherFilter, setWeatherFilter] = useState<string[]>([]);
    const [monthsFilter, setMonthsFilter] = useState<string[]>([]);
    const [hideYearRound, setHideYearRound] = useState<boolean>(false);
    const [peopleMin, setPeopleMin] = useState<number>(2);
    const [timeCommitMax, setTimeCommitMax] = useState<number>(4);
    const [fitnessFilter, setFitnessFilter] = useState<string[]>([]);
    const [settingFilter, setSettingFilter] = useState<string[]>([]);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['weather', 'fitness', 'setting', 'months', 'timeCommit', 'people']));
    const [panelCollapsed, setPanelCollapsed] = useState(() => {
        // Collapse filter panel by default on mobile
        return window.innerWidth <= 768;
    });
    const [searchQuery, setSearchQuery] = useState('');
    
    const filters = {
        weather: expandedSections.has('weather') ? weatherFilter : [],
        months: expandedSections.has('months') ? monthsFilter : [],
        hideYearRound: expandedSections.has('months') ? hideYearRound : false,
        peopleMin: expandedSections.has('people') ? peopleMin : null,
        peopleMax: null,
        timeMin: null,
        timeMax: expandedSections.has('timeCommit') ? timeCommitMax : null,
        fitness: expandedSections.has('fitness') ? fitnessFilter : [],
        settings: expandedSections.has('setting') ? settingFilter : [],
        searchQuery: searchQuery.trim()
    };
    
    const handleLogin = (loginToken: string, data: ActivitiesData) => {
        setToken(loginToken);
        setActivities(data);
        setIsLoggedIn(true);
    };
    
    const handleLogout = () => {
        clearStoredToken();
        localStorage.removeItem('activitiesCache');
        setIsLoggedIn(false);
        setToken('');
        setActivities(null);
        setExpandedActivities(new Set());
    };
    
    const handleToggleActivity = (id: string) => {
        const newExpanded = new Set(expandedActivities);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedActivities(newExpanded);
    };
    
    const handleEditActivity = (id: string, activity: Activity) => {
        setEditingActivity({ id, activity });
        setCurrentView('edit');
    };
    
    const handleAddActivity = () => {
        setEditingActivity(null);
        setCurrentView('add');
    };
    
    const handleBackToList = () => {
        setCurrentView('list');
        setEditingActivity(null);
    };
    
    const refreshActivities = async (fallbackData?: ActivitiesData) => {
        console.log('🔄 refreshActivities() called');
        console.log('📊 Current activities count:', activities ? Object.keys(activities).length : 'null');
        console.log('📦 Fallback data count:', fallbackData ? Object.keys(fallbackData).length : 'none');
        
        try {
            console.log('🌐 Fetching fresh data from GitHub...');
            const freshData = await fetchActivities(token, false); // Force fresh fetch
            console.log('✅ Fresh data received:', Object.keys(freshData).length, 'activities');
            console.log('📝 Fresh activity names:', Object.values(freshData).map(a => a.name));
            
            setActivities(freshData);
            console.log('🎯 State updated with fresh data');
            return freshData;
        } catch (error) {
            console.error('❌ Failed to refresh activities:', error);
            // Use fallback data if provided
            if (fallbackData) {
                console.log('🔄 Using fallback data instead');
                setActivities(fallbackData);
                console.log('📝 Fallback activity names:', Object.values(fallbackData).map(a => a.name));
            }
            return null;
        }
    };
    
    const generateActivityId = (name: string): string => {
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    };
    
    const handleSaveActivity = async (activity: Activity, existingId?: string) => {
        const activityId = existingId || generateActivityId(activity.name);
        
        let currentSha = fileSha;
        if (!currentSha) {
            const fileData = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ACTIVITIES_PATH}`);
            currentSha = fileData.sha;
        }
        
        const updatedData = { ...activities!, [activityId]: activity };
        const newContent = JSON.stringify(updatedData, null, 2);
        
        const result = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ACTIVITIES_PATH}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `${existingId ? 'Update' : 'Add'} activity: ${activity.name}`,
                content: btoa(unescape(encodeURIComponent(newContent))),
                sha: currentSha
            })
        });
        
        console.log('💾 Save successful to GitHub!');
        console.log('📄 New SHA:', result.content.sha);
        setFileSha(result.content.sha);
        
        console.log('🗑️ Invalidating cache...');
        invalidateCache();
        
        console.log('📊 Updated data contains:', Object.keys(updatedData).length, 'activities');
        console.log('📝 Updated activity names:', Object.values(updatedData).map(a => a.name));
        
        // Update state directly with the data we just saved
        console.log('🎯 Updating state with saved data...');
        setActivities(updatedData);
        
        handleBackToList();
    };
    
    const handleDeleteActivity = async (id: string) => {
        let currentSha = fileSha;
        if (!currentSha) {
            const fileData = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ACTIVITIES_PATH}`);
            currentSha = fileData.sha;
        }
        
        const { [id]: removed, ...remaining } = activities!;
        const newContent = JSON.stringify(remaining, null, 2);
        
        const result = await githubAPI(token, `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ACTIVITIES_PATH}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `Delete activity: ${activities![id].name}`,
                content: btoa(unescape(encodeURIComponent(newContent))),
                sha: currentSha
            })
        });
        
        setFileSha(result.content.sha);
        invalidateCache();
        
        // Update state directly with the remaining activities
        console.log('🗑️ Updating state after deletion...');
        setActivities(remaining);
        
        handleBackToList();
    };
    
    const handleClearFilters = () => {
        setWeatherFilter([]);
        setMonthsFilter([]);
        setHideYearRound(false);
        setPeopleMin(2);
        setSearchQuery('');
        setTimeCommitMax(4);
        setFitnessFilter([]);
        setSettingFilter([]);
    };
    
    if (!isLoggedIn) {
        return <LoginScreen onLogin={handleLogin} />;
    }
    
    if (currentView === 'add' || currentView === 'edit') {
        return (
            <div id="activities-container" style={{ display: 'block' }}>
                <div id="header">
                    <h1>{currentView === 'add' ? 'Add Activity' : 'Edit Activity'}</h1>
                    <div id="header-actions">
                        <button onClick={handleBackToList}>← Back to List</button>
                        <button id="logout-button" onClick={handleLogout}>Logout</button>
                    </div>
                </div>
                
                <div id="main-content" style={{ justifyContent: 'center' }}>
                    <AddActivityForm 
                        onSave={handleSaveActivity}
                        onDelete={handleDeleteActivity}
                        onClose={handleBackToList}
                        editingActivity={editingActivity}
                        token={token}
                    />
                </div>
            </div>
        );
    }

    return (
        <div id="activities-container" style={{ display: 'block' }}>
            <div id="header">
                <h1>Activities</h1>
                <div className="search-desktop">
                    <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
                </div>
                <div id="header-actions">
                    <button id="add-activity-button" onClick={handleAddActivity}>Add Activity</button>
                    <button id="logout-button" onClick={handleLogout}>Logout</button>
                </div>
            </div>
            <div className="search-mobile">
                <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            </div>
            
            <div id="main-content">
                <FiltersPanel
                    weatherFilter={weatherFilter}
                    setWeatherFilter={setWeatherFilter}
                    monthsFilter={monthsFilter}
                    setMonthsFilter={setMonthsFilter}
                    hideYearRound={hideYearRound}
                    setHideYearRound={setHideYearRound}
                    peopleMin={peopleMin}
                    setPeopleMin={setPeopleMin}
                    timeCommitMax={timeCommitMax}
                    setTimeCommitMax={setTimeCommitMax}
                    fitnessFilter={fitnessFilter}
                    setFitnessFilter={setFitnessFilter}
                    settingFilter={settingFilter}
                    setSettingFilter={setSettingFilter}
                    expandedSections={expandedSections}
                    setExpandedSections={setExpandedSections}
                    panelCollapsed={panelCollapsed}
                    setPanelCollapsed={setPanelCollapsed}
                    onClear={handleClearFilters}
                />
                
                {activities && (
                    <ActivityList
                        activities={activities}
                        expandedActivities={expandedActivities}
                        onToggle={handleToggleActivity}
                        onEdit={handleEditActivity}
                        filters={filters}
                    />
                )}
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<ActivitiesApp />);
}
