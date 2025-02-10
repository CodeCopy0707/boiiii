require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");
const translate = require("@vitalets/google-translate-api");

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const OPENWEATHER_API_KEY = "96ec91f0cae91567ee819025492b29a2"; // Your OpenWeatherMap API Key

// Initialize bot and server
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(bodyParser.json());

// In-memory storage for chat history
const chatHistory = {};

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

// Handle /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello! I am your AI assistant bot. Ask me anything!");
});

// Handle text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  if (!chatHistory[chatId]) {
    chatHistory[chatId] = []; // Initialize chat history for this user
  }

  if (msg.text === "/start") return;

  try {
    // Forward message to admin
    bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);

    // Append user input to chat history
    chatHistory[chatId].push({ role: "user", content: userInput });

    // Call Phind API with chat history
    const response = await generate(
      chatHistory[chatId],
      "Be helpful, funny, and friendly in Hinglish. Remember everything and keep the conversation engaging with relevant insights. Act as if you are a developer named 'Shannniii,' who is skilled and knowledgeable in coding, and always ready to assist with both technical and non-technical queries in a light-hearted, yet professional manner.",
      "Phind-34B"
    );

    // Append bot's response to chat history
    chatHistory[chatId].push({ role: "assistant", content: response });

    bot.sendMessage(chatId, response);
  } catch (error) {
    bot.sendMessage(chatId, "An error occurred while processing your request.");
    bot.sendMessage(ADMIN_CHAT_ID, `Error: ${error.message}`);
  }
});

// Feature 1: Help Menu
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  const helpMessage = `
Available Commands:
/start - Start the bot
/help - Show this help menu
/joke - Get a funny joke
/weather <city> - Get weather information for a city
/generate_webpage - Generate a basic webpage
/project_structure - Generate a project folder structure
/clear_history - Clear chat history
/translate <text> - Translate text into English
/remind <time> <message> - Set a reminder
/quote - Get a motivational quote
/math <expression> - Solve a math expression
/wiki <query> - Search Wikipedia
/github <username> - Get GitHub profile info
/crypto <currency> - Get cryptocurrency prices
/movie <title> - Get movie details
/news - Get the latest news
/poll <question> <options> - Create a poll
/qrcode <text> - Generate a QR code
/timer <seconds> - Set a timer
/game - Play a simple game
/chatbox - Display a chatbox with all commands
  `;

  bot.sendMessage(chatId, helpMessage);
});

// Feature 2: Chatbox
bot.onText(/\/chatbox/, (msg) => {
  const chatId = msg.chat.id;

  const chatboxMessage = `
🤖 *Chatbox Commands* 🤖

/start - Start the bot
/help - Show help menu
/joke - Get a funny joke
/weather <city> - Get weather info
/generate_webpage - Generate a webpage
/project_structure - Generate project structure
/clear_history - Clear chat history
/translate <text> - Translate text
/remind <time> <message> - Set a reminder
/quote - Get a motivational quote
/math <expression> - Solve math
/wiki <query> - Search Wikipedia
/github <username> - Get GitHub info
/crypto <currency> - Get crypto prices
/movie <title> - Get movie details
/news - Get latest news
/poll <question> <options> - Create a poll
/qrcode <text> - Generate QR code
/timer <seconds> - Set a timer
/game - Play a simple game
  `;

  bot.sendMessage(chatId, chatboxMessage, { parse_mode: "Markdown" });
});

// Feature 3: Translation
bot.onText(/\/translate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];

  try {
    const translation = await translate(text, { to: "en" });
    bot.sendMessage(chatId, `Translation: ${translation.text}`);
  } catch (error) {
    bot.sendMessage(chatId, "Could not translate the text. Please try again.");
  }
});

// Feature 4: Reminders
bot.onText(/\/remind (\d+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const time = parseInt(match[1], 10) * 1000; // Convert seconds to milliseconds
  const message = match[2];

  setTimeout(() => {
    bot.sendMessage(chatId, `Reminder: ${message}`);
  }, time);

  bot.sendMessage(chatId, `Reminder set for ${match[1]} seconds.`);
});

