const fs = require('fs');

async function listModels() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const match = env.match(/GEMINI_API_KEY=(.*)/);
  if (!match) return console.error("No key");
  const key = match[1].trim();

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const data = await res.json();
  console.log(JSON.stringify(data.models.map(m => m.name), null, 2));
}

listModels();
