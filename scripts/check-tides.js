const fetch = require('node-fetch');
const { sendDiscordNotification } = require('../notifications/notifier');

const SF_LATITUDE = 37.7749;
const SF_LONGITUDE = -122.4194;
const GOLDEN_GATE_STATION = '9414290';
const TIDE_HEIGHT_THRESHOLD = 0.5;
const SUPER_LOW_TIDE_THRESHOLD = -0.5;

function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

async function fetchTideData() {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    
    const startDateStr = formatDateForAPI(now);
    const endDateStr = formatDateForAPI(endDate);
    
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
}

async function fetchBulkSunsetData(startDate, endDate) {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    const response = await fetch(
        `https://api.sunrisesunset.io/json?lat=${SF_LATITUDE}&lng=${SF_LONGITUDE}&date_start=${startStr}&date_end=${endStr}`
    );
    
    if (!response.ok) {
        throw new Error('Failed to fetch sunset data');
    }
    
    const data = await response.json();
    
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
    
    return sunsetMap;
}

function parseTime(timeStr) {
    return new Date(timeStr);
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

async function analyzeGoodTidePoolingDays() {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    
    const [tides, sunsetMap] = await Promise.all([
        fetchTideData(),
        fetchBulkSunsetData(now, endDate)
    ]);
    
    const dayData = {};
    
    for (const tide of tides) {
        if (tide.type !== 'L') continue;
        
        const tideTime = parseTime(tide.t);
        const tideHeight = parseFloat(tide.v);
        
        if (tideHeight > TIDE_HEIGHT_THRESHOLD) continue;
        
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
    
    const goodDays = [];
    
    for (const dateKey in dayData) {
        const day = dayData[dateKey];
        
        if (!day.sunset) continue;
        
        for (const tide of day.lowTides) {
            const tideHour = tide.time.getHours() + tide.time.getMinutes() / 60;
            const sunsetHour = day.sunset.getHours() + day.sunset.getMinutes() / 60;
            
            let isGoodTime = false;
            
            if (day.isWeekend) {
                isGoodTime = tideHour >= 10 && tideHour <= sunsetHour;
            } else {
                isGoodTime = tideHour >= 16 && tideHour <= sunsetHour;
            }
            
            if (isGoodTime) {
                goodDays.push({
                    date: day.date,
                    tideTime: tide.time,
                    tideHeight: tide.height,
                    isWeekend: day.isWeekend
                });
            }
        }
    }
    
    goodDays.sort((a, b) => a.date - b.date);
    
    return goodDays;
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

function formatNotificationMessage(days) {
    if (days.length === 0) {
        return '🌊 **Tide Pooling Report**\n\nNo good tide pooling days found in the next month.';
    }
    
    let message = '🌊 **Good Tide Pooling Days - Next Month**\n\n';
    
    days.forEach(day => {
        const dateStr = formatTideDate(day.date);
        const timeStr = formatTideTime(day.tideTime);
        const heightStr = day.tideHeight.toFixed(2);
        
        let icons = '';
        if (day.isWeekend) icons += '⭐ ';
        if (day.tideHeight <= SUPER_LOW_TIDE_THRESHOLD) icons += '🐙 ';
        
        message += `**${dateStr}** - ${timeStr} - ${heightStr} ft ${icons}\n`;
    });
    
    message += `\nView calendar: https://ethanrabb.com/tides\n`;
    message += `⭐ = Weekend | 🐙 = Super low tide (< -0.5 ft)`;
    
    return message;
}

async function main() {
    try {
        console.log('Checking for good tide pooling days...');
        
        const goodDays = await analyzeGoodTidePoolingDays();
        
        console.log(`Found ${goodDays.length} good tide pooling days`);
        
        const message = formatNotificationMessage(goodDays);
        
        await sendDiscordNotification(message);
        
        console.log('Notification sent successfully!');
    } catch (error) {
        console.error('Error checking tides:', error);
        process.exit(1);
    }
}

main();

