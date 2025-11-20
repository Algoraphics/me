import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Slider, ToggleButtonGroup, ToggleButton } from '@mui/material';

const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const ACTIVITIES_PATH = 'activities/activities.json';

const DEV_MODE = false;


interface Activity {
    name: string;
    description: string;
    idealWeather?: string[];
    avoidWeather?: string[];
    months?: string[];
    timeOfDay: { start: string; end: string };
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
    
    const content = atob(fileData.content.replace(/\n/g, ''));
    const activities = JSON.parse(content);
    
    setCachedActivities(activities);
    return activities;
}

function LoginScreen({ onLogin }: { onLogin: (token: string, data: ActivitiesData) => void }) {
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
            const data = await fetchActivities(loginToken, true);
            
            sessionStorage.setItem('githubToken', loginToken);
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
                <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                    <input 
                        type="text" 
                        name="username"
                        value="activities"
                        autoComplete="username"
                        style={{ display: 'none' }}
                    />
                    <input 
                        type="password" 
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        name="password"
                        placeholder="Enter GitHub Token"
                        autoComplete="current-password"
                        style={{ display: loading ? 'none' : 'block' }}
                    />
                    <button type="submit" style={{ display: loading ? 'none' : 'block' }}>Enter</button>
                </form>
                {error && <div id="error-message" style={{ display: 'block' }}>Bad Password.</div>}
                {loading && <div id="loading-message" style={{ display: 'block' }}>Loading activities...</div>}
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

function MonthsSlider({ value, onChange, isRange }: { value: number | number[], onChange: (v: any) => void, isRange?: boolean }) {
    const monthMarks = MONTH_NAMES.map((name, i) => ({ value: i, label: name }));
    
    return (
        <div className="mui-slider-container">
            <Slider
                value={value}
                onChange={(e, v) => onChange(v)}
                min={0}
                max={11}
                step={1}
                marks={monthMarks}
                valueLabelDisplay="off"
                track={isRange !== false ? 'normal' : false}
                sx={{
                    color: '#20c997',
                    '& .MuiSlider-markLabel': { color: '#b0b0b0', fontSize: '11px' },
                    '& .MuiSlider-mark': { backgroundColor: '#575757' },
                    '& .MuiSlider-rail': { backgroundColor: '#3d3d3d' }
                }}
            />
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

function TimeOfDaySlider({ value, onChange }: { value: number[], onChange: (v: number[]) => void }) {
    const timeMarks = [6, 9, 12, 15, 18, 21, 24].map(i => {
        if (i === 12) return { value: i, label: '12pm' };
        if (i === 24) return { value: i, label: '12am' };
        if (i < 12) return { value: i, label: `${i}am` };
        return { value: i, label: `${i - 12}pm` };
    });
    
    return (
        <div className="mui-slider-container">
            <Slider
                value={value}
                onChange={(e, v) => onChange(v as number[])}
                min={6}
                max={24}
                step={0.5}
                marks={timeMarks}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => {
                    const hours = Math.floor(v);
                    const minutes = Math.round((v % 1) * 60);
                    let displayHour = hours;
                    let period = 'am';
                    
                    if (hours === 24) {
                        displayHour = 12;
                    } else if (hours === 12) {
                        displayHour = 12;
                        period = 'pm';
                    } else if (hours > 12) {
                        displayHour = hours - 12;
                        period = 'pm';
                    }
                    
                    return minutes > 0 ? `${displayHour}:${minutes.toString().padStart(2, '0')}${period}` : `${displayHour}${period}`;
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
    peopleMin, setPeopleMin,
    timeCommitMax, setTimeCommitMax,
    fitnessFilter, setFitnessFilter,
    settingFilter, setSettingFilter,
    timeOfDayRange, setTimeOfDayRange,
    expandedSections, setExpandedSections,
    onClear
}: {
    weatherFilter: string[];
    setWeatherFilter: (v: string[]) => void;
    monthsFilter: number;
    setMonthsFilter: (v: number) => void;
    peopleMin: number;
    setPeopleMin: (v: number) => void;
    timeCommitMax: number;
    setTimeCommitMax: (v: number) => void;
    fitnessFilter: string[];
    setFitnessFilter: (v: string[]) => void;
    settingFilter: string[];
    setSettingFilter: (v: string[]) => void;
    timeOfDayRange: number[];
    setTimeOfDayRange: (v: number[]) => void;
    expandedSections: Set<string>;
    setExpandedSections: (v: Set<string>) => void;
    onClear: () => void;
}) {
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    
    const toggleSection = (section: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(section)) {
            newExpanded.delete(section);
        } else {
            newExpanded.add(section);
        }
        setExpandedSections(newExpanded);
    };
    
    const allSections = ['weather', 'fitness', 'setting', 'months', 'timeCommit', 'timeOfDay', 'people'];
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
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
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
                        <MonthsSlider value={monthsFilter} onChange={setMonthsFilter} isRange={false} />
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
                
                <div className={`filter-section ${!expandedSections.has('timeOfDay') ? 'collapsed' : ''}`}>
                    <h3 className="filter-accordion-header" onClick={() => toggleSection('timeOfDay')}>
                        <span>Time of Day</span>
                        <span className="accordion-icon">▼</span>
                    </h3>
                    <div className="filter-accordion-content">
                        <TimeOfDaySlider value={timeOfDayRange} onChange={setTimeOfDayRange} />
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
    return (
        <div 
            className={`activity-card ${expanded ? 'expanded' : ''}`}
            data-activity-id={activityId}
            onClick={onToggle}
        >
            <div className="activity-header">
                <div>
                    <div className="activity-name">{activity.name}</div>
                    <div className="activity-tags">
                        {activity.setting && (
                            <span className="activity-tag">
                                {activity.setting.charAt(0).toUpperCase() + activity.setting.slice(1)}
                            </span>
                        )}
                        {activity.fitnessLevel && (
                            <span className="activity-tag">
                                {activity.fitnessLevel.charAt(0).toUpperCase() + activity.fitnessLevel.slice(1)}
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
            
            <div className="activity-description" dangerouslySetInnerHTML={{ __html: activity.description }} />
            
            <div className="activity-details">
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
                {activity.timeOfDay && (
                    <div className="detail-item">
                        <div className="detail-label">Time of Day</div>
                        <div className="detail-value">{activity.timeOfDay.start} - {activity.timeOfDay.end}</div>
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
    const activityMatchesFilters = (activity: Activity): boolean => {
        if (filters.weather.length > 0) {
            const hasIdealMatch = activity.idealWeather && 
                activity.idealWeather.some(w => filters.weather.includes(w));
            
            const hasAvoidMatch = activity.avoidWeather && 
                activity.avoidWeather.some(w => filters.weather.includes(w));
            
            if (hasAvoidMatch) return false;
            if (activity.idealWeather && activity.idealWeather.length > 0 && !hasIdealMatch) return false;
        }
        
        if (filters.months.length > 0) {
            if (!activity.months || !activity.months.some(m => filters.months.includes(m))) {
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
        
        if (filters.timeOfDayStart !== null || filters.timeOfDayEnd !== null) {
            if (!activity.timeOfDay) return false;
            const activityStart = parseInt(activity.timeOfDay.start.split(':')[0]) + parseInt(activity.timeOfDay.start.split(':')[1]) / 60;
            const activityEnd = parseInt(activity.timeOfDay.end.split(':')[0]) + parseInt(activity.timeOfDay.end.split(':')[1]) / 60;
            
            if (filters.timeOfDayStart !== null && activityEnd < filters.timeOfDayStart) return false;
            if (filters.timeOfDayEnd !== null && activityStart > filters.timeOfDayEnd) return false;
        }
        
        return true;
    };
    
    const filteredIds = Object.keys(activities).filter(id => activityMatchesFilters(activities[id]));
    
    const shuffleArray = <T,>(array: T[]): T[] => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    
    const [shuffledIds] = useState(() => shuffleArray(filteredIds));
    const displayIds = shuffledIds.filter(id => filteredIds.includes(id));
    
    if (displayIds.length === 0) {
        return (
            <div id="activities-list">
                <div id="loading-activities">No activities match the current filters.</div>
            </div>
        );
    }
    
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

function AddActivityModal({
    show,
    onClose,
    onSave,
    onDelete,
    editingActivity,
    token
}: {
    show: boolean;
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
        monthsRange: [0, 11],
        timeOfDay: [9, 17],
        people: [2, 6],
        fitnessLevel: 'easy',
        setting: 'wilderness',
        timeCommitment: [2, 4]
    });
    
    const [status, setStatus] = useState<{ message: string; type: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    
    useEffect(() => {
        if (editingActivity) {
            const act = editingActivity.activity;
            const startHour = parseInt(act.timeOfDay.start.split(':')[0]) + parseInt(act.timeOfDay.start.split(':')[1]) / 60;
            const endHour = parseInt(act.timeOfDay.end.split(':')[0]) + parseInt(act.timeOfDay.end.split(':')[1]) / 60;
            
            let monthRange = [0, 11];
            if (act.months && act.months.length > 0) {
                const monthIndices = act.months.map(m => MONTH_NAMES.indexOf(m)).filter(i => i >= 0);
                if (monthIndices.length > 0) {
                    monthRange = [Math.min(...monthIndices), Math.max(...monthIndices)];
                }
            }
            
            setFormData({
                name: act.name,
                description: act.description,
                idealWeather: act.idealWeather || [],
                avoidWeather: act.avoidWeather || [],
                monthsRange: monthRange,
                timeOfDay: [startHour, endHour],
                people: [act.numPeople.min, act.numPeople.max],
                fitnessLevel: act.fitnessLevel,
                setting: act.setting,
                timeCommitment: [act.timeCommitment.min, act.timeCommitment.max]
            });
        } else {
            setFormData({
                name: '',
                description: '',
                idealWeather: [],
                avoidWeather: [],
                monthsRange: [0, 11],
                timeOfDay: [9, 17],
                people: [2, 6],
                fitnessLevel: 'easy',
                setting: 'wilderness',
                timeCommitment: [2, 4]
            });
        }
        setDeleteConfirm(false);
        setStatus(null);
    }, [editingActivity, show]);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const formatTime = (hours: number) => {
            const h = Math.floor(hours);
            const m = Math.round((hours % 1) * 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };
        
        const selectedMonths = MONTH_NAMES.slice(formData.monthsRange[0], formData.monthsRange[1] + 1);
        
        const activity: Activity = {
            name: formData.name,
            description: formData.description,
            idealWeather: formData.idealWeather,
            avoidWeather: formData.avoidWeather,
            months: selectedMonths,
            timeOfDay: { start: formatTime(formData.timeOfDay[0]), end: formatTime(formData.timeOfDay[1]) },
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
    
    if (!show) return null;
    
    return (
        <div className="modal active" onClick={(e) => {if (e.target === e.currentTarget) onClose();}}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{editingActivity ? `Editing: ${editingActivity.activity.name}` : 'Add New Activity'}</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
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
                        <label>Don't do this if weather is...</label>
                        <WeatherToggleGroup 
                            value={formData.avoidWeather} 
                            onChange={(v) => setFormData({...formData, avoidWeather: v})} 
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
                        <MonthsSlider 
                            value={formData.monthsRange} 
                            onChange={(v) => setFormData({...formData, monthsRange: v})} 
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
                        <label>Time of Day</label>
                        <TimeOfDaySlider 
                            value={formData.timeOfDay} 
                            onChange={(v) => setFormData({...formData, timeOfDay: v})} 
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
    const [showModal, setShowModal] = useState(false);
    const [editingActivity, setEditingActivity] = useState<{ id: string; activity: Activity } | null>(null);
    
    const [weatherFilter, setWeatherFilter] = useState<string[]>([]);
    const [monthsFilter, setMonthsFilter] = useState<number>(() => new Date().getMonth());
    const [peopleMin, setPeopleMin] = useState<number>(2);
    const [timeCommitMax, setTimeCommitMax] = useState<number>(4);
    const [fitnessFilter, setFitnessFilter] = useState<string[]>([]);
    const [settingFilter, setSettingFilter] = useState<string[]>([]);
    const [timeOfDayRange, setTimeOfDayRange] = useState<number[]>([6, 24]);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['weather', 'fitness', 'setting', 'months', 'timeCommit', 'timeOfDay', 'people']));
    
    const filters = {
        weather: expandedSections.has('weather') ? weatherFilter : [],
        months: expandedSections.has('months') ? MONTH_NAMES.slice(0, monthsFilter + 1) : [],
        peopleMin: expandedSections.has('people') ? peopleMin : null,
        peopleMax: null,
        timeMin: null,
        timeMax: expandedSections.has('timeCommit') ? timeCommitMax : null,
        fitness: expandedSections.has('fitness') ? fitnessFilter : [],
        settings: expandedSections.has('setting') ? settingFilter : [],
        timeOfDayStart: expandedSections.has('timeOfDay') ? timeOfDayRange[0] : null,
        timeOfDayEnd: expandedSections.has('timeOfDay') ? timeOfDayRange[1] : null
    };
    
    const handleLogin = (loginToken: string, data: ActivitiesData) => {
        setToken(loginToken);
        setActivities(data);
        setIsLoggedIn(true);
    };
    
    const handleLogout = () => {
        sessionStorage.removeItem('githubToken');
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
        setShowModal(true);
    };
    
    const handleAddActivity = () => {
        setEditingActivity(null);
        setShowModal(true);
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
                content: btoa(newContent),
                sha: currentSha
            })
        });
        
        setFileSha(result.content.sha);
        invalidateCache();
        setActivities(updatedData);
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
                content: btoa(newContent),
                sha: currentSha
            })
        });
        
        setFileSha(result.content.sha);
        invalidateCache();
        setActivities(remaining);
    };
    
    const handleClearFilters = () => {
        setWeatherFilter([]);
        setMonthsFilter(new Date().getMonth());
        setPeopleMin(2);
        setTimeCommitMax(4);
        setFitnessFilter([]);
        setSettingFilter([]);
        setTimeOfDayRange([6, 24]);
    };
    
    if (!isLoggedIn) {
        return <LoginScreen onLogin={handleLogin} />;
    }
    
    return (
        <div id="activities-container" style={{ display: 'block' }}>
            <div id="header">
                <h1>Activities</h1>
                <div id="header-actions">
                    <button id="add-activity-button" onClick={handleAddActivity}>Add Activity</button>
                    <button id="logout-button" onClick={handleLogout}>Logout</button>
                </div>
            </div>
            
            <div id="main-content">
                <FiltersPanel
                    weatherFilter={weatherFilter}
                    setWeatherFilter={setWeatherFilter}
                    monthsFilter={monthsFilter}
                    setMonthsFilter={setMonthsFilter}
                    peopleMin={peopleMin}
                    setPeopleMin={setPeopleMin}
                    timeCommitMax={timeCommitMax}
                    setTimeCommitMax={setTimeCommitMax}
                    fitnessFilter={fitnessFilter}
                    setFitnessFilter={setFitnessFilter}
                    settingFilter={settingFilter}
                    setSettingFilter={setSettingFilter}
                    timeOfDayRange={timeOfDayRange}
                    setTimeOfDayRange={setTimeOfDayRange}
                    expandedSections={expandedSections}
                    setExpandedSections={setExpandedSections}
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
            
            <AddActivityModal
                show={showModal}
                onClose={() => {setShowModal(false); setEditingActivity(null);}}
                onSave={handleSaveActivity}
                onDelete={handleDeleteActivity}
                editingActivity={editingActivity}
                token={token}
            />
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<ActivitiesApp />);
}
