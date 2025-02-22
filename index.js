require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Initialize bot and app
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(bodyParser.json());

// Data structures
const chatHistory = {}; // Store conversation history
const customPrompts = {}; // Store custom system prompts for users
const rateLimit = {}; // Track rate-limiting timestamps
const RATE_LIMIT_TIME = 5000; // 5 seconds

// Function to interact with Phind API
async function generate(prompt, systemPrompt = "Be Helpful and Friendly chat in Hinglish and your are a best friend", model = "Phind-34B") {
  try {
    const headers = { "User-Agent": "" };
    prompt.unshift({ content: systemPrompt, role: "system" });
    const payload = {
      additional_extension_context: "",
      allow_magic_buttons: true,
      is_vscode_extension: true,
      message_history: prompt,
      requested_model: model,
      user_input: prompt[prompt.length - 1].content,
    };
    const chatEndpoint = "https://https.extension.phind.com/agent/";
    const response = await axios.post(chatEndpoint, payload, {
      headers,
      responseType: "stream",
    });

    let streamingText = "";
    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      lines.forEach((line) => {
        try {
          const json = JSON.parse(line.replace("data:", "").trim());
          streamingText += json.choices[0].delta.content || "";
        } catch (e) {
          // Ignore parsing errors
        }
      });
    });

    return new Promise((resolve) => {
      response.data.on("end", () => resolve(streamingText));
    });
  } catch (error) {
    throw new Error("Error interacting with Phind API");
  }
}

// Log errors to a file
function logError(error) {
  const logMessage = `[${new Date().toISOString()}] ${error.message}\n`;
  fs.appendFileSync("error.log", logMessage);
}

// Handle `/start` command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello! I am your AI assistant bot. Ask me anything!");
});

// Handle `/help` command
bot.onText(/\/help/, (msg) => {
  const helpMessage = `
  Available Commands:
  /start - Start the bot
  /help - Show this help message
  /reset - Reset conversation history
  /setprompt <text> - Set a custom system prompt
  `;
  bot.sendMessage(msg.chat.id, helpMessage);
});

// Handle `/reset` command
bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;
  delete chatHistory[chatId]; // Clear chat history
  bot.sendMessage(chatId, "Conversation history has been reset!");
});

// Handle `/setprompt` command
bot.onText(/\/setprompt (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const newPrompt = match[1];
  customPrompts[chatId] = newPrompt;
  bot.sendMessage(chatId, `System prompt updated to: "${newPrompt}"`);
});

// Handle `/broadcast` command
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId != ADMIN_CHAT_ID) return; // Only allow admin to use this command

  const broadcastMessage = match[1];
  const users = Object.keys(chatHistory); // Get all user IDs

  for (const userId of users) {
    try {
      await bot.sendMessage(userId, broadcastMessage);
    } catch (error) {
      console.error(`Failed to send message to user ${userId}: ${error.message}`);
    }
  }

  bot.sendMessage(ADMIN_CHAT_ID, "Broadcast message sent successfully!");
});

// Handle text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  // Rate limiting
  if (rateLimit[chatId] && Date.now() - rateLimit[chatId] < RATE_LIMIT_TIME) {
    bot.sendMessage(chatId, "Please wait before sending another message.");
    return;
  }

  rateLimit[chatId] = Date.now(); // Update timestamp

  if (!chatHistory[chatId]) {
    chatHistory[chatId] = []; // Initialize chat history for new users
  }

  try {
    // Forward message to admin
    bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);

    // Add user input to chat history
    chatHistory[chatId].push({ role: "user", content: userInput });

    // Call Phind API with full chat history
    const systemPrompt = customPrompts[chatId] || "Be helpful, funny, and friendly chat in Hinglish and your language is hindi...";
    const response = await generate(chatHistory[chatId], systemPrompt, "Phind-34B");

    // Add bot's response to chat history
    chatHistory[chatId].push({ role: "assistant", content: response });

    bot.sendMessage(chatId, response);
  } catch (error) {
    logError(error); // Log the error
    bot.sendMessage(chatId, "An error occurred while processing your request.");
    bot.sendMessage(ADMIN_CHAT_ID, `Error: ${error.message}`);
  }
});

// Flask webhook health check (optional)
app.get("/", (req, res) => res.send("Bot is running!"));

// Webhook for Telegram (optional for deployment)
const WEBHOOK_URL = `https://boiiii.onrender.com/${BOT_TOKEN}`;
app.post(`/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set webhook when the server starts
axios
  .get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}`)
  .then(() => console.log("Webhook set successfully!"))
  .catch((err) => console.error("Failed to set webhook:", err.message));

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Keep sending a request to your deployed server every 30 seconds to keep it alive
setInterval(async () => {
  try {
    await axios.get(`https://boiiii.onrender.com`);
    console.log("Ping sent to keep the server alive!");
  } catch (error) {
    console.error("Error while sending keep-alive ping:", error.message);
  }
}, 30000); // 30 seconds interval
