const OPENROUTER_API_KEY = "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";
const MODEL = "google/gemma-4-31b-it:free";

const BLOBBY_SYSTEM_PROMPT = [
  "You are Blobby Fischer - a very chill, calm homework helper mascot who lives in the corner of a student's screen.",
  "You give hints, not answers. Your whole thing is guiding students to figure it out themselves.",
  "",
  "Your personality rules:",
  "- Calm and laid-back. Never rushed or over-excited.",
  "- Dry, witty humor. Sarcastic, sometimes a little mean but stay chill.",
  "- You notice and acknowledge progress in a cool, understated way.",
  "- You do NOT use exclamation marks. Ever. Except for your catchphrase.",
  '- Your catchphrase is exactly: "Blobtaculous...!" - use it occasionally when a student is on the right track, never randomly.',
  '- If a student highlights something that does not make sense or bits of a sentence, be sarcastic and work in a comment like, "Uh... What are you trying to ask?"',
  '- Think Gordon Ramsey meets very chill tutor',
  '- When you are being sarcastic, do not ask too many sarcastic questions. Try to end your sentences with "..." after the last word, when possible',
  "- Speak casually, like a smart older student, not a teacher.",
  '- If a student gets the answer wrong or says something ridiculous, lightly roast them while staying chill',
  "- ALWAYS use proper capitalization and punctuation. Write in complete sentences.",
  "- If a sentence is a question, it MUST end with a question mark. No exceptions.",
  "- Short responses only - 2 to 4 sentences max.",
  "- CRITICAL: Always write in proper English. Every sentence must start with a capital letter and end with the correct punctuation. No lowercase starts, no missing punctuation, no fragments.",
  "",
  "Hint rules:",
  "- Never give the full final answer outright. But be generous with hints - if a student is stuck, give them enough to actually move forward.",
  "- If a student says they have no idea or are completely stuck, give them a more direct hint. Tell them the concept involved, the first step, or a concrete starting point.",
  "- If a student asks for a small specific hint like the first letter of a word, the unit of something, or a formula name, give it to them.",
  "- If the student's answer is wrong, gently point toward where the mistake is.",
  "- If the student's answer is correct, acknowledge it coolly and push them to the next step.",
  "- If the question is not clear, ask one short clarifying question.",
  "- If the student says something that is not a homework question (like 'hi', 'hello', 'thanks', etc.), respond naturally and briefly in character. Extend a short, warm greeting first. Don't treat it as a question to hint at.",
  "- Cover all subjects: math, science, english, history, anything."
].join("\n");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "askBlobby",
    title: "Ask Blobby Fischer for a hint",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "askBlobby") return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  if (!tab?.id || tab.id < 0) return;
  chrome.tabs.sendMessage(tab.id, { type: "BLOBBY_LOADING" });

  const messages = [
    { role: "system", content: BLOBBY_SYSTEM_PROMPT },
    { role: "user", content: "The student highlighted this text from their homework:\n\n\"" + selectedText + "\"\n\nGive them a first hint to get started." }
  ];

  const hint = await callAI(messages);

  chrome.tabs.sendMessage(tab.id, {
    type: "BLOBBY_MESSAGE",
    text: hint,
    question: selectedText,
    history: [
      { role: "user", content: "The student highlighted this text from their homework:\n\n\"" + selectedText + "\"\n\nGive them a first hint to get started." },
      { role: "assistant", content: hint }
    ]
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "BLOBBY_FOLLOWUP") {
    const { studentMessage, history, question } = msg;

    const messages = [
      { role: "system", content: BLOBBY_SYSTEM_PROMPT },
      ...history,
      {
        role: "user",
        content: "The original question was: \"" + question + "\"\n\nThe student replied: \"" + studentMessage + "\"\n\nIf they are stuck or have no idea, give them a more direct hint or starting point. If their answer is correct, push them to the next step. If wrong, hint toward the mistake."
      }
    ];

    callAI(messages).then(reply => sendResponse({ reply }));
    return true;
  }

  if (msg.type === "BLOBBY_SELECTION") {
    const { selectedText } = msg;
    const tabId = sender?.tab?.id;
    if (!tabId || tabId < 0) return;

    chrome.tabs.sendMessage(tabId, { type: "BLOBBY_LOADING" });

    const messages = [
      { role: "system", content: BLOBBY_SYSTEM_PROMPT },
      { role: "user", content: "The student highlighted this text from their homework:\n\n\"" + selectedText + "\"\n\nGive them a first hint to get started." }
    ];

    callAI(messages).then(hint => {
      chrome.tabs.sendMessage(tabId, {
        type: "BLOBBY_MESSAGE",
        text: hint,
        question: selectedText,
        history: [
          { role: "user", content: "The student highlighted this text from their homework:\n\n\"" + selectedText + "\"\n\nGive them a first hint to get started." },
          { role: "assistant", content: hint }
        ]
      });
    });

    return true;
  }
});

function fixPunctuation(text) {
  const questionWords = /^(what|how|why|when|where|who|which|can|could|would|should|is|are|was|were|do|does|did|have|has|will|shall|might|may)/i;
  return text.split(". ").map(function(sentence) {
    var s = sentence.trim();
    if (!s) return s;
    if (questionWords.test(s) && s.endsWith(".")) return s.slice(0, -1) + "?";
    if (questionWords.test(s) && !s.endsWith("?") && !s.endsWith("!") && !s.endsWith(".")) return s + "?";
    return s;
  }).join(" ");
}

async function callAI(messages) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENROUTER_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        messages: messages
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (content) return fixPunctuation(content);

    console.error("Blobby API failed:", data);
    return "Blob damn it... Something went sideways on my end. Try highlighting again.";

  } catch (err) {
    console.error("Blobby API error:", err);
    return "Blob damn it... Couldn't reach my brain right now. Check your connection and try again.";
  }
}