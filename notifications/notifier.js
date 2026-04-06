const fetch = require('node-fetch');

async function sendDiscordNotification(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        throw new Error('DISCORD_WEBHOOK_URL environment variable not set');
    }
    
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content: message
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
    }
    
    return response;
}

module.exports = {
    sendDiscordNotification
};

