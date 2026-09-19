// plugins/khan.js - ESM Version
import { fileURLToPath } from 'url';
import { cmd, commands } from '../command.js';
import config from '../config.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// Keyword that triggers KHAN (all case variations supported)
const KHANTriggers = ["khan", "khan"];

// Nexray AI API endpoint
const API_BASE = "https://api.nexray.eu.cc/ai/gpt-3.5-turbo?text=";

// System prompt - defines AI's role and behavior
const SYSTEM_PROMPT = `You are KHAN, a helpful and friendly AI assistant on WhatsApp. 

Rules you MUST follow:
- Keep responses short, natural and conversational (1-3 sentences max unless asked for details)
- NEVER repeat or echo the user's question back
- NEVER say "you asked" or "your question was"
- Just answer directly like a human friend would
- Use emojis occasionally to feel natural but don't overdo it
- Be helpful, warm, and casual in tone
- If asked something inappropriate, politely decline
- Match the user's language (English/Urdu/Roman Urdu)

Example:
User: "kasa ho"
You: "Sab badhiya! Tum sunao, kya haal hai? 😊"

User: "what is ai"
You: "AI is basically machines that can think and learn like humans. Pretty cool stuff! 🤖"`;

cmd({
    'on': "body"
}, async (client, message, m, {
    from,
    body,
    isCreator,
    reply,
    sender,
    userConfig,
    isGroup,
    args,
    q,
    text
}) => {
    try {
        // Keep original body for message sending, use lowercase for checking
        const originalBody = body.trim();
        const lowerBody = originalBody.toLowerCase();
        
        // Check if message starts with "KHAN" as a WHOLE WORD (needs space or end after "khan")
        let cleanMsg = null;
        let matchedTrigger = null;
        let matchedText = null;
        
        for (const trigger of KHANTriggers) {
            // Regex: trigger must be at start AND followed by a space or end of string
            const triggerRegex = new RegExp(`^${trigger}(?:\\s|$)`, 'i');
            
            if (triggerRegex.test(originalBody)) {
                matchedTrigger = trigger;
                // Remove the trigger and the space after it
                cleanMsg = originalBody.replace(new RegExp(`^${trigger}\\s*`, 'i'), '').trim();
                matchedText = originalBody.match(new RegExp(`^${trigger}`, 'i'))[0];
                break;
            }
        }
        
        // If no KHAN trigger found at start (as whole word), return
        if (!matchedTrigger) {
            return;
        }
        
        const PREFIX = userConfig?.PREFIX || config.PREFIX || ".";
        
        // If just "KHAN" with no command, show intro
        if (!cleanMsg) {
            const introText = `🤖 *KHAN:* Hey! I'm KHAN - Your Assistant!

*About Me:*
• 🤖 Smart command processor
• 💡 Here to help you 24/7
• 🎯 Fast & accurate responses

📋 *Try these commands:*
• ${matchedText} menu - Show all commands
• ${matchedText} play <song> - Play music
• ${matchedText} ping - Check response
• ${matchedText} status - Bot status

💡 *Just type "${matchedText} <command>" to use me!*`;

            await client.sendMessage(from, { 
                text: introText,
                quoted: message
            });
            
            try {
                await m.react('🤖');
            } catch (e) {}
            
            return;
        }

        // ===== SMART COMMAND DETECTION =====
        const words = cleanMsg.toLowerCase().split(/\s+/);
        let foundCommand = null;
        let foundArgs = [];
        let commandPattern = null;
        
        // FIRST PASS: Check first word against all command names
        for (const cmd of commands) {
            const patterns = Array.isArray(cmd.pattern) ? cmd.pattern : [cmd.pattern];
            const aliases = Array.isArray(cmd.alias) ? cmd.alias : (cmd.alias ? [cmd.alias] : []);
            const allNames = [...patterns, ...aliases].filter(Boolean);
            
            for (const name of allNames) {
                if (words[0] === name.toLowerCase()) {
                    foundCommand = cmd;
                    commandPattern = name;
                    foundArgs = words.slice(1);
                    break;
                }
            }
            if (foundCommand) break;
        }
        
        // SECOND PASS: If no command found, check if any command name appears anywhere in the text
        if (!foundCommand) {
            const lowerCleanMsg = cleanMsg.toLowerCase();
            for (const cmd of commands) {
                const patterns = Array.isArray(cmd.pattern) ? cmd.pattern : [cmd.pattern];
                const aliases = Array.isArray(cmd.alias) ? cmd.alias : (cmd.alias ? [cmd.alias] : []);
                const allNames = [...patterns, ...aliases].filter(Boolean);
                
                for (const name of allNames) {
                    const nameLower = name.toLowerCase();
                    if (nameLower.length < 2) continue;
                    
                    // Check if command name appears as a whole word
                    const regex = new RegExp(`\\b${nameLower}\\b`, 'i');
                    if (regex.test(lowerCleanMsg)) {
                        foundCommand = cmd;
                        commandPattern = name;
                        
                        // Extract everything after the command
                        const parts = cleanMsg.split(new RegExp(name, 'i'));
                        foundArgs = parts.length > 1 ? parts[1].trim().split(/\s+/) : [];
                        break;
                    }
                }
                if (foundCommand) break;
            }
        }
        
        // If command found, execute it
        if (foundCommand && commandPattern) {
            const okMsg = await client.sendMessage(from, { 
                text: `🤖 *KHAN:* Ok boss! Processing "${commandPattern}"...`,
                quoted: message
            });
            
            if (okMsg.key) {
                try {
                    await client.sendMessage(from, {
                        react: {
                            text: '🤖',
                            key: okMsg.key
                        }
                    });
                } catch (e) {}
            }
            
            const context = {
                from,
                reply,
                sender,
                userConfig,
                isCreator: false,
                isGroup,
                args: foundArgs,
                q: foundArgs.join(' '),
                text: foundArgs.join(' '),
                isCmd: true,
                command: commandPattern
            };
            
            try {
                await foundCommand.function(client, message, m, context);
            } catch (err) {
                console.error("Command execution error:", err);
                await reply(`❌ Error executing command: ${err.message}`);
            }
            
            return;
        }
        
        // ===== FALLBACK TO NEXRAY AI API =====
        try {
            // Send thinking message
            const thinkingMsg = await client.sendMessage(from, { 
                text: `🤖 *KHAN:* Let me think about that...`,
                quoted: message
            });
            
            // React to thinking message
            try {
                await client.sendMessage(from, {
                    react: {
                        text: '🧠',
                        key: thinkingMsg.key
                    }
                });
            } catch (e) {}
            
            // Build the prompt with system instructions
            const fullPrompt = `${SYSTEM_PROMPT}\n\nUser: ${cleanMsg}\nYou:`;
            
            // Call Nexray AI API
            const apiUrl = `${API_BASE}${encodeURIComponent(fullPrompt)}`;
            
            console.log(`📡 Calling Nexray AI: ${cleanMsg}`);
            
            const response = await axios.get(apiUrl, {
                timeout: 30000
            });
            
            console.log(`✅ Nexray AI Response:`, response.data);
            
            // Extract result
            let replyText = null;
            
            if (response.data && response.data.status && response.data.result) {
                replyText = response.data.result.trim();
            }
            
            if (replyText && replyText.length > 0) {
                // Clean up any "User:" or "You:" prefix that AI might add
                replyText = replyText
                    .replace(/^(You:|Assistant:|KHAN:)\s*/i, '')
                    .replace(/^(User:|Human:).*?\n/i, '')
                    .trim();
                
                const finalText = `🤖 *KHAN:* ${replyText}`;
                
                const protocolMsg = {
                    key: thinkingMsg.key,
                    type: 0xe,
                    editedMessage: { 
                        conversation: finalText
                    }
                };
                await client.relayMessage(from, { protocolMessage: protocolMsg }, {});
            } else {
                // No result - show help
                const helpText = `🤖 *KHAN:* I didn't understand "${cleanMsg}"

📋 *Available commands:*
• ${matchedText} menu - Show all commands
• ${matchedText} play <song> - Play music
• ${matchedText} ping - Check response
• ${matchedText} status - Bot status

💡 *Type "${matchedText}" alone to see all options*`;

                const protocolMsg = {
                    key: thinkingMsg.key,
                    type: 0xe,
                    editedMessage: { 
                        conversation: helpText
                    }
                };
                await client.relayMessage(from, { protocolMessage: protocolMsg }, {});
            }
            
        } catch (error) {
            console.error("Nexray AI Error:", error.message);
            
            // Show help instead of error
            const helpText = `🤖 *KHAN:* I'm having trouble connecting. Try these commands instead:

• ${matchedText} menu - Show all commands
• ${matchedText} play <song> - Play music
• ${matchedText} ping - Check response
• ${matchedText} status - Bot status

💡 *Just say "${matchedText}" to see all options*`;

            await client.sendMessage(from, { 
                text: helpText,
                quoted: message
            });
        }
        
    } catch (error) {
        console.error("KHAN Plugin Error:", error);
        try {
            await client.sendMessage(from, { 
                text: `🤖 *KHAN:* Sorry, I'm having trouble right now. Try again in a moment!`,
                quoted: message
            });
        } catch (e) {}
    }
});
