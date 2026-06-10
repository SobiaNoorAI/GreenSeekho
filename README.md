# GreenSeekho 🌿🤖

GreenSeekho is an intelligent, AI-powered plant identification and study platform built under the **AISeekho** initiative. Designed to make botany simple for curious kids ("burger kids") and robust for agriculture students, this computer vision application allows users to snap or upload photos of plants and leaves to receive instant, localized botanical profiles.

---

## 🌟 Key Features

- **Multimodal AI Analysis:** Upload a photo of any leaf, flower, or plant part to get an instantaneous taxonomic profile.
- **Localized Plant Data:** Discover plant identities across international and local regional languages, bridging the gap between similar family species.
- **Ethnobotanical Profiles:** Access accurate data on growing seasons, native regions, and historical or traditional medicinal uses.
- **Student Portal:** A private space for agriculture students to organize their field research into custom, color-coded folders.
- **Look-Alike Distinction Engine:** Highlights key structural differences between two plants belonging to the exact same botanical family.

---

## 🛠️ Project Structure & Tech Stack

This project was developed inside **Google AI Studio** and is optimized for local development and editing using modern agent tools.

- **AI Engine:** Google Gemini API (Multimodal capabilities)
- **Frontend Stack:** React / TypeScript / Vite / Tailwind CSS
- **Database & Backend:** Firebase Authentication & Cloud Firestore (for folders and user collections)

### Main Files Included:
- `src/` - Core application components and application logic
- `firestore.rules` - Real-time security rules for cloud data protection
- `firebase-applet-config.json` / `firebase-blueprint.json` - Active backend configuration files
- `vite.config.ts` / `tsconfig.json` - Fast TypeScript asset bundling and development configuration

---


## 🛡️ Cloud Database Configuration

To successfully use the folder saving features, your linked Firestore database rules during early testing should be configured as open:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
*⚠️ Production Note: Switch rules to `allow read, write: if request.auth != null;` prior to final global hosting to lock down user data storage.*

---

## 🎓 Made by AISeekho
Making environmental education and agriculture analytics accessible, interactive, and fun for learners worldwide.



<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a1f7dbf6-2210-4cf1-bc33-2a6536429f0e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
