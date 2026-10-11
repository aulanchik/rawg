# rest-node-ts

A Node.js TypeScript template for building RESTful APIs.
This repository provides a solid foundation with a structured project layout, essential middleware, and development scripts to get you started quickly.

## Features

- **TypeScript**: Fully configured TypeScript setup for type safety and modern JavaScript features.
- **Structured Layout**: Organized directory structure for controllers, routes, middleware, and utilities.
- **Environment Variables**: Uses `dotenv` for managing environment-specific configurations.
- **Development Ready**: Uses [`tsx`](https://tsx.is/) (`tsx watch`) for fast startup and automatic server restarts on file changes.
- **Path Aliasing**: Cleaner import statements (`@/` maps to `src/`), resolved natively by `tsx` from `tsconfig.json` during development.
- **Custom Logger**: A simple, colorful console logger for different message types (info, success, warn, error).
- **Essential Middleware**:
  - `cors`: For enabling Cross-Origin Resource Sharing.
  - `morgan`: For HTTP request logging.
  - `helmet`: To help secure your Express apps by setting various HTTP headers.

## Project Structure

```
src/
├── app.ts                  # Express app configuration and middleware setup
├── server.ts               # Server entry point
├── config/
│   └── env.ts              # Environment variable configuration
├── controllers/
│   └── sampleController.ts # Example controller logic
├── middleware/
│   └── errorHandler.ts     # Basic error handling middleware
├── routes/
│   └── sampleRoutes.ts     # Example route definitions
└── utils/
    └── logger.ts           # Custom logging utility
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20.0.0 or higher recommended)
- [pnpm](https://pnpm.io/installation) package manager

_Note: `pnpm` commands can be replaced by `npm` and `yarn`._

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/aulanchik/rest-node-ts.git
    cd rest-node-ts
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root directory by copying the example file:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and specify a `PORT`:
    ```env
    PORT=8080
    ```
    If no port is specified, the server will default to port `3000`.

## Available Scripts

### Run in Development Mode

To start the server with automatic restarts on file changes, run:

```bash
pnpm dev
```

This runs `tsx watch src/server.ts`. The server will be accessible at `http://localhost:<PORT>`.

_Note: `tsx` does not type-check your code. To check types, run `npx tsc --noEmit`._

### Build for Production

To compile the TypeScript code into JavaScript in the `dist/` directory:

```bash
pnpm build
```

### Start Production Server

To run the compiled application (make sure you have run `pnpm build` first):

```bash
pnpm start
```

## API Endpoints

This template includes a sample endpoint to demonstrate the structure.

- **`GET /`**
  - **Description**: Returns a simple JSON message.
  - **Response**:
    ```json
    {
      "message": "This is a sample endpoint."
    }
    ```
