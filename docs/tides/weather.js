const SF_LATITUDE = 37.7749;
const SF_LONGITUDE = -122.4194;

function updateLastUpdated() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
    document.getElementById('last-updated').textContent = `Last updated: ${timeString}`;
}

const GOLDEN_GATE_STATION = '9414290';
const TIDE_HEIGHT_THRESHOLD = 0.5;
const SUPER_LOW_TIDE_THRESHOLD = -0.5;

async function fetchThreeDayTideData() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const startDateStr = formatDateForAPI(yesterday);
    const endDateStr = formatDateForAPI(tomorrow);
    
    try {
        const response = await fetch(
            `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
            `begin_date=${startDateStr}&end_date=${endDateStr}` +
            `&station=${GOLDEN_GATE_STATION}&product=predictions&datum=MLLW` +
            `&time_zone=lst_ldt&units=english&interval=6&format=json`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch tide data');
        }
        
        const data = await response.json();
        return data.predictions;
    } catch (error) {
        console.error('Error fetching 3-day tide data:', error);
        throw error;
    }
}

function renderTideChart(predictions) {
    const ctx = document.getElementById('tide-chart').getContext('2d');
    const now = new Date();
    
    const labels = predictions.map(p => new Date(p.t));
    const values = predictions.map(p => parseFloat(p.v));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startTime = labels[0];
    const endTime = labels[labels.length - 1];
    
    function formatTimeOnly(date) {
        const hours = date.getHours();
        const ampm = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours % 12 || 12;
        return `${displayHours}${ampm}`;
    }
    
    const lowTidePlugin = {
        id: 'lowTideZone',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            const yTop = yAxis.getPixelForValue(TIDE_HEIGHT_THRESHOLD);
            const yBottom = yAxis.getPixelForValue(yAxis.min);
            
            ctx.save();
            ctx.fillStyle = 'rgba(100, 255, 150, 0.15)';
            ctx.fillRect(xAxis.left, yTop, xAxis.width, yBottom - yTop);
            ctx.restore();
        }
    };
    
    const nowLinePlugin = {
        id: 'nowLine',
        beforeDatasetsDraw: (chart) => {
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            
            const nowX = xAxis.getPixelForValue(now);
            
            if (nowX >= xAxis.left && nowX <= xAxis.right) {
                const ctx = chart.ctx;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(nowX, yAxis.top);
                ctx.lineTo(nowX, yAxis.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ff6b6b';
                ctx.stroke();
                ctx.restore();
            }
        }
    };
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tide Height (ft)',
                data: values,
                borderColor: 'rgba(100, 200, 255, 1)',
                backgroundColor: 'rgba(100, 200, 255, 0.2)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: 'rgba(100, 200, 255, 1)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const date = new Date(items[0].parsed.x);
                            return date.toLocaleString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            });
                        },
                        label: (item) => `${item.parsed.y.toFixed(2)} ft`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        maxRotation: 0,
                        autoSkip: false,
                        callback: function(value, index, ticks) {
                            const tickTime = new Date(value);
                            const isFirst = index === 0;
                            const isLast = index === ticks.length - 1;
                            
                            // Check if this tick is closest to "now"
                            const tickMs = tickTime.getTime();
                            const nowMs = now.getTime();
                            let isNow = false;
                            
                            if (index > 0 && index < ticks.length - 1) {
                                const prevDiff = Math.abs(new Date(ticks[index - 1].value).getTime() - nowMs);
                                const currDiff = Math.abs(tickMs - nowMs);
                                const nextDiff = Math.abs(new Date(ticks[index + 1].value).getTime() - nowMs);
                                isNow = currDiff <= prevDiff && currDiff < nextDiff;
                            }
                            
                            if (isFirst) {
                                return formatTimeOnly(tickTime);
                            }
                            if (isNow) {
                                return formatTimeOnly(now);
                            }
                            if (isLast) {
                                return formatTimeOnly(tickTime);
                            }
                            return '';
                        }
                    },
                    grid: {
                        color: (context) => {
                            const date = new Date(context.tick.value);
                            if (date.getHours() === 0) {
                                return 'rgba(255, 255, 255, 0.3)';
                            }
                            return 'rgba(255, 255, 255, 0.05)';
                        }
                    }
                },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: (value) => `${value} ft`
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        },
        plugins: [lowTidePlugin, nowLinePlugin]
    });
}

async function loadTideChart() {
    try {
        const predictions = await fetchThreeDayTideData();
        renderTideChart(predictions);
    } catch (error) {
        console.error('Error loading tide chart:', error);
    }
}

async function fetchTideData() {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 6);
    
    const startDateStr = formatDateForAPI(now);
    const endDateStr = formatDateForAPI(endDate);
    
    try {
        const response = await fetch(
            `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
            `begin_date=${startDateStr}&end_date=${endDateStr}` +
            `&station=${GOLDEN_GATE_STATION}&product=predictions&datum=MLLW` +
            `&time_zone=lst_ldt&units=english&interval=hilo&format=json`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch tide data');
        }
        
        const data = await response.json();
        return data.predictions;
    } catch (error) {
        console.error('Error fetching tide data:', error);
        throw error;
    }
}

