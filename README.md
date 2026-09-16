# Custom Webmail

A high-performance full-stack webmail client with IMAP/SMTP integration, rich text composing, local draft persistence (SQLite), attachment management, and secure API token authentication.

## Features

- **IMAP / SMTP Integration**: Connect securely to mail servers (Rackspace, Gmail, Outlook, custom servers).
- **Local SQLite Persistence**: Reliable storage for drafts, local sync state, and outgoing delivery queues.
- **Rich Text Compose**: Advanced editor with formatting tools, custom sender display names, priorities, read receipts, and file attachments.
- **Secure Authentication**: Optional `APP_TOKEN` header protection for all API endpoints and secure 127.0.0.1 default binding.
- **Attachment Management**: Direct streaming download endpoints with automatic content optimization.

---

## Installation & Setup

1. **Clone or Open the Repository**:
   Ensure you have Node.js (v18+) installed.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and set your configuration:
   ```env
   HOST=127.0.0.1
   PORT=3000
   APP_TOKEN=your-secure-private-token
   ```

---

## Running the Application

### Development Mode
Boots the Express backend and Vite development server concurrently:
```bash
npm run dev
```

### Production Build
Bundles the server and compiles static frontend assets into `dist`:
```bash
npm run build
```

### Production Start
Launches the production server (using `cross-env` for Windows/Linux/macOS compatibility):
```bash
npm start
```

---

## Testing & Maintenance

- **Run Type Checks & Linter**:
  ```bash
  npm test
  ```
- **Clean Build Artifacts**:
  ```bash
  npm run clean
  ```