// Feature 5: Motivational Quotes
bot.onText(/\/quote/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const response = await axios.get("https://api.quotable.io/random");
    const quote = response.data;
    bot.sendMessage(chatId, `"${quote.content}" - ${quote.author}`);
  } catch (error) {
    bot.sendMessage(chatId, "Could not fetch a quote. Please try again.");
  }
});

// Feature 6: Math Solver
bot.onText(/\/math (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const expression = match[1];

  try {
    const result = eval(expression); // Use a safer math library in production
    bot.sendMessage(chatId, `Result: ${result}`);
  } catch (error) {
    bot.sendMessage(chatId, "Invalid math expression. Please try again.");
  }
});

// Feature 7: Wikipedia Search
bot.onText(/\/wiki (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  try {
    const response = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    const data = response.data;
    bot.sendMessage(chatId, `${data.title}\n\n${data.extract}`);
  } catch (error) {
    bot.sendMessage(chatId, "Could not find the Wikipedia page. Please try again.");
  }
});

// Feature 8: Weather
bot.onText(/\/weather (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const city = match[1];

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    const data = response.data;
    const weatherMessage = `
Weather in ${data.name}:
Temperature: ${data.main.temp}°C
Condition: ${data.weather[0].description}
Humidity: ${data.main.humidity}%
Wind Speed: ${data.wind.speed} m/s
    `;
    bot.sendMessage(chatId, weatherMessage);
  } catch (error) {
    bot.sendMessage(chatId, "Could not fetch weather data. Please check the city name and try again.");
  }
});

// Feature 9: Generate Webpage
bot.onText(/\/generate_webpage/, async (msg) => {
  const chatId = msg.chat.id;
  const projectId = uuidv4(); // Unique ID for the project
  const projectPath = path.join(__dirname, "projects", projectId);

  // Create project folder
  fs.mkdirSync(projectPath, { recursive: true });

  // Generate HTML, CSS, and JS files
  const htmlCode = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Basic Webpage</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <h1>Welcome to My Website!</h1>
  <p>This is a basic webpage generated by your AI assistant.</p>
  <script src="js/script.js"></script>
</body>
</html>
  `;

  const cssCode = `
body {
  font-family: Arial, sans-serif;
  text-align: center;
  margin: 0;
  padding: 0;
  background-color: #f4f4f9;
}
h1 {
  color: #333;
}
  `;

  const jsCode = `
console.log("Hello from JavaScript!");
  `;

  // Write files
  fs.writeFileSync(path.join(projectPath, "index.html"), htmlCode);
  fs.mkdirSync(path.join(projectPath, "css"), { recursive: true });
  fs.writeFileSync(path.join(projectPath, "css/styles.css"), cssCode);
  fs.mkdirSync(path.join(projectPath, "js"), { recursive: true });
  fs.writeFileSync(path.join(projectPath, "js/script.js"), jsCode);

  // Host the project
  const livePreviewUrl = `https://your-deployed-url.onrender.com/projects/${projectId}/index.html`;
  bot.sendMessage(chatId, `Your webpage has been generated! Live Preview: ${livePreviewUrl}`);

  // Zip the project files
  const output = fs.createWriteStream(path.join(__dirname, `${projectId}.zip`));
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    bot.sendDocument(chatId, `${projectId}.zip`, { caption: "Download your project files here!" });
    fs.unlinkSync(`${projectId}.zip`); // Clean up the zip file after sending
  });

  archive.pipe(output);
  archive.directory(projectPath, false);
  archive.finalize();
});

// Health check endpoint
app.get("/", (req, res) => res.send("Bot is running!"));

// Serve hosted projects
app.use("/projects", express.static(path.join(__dirname, "projects")));

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

// Keep sending a request to your deployed server every 30 seconds to keep it alive
setInterval(async () => {
  try {
    await axios.get(`https://boiiii.onrender.com`);
    console.log("Ping sent to keep the server alive!");
  } catch (error) {
    console.error("Error while sending keep-alive ping:", error.message);
  }
}, 30000); // 30 seconds interval