async function fetchBulkSunsetData(startDate, endDate) {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    try {
        const response = await fetch(
            `https://api.sunrisesunset.io/json?lat=${SF_LATITUDE}&lng=${SF_LONGITUDE}&date_start=${startStr}&date_end=${endStr}`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch sunset data');
        }
        
        const data = await response.json();
        console.log('Sunset API response sample:', data.results?.[0]);
        
        const sunsetMap = {};
        if (data.results) {
            data.results.forEach(day => {
                const tideDate = new Date(day.date + 'T00:00:00');
                const dateKey = tideDate.toDateString();
                
                const timeParts = day.sunset.match(/(\d+):(\d+):(\d+)\s*(AM|PM)/i);
                if (timeParts) {
                    let hours = parseInt(timeParts[1]);
                    const minutes = parseInt(timeParts[2]);
                    const seconds = parseInt(timeParts[3]);
                    const meridiem = timeParts[4].toUpperCase();
                    
                    if (meridiem === 'PM' && hours !== 12) {
                        hours += 12;
                    } else if (meridiem === 'AM' && hours === 12) {
                        hours = 0;
                    }
                    
                    const sunsetTime = new Date(day.date + 'T00:00:00');
                    sunsetTime.setHours(hours, minutes, seconds);
                    sunsetMap[dateKey] = sunsetTime;
                }
            });
        }
        
        console.log('Sunset map sample:', Object.entries(sunsetMap)[0]);
        return sunsetMap;
    } catch (error) {
        console.error('Error fetching sunset data:', error);
        return {};
    }
}

function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function parseTime(timeStr) {
    return new Date(timeStr);
}

