# POS System (Node.js + Firebase)
1. Firebase Console: create project > Authentication > enable **Google** sign-in > Firestore Database (create).
2. Paste `firestore.rules` into Firestore Rules (all data goes through the secure Node server).
3. Download a service account key to `serviceAccountKey.json`, copy `.env.example` to `.env`, fill in web config.
4. `npm install && npm start` then open http://localhost:3000
5. Add your domain under Authentication > Settings > Authorized domains. Camera scanning needs HTTPS (or localhost).
QR codes hold only the product ID, so editing a price never needs reprinting. Labels print 24 per A4 sheet (3x8).
