# Forma

A responsive personal AI chat workspace. Chats, uploaded file contents, assistant persona settings, and API connection settings are stored in the browser on the current device. No application server or account database is required.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local URL shown by Vite.

## Connect a model

Open **Model settings** to manage provider profiles in a sidebar. Add profiles, enable or disable them, add model IDs to each profile, and switch profiles from the model menu in the chat header. Each profile stores its own base URL, API key, models, and optional JSON headers. Provider presets can fill common URLs and starter model IDs. Providers must allow browser requests (CORS) for their API endpoint. This frontend sends the key and conversation directly from your browser to the selected provider; avoid using it on shared devices. Do not publish a preconfigured API key.

The Anthropic Messages API and other non-OpenAI formats are not directly compatible. They need a server-side adapter, both for request formatting and to protect shared API credentials.

In **Settings → Preferences**, enable **No app-set output limit** to omit `max_tokens` from requests. The provider can still apply its own response limit.

## Attachments

Images are sent as image input to a vision-capable model. Plain text and common code files, PDFs, and DOCX documents are extracted in the browser and included as text context. Scanned PDFs may have no extractable text; audio and video are not transcribed. Provider context limits still apply.

## Local storage

Conversation history and attachment content are stored in IndexedDB. Persona, provider, and API key settings use browser localStorage. Clearing browser storage removes this data. Use **Preferences → Export chats** to save a JSON backup.
