# Preview PayMind on your Android phone

The app talks to the live Supabase project, so your phone and PC only need internet access. No local database is required.

## One-time setup on your PC (Windows)

1. Install **Node.js 22 LTS** from https://nodejs.org. Use the Windows installer and keep the defaults.
2. Install **Git** from https://git-scm.com/download/win.
3. Open **PowerShell** and run:
   ```powershell
   npm install -g pnpm@10
   git clone https://github.com/Sam-Nathan/PayMind.git
   cd PayMind
   git checkout claude/paymind-backend-architecture-o2ruhc
   pnpm install
   ```

## One-time setup on your phone

Install **Expo Go** from the Google Play Store.

## Run the app (every time)

```powershell
cd PayMind\apps\mobile
pnpm start
```

A QR code appears in the terminal. Open **Expo Go** on your phone, tap **Scan QR code** and scan it. The app loads, and it reloads by itself whenever the code changes.

- Your phone and PC must be on the **same Wi-Fi**.
- If it can't connect (office or college Wi-Fi often blocks this), run `pnpm start --tunnel` instead.

### What works in Expo Go

Sign up, Home, Spaces, create space, add expense, splits, balances, the privacy screen and settings.

### What needs the development build (below)

- **Auto-capture of UPI/bank notifications** and the **UPI app picker** use custom Android code, which Expo Go can't load. In Expo Go these features are hidden and don't crash the app.
- Paying through UPI still works in Expo Go using the generic `upi://` link.

## Development build (to test auto-capture)

1. Create a free account at https://expo.dev.
2. Run:
   ```powershell
   npm install -g eas-cli
   eas login
   cd PayMind\apps\mobile
   eas init              # links the project to your Expo account (one time)
   eas build -p android --profile development
   ```
3. When the cloud build finishes (about 10–20 minutes), open the link on your phone and install the APK.
4. From then on, run `pnpm start --dev-client` and open the **PayMind** app instead of Expo Go.
5. To turn on auto-capture, go to **Privacy & data → UPI & bank alerts → Turn on**.
   - On Android 13 and later, sideloaded apps need one extra step first: **Settings → Apps → PayMind → ⋮ → Allow restricted settings**.

## Sign-up email

Supabase sends a confirmation email when you sign up.

- **For quick testing:** you can switch this off in Supabase → **Authentication → Sign In / Providers → Email → Confirm email** (off).
- **Before launch:** turn it back on.

## Website

```powershell
cd PayMind
pnpm --filter @paymind/web dev
```

Then open http://localhost:3000.

## If something breaks

Copy the red error text from the phone or terminal and send it to Claude. The Supabase function logs are readable from the Claude session.
