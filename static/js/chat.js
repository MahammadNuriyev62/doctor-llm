// Store conversation history
let conversation = [
  // Initial system message
  { role: "system", content: "You are a helpful assistant." },
];

// DOM elements
const messagesContainer = document.getElementById("messages-container");
const userInput = document.getElementById("user-input");
const chatForm = document.getElementById("chat-form");
const sendButton = document.getElementById("send-btn");
const newChatButton = document.getElementById("new-chat-btn");
const mobileMenuButton = document.getElementById("mobile-menu-btn");
const sidebar = document.querySelector(".sidebar");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Focus on input
  userInput.focus();

  // Auto resize textarea as user types
  userInput.addEventListener("input", autoResizeTextarea);
});

// Form submission
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

// New chat button
newChatButton.addEventListener("click", () => {
  startNewChat();
});

// Mobile menu toggle
mobileMenuButton.addEventListener("click", () => {
  sidebar.classList.toggle("active");
});

// Auto resize textarea
function autoResizeTextarea() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
}

// Send message function
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Clear and reset input
  userInput.value = "";
  userInput.style.height = "auto";
  userInput.focus();

  // Disable input while processing
  userInput.disabled = true;
  sendButton.disabled = true;

  // Remove welcome screen if present
  const welcomeScreen = document.querySelector(".welcome-screen");
  if (welcomeScreen) {
    welcomeScreen.remove();
  }

  // Add user message to conversation
  conversation.push({ role: "user", content: text });

  // Display user message
  addMessageToUI("user", text);

  // Scroll to bottom
  scrollToBottom();

  try {
    // Show typing indicator
    const assistantId = Date.now();
    addTypingIndicator(assistantId);

    // Prepare request to the server
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(conversation),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    // Remove typing indicator
    removeTypingIndicator(assistantId);

    // Create empty assistant message
    let assistantMessage = { role: "assistant", content: "" };

    // Add to conversation
    conversation.push(assistantMessage);

    // Add empty message to UI
    const messageId = addMessageToUI("assistant", "");

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Convert chunk to string
      const chunk = decoder.decode(value, { stream: true });

      // Update assistant message
      assistantMessage.content += chunk;

      // Update UI
      updateMessageInUI(messageId, assistantMessage.content);

      // Scroll to bottom as new content arrives
      scrollToBottom();
    }
  } catch (error) {
    console.error("Error:", error);
    addMessageToUI(
      "system",
      `Error: ${error.message || "Could not connect to the assistant"}`
    );
  } finally {
    // Re-enable input
    userInput.disabled = false;
    sendButton.disabled = false;

    // Scroll to bottom once more
    scrollToBottom();
  }
}

// Add message to UI
function addMessageToUI(role, content) {
  const messageId = Date.now();

  const messageWrapper = document.createElement("div");
  messageWrapper.classList.add("message-wrapper", role);
  messageWrapper.id = `message-${messageId}`;

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  // Create avatar
  const avatar = document.createElement("div");
  avatar.classList.add("avatar", role);

  if (role === "user") {
    // User avatar with icon
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-user");
    avatar.appendChild(icon);
  } else if (role === "assistant") {
    // Assistant avatar with logo
    const img = document.createElement("img");
    img.src = "/static/img/llama-logo.png";
    img.onerror = function () {
      // Fallback to icon if image can't load
      this.remove();
      const icon = document.createElement("i");
      icon.classList.add("fa-solid", "fa-robot");
      avatar.appendChild(icon);
    };
    avatar.appendChild(img);
  } else if (role === "system") {
    // System message avatar
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-circle-info");
    avatar.appendChild(icon);
  }

  // Message text container
  const messageText = document.createElement("div");
  messageText.classList.add("message-text");

  const messageBubble = document.createElement("div");
  messageBubble.classList.add("message-bubble");
  messageBubble.textContent = content;

  messageText.appendChild(messageBubble);
  messageContent.appendChild(avatar);
  messageContent.appendChild(messageText);
  messageWrapper.appendChild(messageContent);
  messagesContainer.appendChild(messageWrapper);

  return messageId;
}

// Update existing message in UI
function updateMessageInUI(messageId, content) {
  const messageBubble = document.querySelector(
    `#message-${messageId} .message-bubble`
  );
  if (messageBubble) {
    messageBubble.textContent = content;
  }
}

// Add typing indicator
function addTypingIndicator(id) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message-wrapper", "assistant");
  wrapper.id = `typing-${id}`;

  const content = document.createElement("div");
  content.classList.add("message-content");

  // Create avatar
  const avatar = document.createElement("div");
  avatar.classList.add("avatar", "assistant");

  // Assistant avatar with logo
  const img = document.createElement("img");
  img.src = "/static/img/llama-logo.png";
  img.onerror = function () {
    // Fallback to icon if image can't load
    this.remove();
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-robot");
    avatar.appendChild(icon);
  };
  avatar.appendChild(img);

  // Message text container
  const messageText = document.createElement("div");
  messageText.classList.add("message-text");

  const indicator = document.createElement("div");
  indicator.classList.add("typing-indicator");

  messageText.appendChild(indicator);
  content.appendChild(avatar);
  content.appendChild(messageText);
  wrapper.appendChild(content);
  messagesContainer.appendChild(wrapper);

  scrollToBottom();
}

// Remove typing indicator
function removeTypingIndicator(id) {
  const indicator = document.getElementById(`typing-${id}`);
  if (indicator) {
    indicator.remove();
  }
}

// Scroll to bottom of messages
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Start a new chat
function startNewChat() {
  // Reset conversation
  conversation = [{ role: "system", content: "You are a helpful assistant." }];

  // Clear UI
  messagesContainer.innerHTML = `
        <div class="welcome-screen">
            <img src="/static/img/llama-logo.png" alt="Llama Logo" class="welcome-logo" onerror="this.src='https://via.placeholder.com/100'">
            <h2>How can I help you today?</h2>
        </div>
    `;

  // Close mobile sidebar if open
  sidebar.classList.remove("active");

  // Focus on input
  userInput.focus();
}

// Handle Enter key for sending message
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