function getTimeOfDay(date) {
    const hours = date.getHours();
    return hours;
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function formatTideDate(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatTideTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = String(minutes).padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
}

async function analyzeGoodTidePoolingDays() {
    try {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 6);
        
        const [tides, sunsetMap] = await Promise.all([
            fetchTideData(),
            fetchBulkSunsetData(now, endDate)
        ]);
        
        console.log('Total tides received:', tides.length);
        console.log('Sunset map entries:', Object.keys(sunsetMap).length);
        
        const dayData = {};
        let lowTideCount = 0;
        
        for (const tide of tides) {
            if (tide.type !== 'L') continue;
            
            const tideTime = parseTime(tide.t);
            const tideHeight = parseFloat(tide.v);
            
            if (tideHeight > TIDE_HEIGHT_THRESHOLD) continue;
            
            lowTideCount++;
            const dateKey = tideTime.toDateString();
            
            if (!dayData[dateKey]) {
                dayData[dateKey] = {
                    date: tideTime,
                    isWeekend: isWeekend(tideTime),
                    sunset: sunsetMap[dateKey] || null,
                    lowTides: []
                };
            }
            
            dayData[dateKey].lowTides.push({
                time: tideTime,
                height: tideHeight
            });
        }
        
        console.log('Low tides below threshold:', lowTideCount);
        console.log('Days with low tides:', Object.keys(dayData).length);
        
        const goodDays = [];
        
        for (const dateKey in dayData) {
            const day = dayData[dateKey];
            
            if (!day.sunset) {
                console.log('Missing sunset for:', dateKey);
                continue;
            }
            
            for (const tide of day.lowTides) {
                const tideHour = tide.time.getHours() + tide.time.getMinutes() / 60;
                const sunsetHour = day.sunset.getHours() + day.sunset.getMinutes() / 60;
                
                console.log(`${dateKey}: Tide=${tideHour.toFixed(2)}h, Sunset=${sunsetHour.toFixed(2)}h, Weekend=${day.isWeekend}`);
                
                let isGoodTime = false;
                
                if (day.isWeekend) {
                    isGoodTime = tideHour >= 10 && tideHour <= sunsetHour;
                } else {
                    isGoodTime = tideHour >= 16 && tideHour <= sunsetHour;
                }
                
                if (isGoodTime) {
                    console.log('✓ GOOD TIME FOUND');
                    goodDays.push({
                        date: day.date,
                        tideTime: tide.time,
                        tideHeight: tide.height
                    });
                }
            }
        }
        
        console.log('Total good days found:', goodDays.length);
        goodDays.sort((a, b) => a.date - b.date);
        
        return goodDays;
    } catch (error) {
        console.error('Error analyzing tide pooling days:', error);
        throw error;
    }
}

function formatDateForGoogleCalendar(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function generateGoogleCalendarUrl(day) {
    const eventTitle = `Tide Pooling: ${day.tideHeight.toFixed(2)} ft tide`;
    const startTime = new Date(day.tideTime);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    
    const startStr = formatDateForGoogleCalendar(startTime);
    const endStr = formatDateForGoogleCalendar(endTime);
    
    const details = `Low tide of ${day.tideHeight.toFixed(2)} ft at Golden Gate, San Francisco. Great time for tide pooling!`;
    const location = 'Golden Gate, San Francisco, CA';
    
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: eventTitle,
        dates: `${startStr}/${endStr}`,
        details: details,
        location: location
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function displayTidePoolingDays(days) {
    const container = document.getElementById('tide-container');
    container.innerHTML = '';
    
    if (days.length === 0) {
        container.innerHTML = '<div class="tide-status">No good tide pooling days found in the next 3 months.</div>';
        return;
    }
    
    days.forEach(day => {
        const item = document.createElement('div');
        item.className = 'tide-item';
        
        const dateStr = formatTideDate(day.date);
        const timeStr = formatTideTime(day.tideTime);
        const heightStr = day.tideHeight.toFixed(2);
        
        const superLowIcon = day.tideHeight <= SUPER_LOW_TIDE_THRESHOLD ? '<span class="tide-icon">🐙</span>' : '';
        const weekendIcon = isWeekend(day.date) ? '<span class="tide-icon">⭐</span>' : '';
        
        const calendarUrl = generateGoogleCalendarUrl(day);
        
        item.innerHTML = `
            <a href="${calendarUrl}" target="_blank" class="calendar-button" title="Add to Google Calendar">📅</a>
            <div class="tide-date">${dateStr}</div>
            <div class="tide-details">
                <div class="tide-icons">${weekendIcon}${superLowIcon}</div>
                <div class="tide-time">${timeStr}</div>
                <div class="tide-height">${heightStr} ft</div>
            </div>
        `;
        
        container.appendChild(item);
    });
}

async function loadTidePooling() {
    const loading = document.getElementById('tide-loading');
    const error = document.getElementById('tide-error');
    const container = document.getElementById('tide-container');
    
    loading.style.display = 'block';
    error.style.display = 'none';
    container.innerHTML = '';
    
    try {
        const goodDays = await analyzeGoodTidePoolingDays();
        displayTidePoolingDays(goodDays);
        updateLastUpdated();
        loading.style.display = 'none';
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        console.error('Error loading tide pooling data:', err);
    }
}

loadTideChart();
loadTidePooling();

