require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const app = express();
app.use(bodyParser.json());

// Function to interact with Phind API
async function generate(prompt, systemPrompt = "Be Helpful and Friendly", model = "Phind-34B") {
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

// Handle `/start` command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello! I am your AI assistant bot. Ask me anything!");
});

// Handle text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  if (msg.text === "/start") return;

  try {
    // Forward message to admin
    bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);

    // Call Phind API
    const prompt = [{ role: "user", content: userInput }];
    const response = await generate(prompt, "Be Helpful, Funny, and Friendly", "Phind-34B");

    bot.sendMessage(chatId, response);
  } catch (error) {
    bot.sendMessage(chatId, "An error occurred while processing your request.");
    bot.sendMessage(ADMIN_CHAT_ID, `Error: ${error.message}`);
  }
});

// Flask webhook health check (optional)
app.get("/", (req, res) => res.send("Bot is running!"));

// Webhook for Telegram (optional for deployment)
app.post(`/${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
