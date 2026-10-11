#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { io, Socket } from "socket.io-client";

// WebSocket connection to p5.js editor
let editorSocket: Socket | null = null;
let isConnectedToEditor = false;

// Configuration
const EDITOR_WEBSOCKET_URL = "http://localhost:3001";
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Create MCP server
const server = new McpServer({
  name: "p5js-editor-controller",
  version: "1.0.0"
});

// WebSocket connection management
function connectToEditor() {
  console.error("🔌 Attempting to connect to p5.js editor...");

  editorSocket = io(EDITOR_WEBSOCKET_URL, {
    transports: ['websocket'],
    timeout: 5000,
    reconnection: true,
    // Keep trying forever: the hub may start after Claude does
    reconnectionDelay: 1000,
    reconnectionDelayMax: RECONNECT_INTERVAL,
    reconnectionAttempts: Infinity
  });

  editorSocket.on('connect', () => {
    console.error("✅ Connected to p5.js editor");
    isConnectedToEditor = true;
    // Lets the editor show "Claude connected"
    editorSocket?.emit('identify', 'claude');
  });

  editorSocket.on('disconnect', () => {
    console.error("❌ Disconnected from p5.js editor");
    isConnectedToEditor = false;
  });

  editorSocket.on('connect_error', (error) => {
    console.error("🔌 Connection error:", error.message);
    isConnectedToEditor = false;
  });

  editorSocket.on('projectState', (data) => {
    console.error("📥 Received project state:", data.projectName);
  });

  return editorSocket;
}

// Helper function to send WebSocket message
function sendToEditor(event: string, data?: any): Promise<boolean> {
  return new Promise((resolve) => {
    if (!editorSocket || !isConnectedToEditor) {
      console.error("⚠️ Not connected to editor");
      resolve(false);
      return;
    }

    try {
      if (data) {
        editorSocket.emit(event, data);
      } else {
        editorSocket.emit(event);
      }
      console.error(`📤 Sent ${event} to editor`);
      resolve(true);
    } catch (error) {
      console.error(`❌ Error sending ${event}:`, error);
      resolve(false);
    }
  });
}

// MCP Tools

// 0. Read the sketch: code, console output and control values
type SketchState = {
  requestId: string;
  visible: boolean;
  projectName: string;
  activeFile?: string;
  files: { name: string; content: string }[];
  console: { type: string; content: string }[];
  controls?: Record<string, unknown>;
  canvasSize?: string;
};

function requestSketchState(): Promise<SketchState | null> {
  return new Promise((resolve) => {
    if (!editorSocket || !isConnectedToEditor) return resolve(null);
    const requestId = Math.random().toString(36).slice(2);
    const answers: SketchState[] = [];
    const onState = (state: SketchState) => {
      if (state?.requestId === requestId) answers.push(state);
    };
    editorSocket.on('sketchState', onState);
    editorSocket.emit('requestSketchState', requestId);
    // Several editor tabs may answer; prefer the one on screen
    setTimeout(() => {
      editorSocket?.off('sketchState', onState);
      resolve(answers.find(a => a.visible) ?? answers[0] ?? null);
    }, 700);
  });
}

server.tool(
  "get_sketch",
  "Read what is open in the p5.js editor: every file's code, the console output (errors, warnings, logs) and the current control values. Use this before fixing an error or changing the user's current sketch.",
  {},
  async () => {
    const state = await requestSketchState();
    if (!state) {
      return {
        content: [{ type: "text", text: "❌ No editor answered. Make sure the editor is open in the browser and connected (header pill says Claude connected)." }],
        isError: true
      };
    }
    const files = state.files
      .map(f => `--- ${f.name}${f.name === state.activeFile ? ' (open)' : ''} ---\n${f.content}`)
      .join('\n\n');
    const consoleText = state.console.length
      ? state.console.map(m => `[${m.type}] ${m.content}`).join('\n')
      : '(empty)';
    return {
      content: [{
        type: "text",
        text: `Sketch: ${state.projectName}${state.canvasSize ? ` (canvas ${state.canvasSize})` : ''}\n\n` +
          `Console:\n${consoleText}\n\n` +
          `Control values: ${JSON.stringify(state.controls ?? {})}\n\n` +
          `Files:\n${files}`
      }]
    };
  }
);

// 1. Code Update Tool
server.tool(
  "update_code",
  {
    code: z.string().describe("The p5.js code to update in the editor"),
    description: z.string().optional().describe("Optional description of the code changes")
  },
  async ({ code, description }) => {
    const success = await sendToEditor('codeUpdate', { code });

    if (success) {
      return {
        content: [{
          type: "text",
          text: `✅ Code updated successfully${description ? `: ${description}` : ''}\n\nCode sent:\n\`\`\`javascript\n${code}\n\`\`\``
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: "❌ Failed to update code. Make sure the p5.js editor is running and MCP is enabled."
        }],
        isError: true
      };
    }
  }
);

// 2. Execution Control Tools
server.tool(
  "start_execution",
  {},
  async () => {
    const success = await sendToEditor('startExecution');
    return {
      content: [{
        type: "text",
        text: success ? "▶️ Started code execution" : "❌ Failed to start execution"
      }]
    };
  }
);

server.tool(
  "stop_execution",
  {},
  async () => {
    const success = await sendToEditor('stopExecution');
    return {
      content: [{
        type: "text",
        text: success ? "⏹️ Stopped code execution" : "❌ Failed to stop execution"
      }]
    };
  }
);

server.tool(
  "toggle_execution",
  {},
  async () => {
    const success = await sendToEditor('toggleExecution');
    return {
      content: [{
        type: "text",
        text: success ? "🔄 Toggled code execution" : "❌ Failed to toggle execution"
      }]
    };
  }
);

// 3. Console Control Tools
server.tool(
  "clear_console",
  {},
  async () => {
    const success = await sendToEditor('clearConsole');
    return {
      content: [{
        type: "text",
        text: success ? "🧹 Console cleared" : "❌ Failed to clear console"
      }]
    };
  }
);

server.tool(
  "add_console_message",
  {
    message: z.string().describe("Message to add to the console"),
    type: z.enum(["info", "warn", "error"]).default("info").describe("Type of console message")
  },
  async ({ message, type }) => {
    const success = await sendToEditor('addConsoleMessage', {
      type,
      message,
      timestamp: Date.now()
    });

    return {
      content: [{
        type: "text",
        text: success ? `📝 Added ${type} message to console: "${message}"` : "❌ Failed to add console message"
      }]
    };
  }
);

// 4. File Management Tools
server.tool(
  "select_file",
  {
    filename: z.string().describe("Name of the file to select (e.g., 'sketch.js')")
  },
  async ({ filename }) => {
    const success = await sendToEditor('selectFile', filename);
    return {
      content: [{
        type: "text",
        text: success ? `📁 Selected file: ${filename}` : `❌ Failed to select file: ${filename}`
      }]
    };
  }
);

server.tool(
  "create_file",
  {
    name: z.string().describe("Name of the new file"),
    content: z.string().describe("Initial content for the file")
  },
  async ({ name, content }) => {
    const success = await sendToEditor('createFile', { name, content });
    return {
      content: [{
        type: "text",
        text: success ? `📄 Created file: ${name}` : `❌ Failed to create file: ${name}`
      }]
    };
  }
);

server.tool(
  "delete_file",
  {
    filename: z.string().describe("Name of the file to delete")
  },
  async ({ filename }) => {
    const success = await sendToEditor('deleteFile', filename);
    return {
      content: [{
        type: "text",
        text: success ? `🗑️ Deleted file: ${filename}` : `❌ Failed to delete file: ${filename}`
      }]
    };
  }
);

// 5. Layout Control Tools
server.tool(
  "toggle_sidebar",
  {},
  async () => {
    const success = await sendToEditor('toggleSidebar');
    return {
      content: [{
        type: "text",
        text: success ? "📋 Toggled sidebar" : "❌ Failed to toggle sidebar"
      }]
    };
  }
);

server.tool(
  "update_project_name",
  {
    name: z.string().describe("New name for the project")
  },
  async ({ name }) => {
    const success = await sendToEditor('updateProjectName', name);
    return {
      content: [{
        type: "text",
        text: success ? `📝 Updated project name to: ${name}` : "❌ Failed to update project name"
      }]
    };
  }
);

// 6. Navigation Tools
server.tool(
  "go_to_dashboard",
  {},
  async () => {
    const success = await sendToEditor('backToDashboard');
    return {
      content: [{
        type: "text",
        text: success ? "🏠 Navigated to dashboard" : "❌ Failed to navigate to dashboard"
      }]
    };
  }
);

// 7. Connection Status Tool
server.tool(
  "check_connection",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: `🔌 Connection Status:\n- Editor WebSocket: ${isConnectedToEditor ? '✅ Connected' : '❌ Disconnected'}\n- WebSocket URL: ${EDITOR_WEBSOCKET_URL}`
      }]
    };
  }
);

// Resources

// Project state resource
server.resource(
  "project-state",
  "p5js://project/current",
  async () => {
    return {
      contents: [{
        uri: "p5js://project/current",
        text: `Current p5.js Editor Connection Status:
- WebSocket Connected: ${isConnectedToEditor}
- WebSocket URL: ${EDITOR_WEBSOCKET_URL}
- Last Connection Attempt: ${new Date().toISOString()}

Available Tools:
- update_code: Update the code in the editor
- start_execution/stop_execution/toggle_execution: Control code execution
- clear_console/add_console_message: Manage console output
- select_file/create_file/delete_file: File management
- toggle_sidebar: Toggle the file explorer sidebar
- update_project_name: Change the project name
- go_to_dashboard: Navigate back to the dashboard
- check_connection: Check WebSocket connection status

To use these tools, make sure:
1. The p5.js editor is running at http://localhost:3000
2. MCP is enabled in the editor (Enable MCP button)
3. The WebSocket server is accessible at ${EDITOR_WEBSOCKET_URL}`
      }]
    };
  }
);

// Prompts

// Code generation prompt
server.prompt(
  "generate-p5js-code",
  {
    description: z.string().describe("Description of what the p5.js sketch should do"),
    style: z.string().optional().describe("Complexity level: beginner, intermediate, or advanced")
  },
  async ({ description, style }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create a p5.js sketch that ${description}. 

Style: ${style || 'intermediate'} level

Requirements:
- Include setup() and draw() functions
- Use appropriate p5.js functions and best practices
- Add helpful comments
- Make it interactive if possible
- Ensure the code is complete and runnable

Please provide clean, well-structured p5.js code.`
      }
    }]
  })
);

// Debugging prompt
server.prompt(
  "debug-p5js-code",
  {
    code: z.string().describe("The p5.js code that needs debugging"),
    issue: z.string().describe("Description of the issue or error")
  },
  async ({ code, issue }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Debug this p5.js code:

\`\`\`javascript
${code}
\`\`\`

Issue: ${issue}

Please:
1. Identify the problem
2. Explain what's causing it
3. Provide the corrected code
4. Suggest improvements if any

Focus on p5.js best practices and common pitfalls.`
      }
    }]
  })
);

// Main function
async function main() {
  console.error("🚀 Starting p5.js MCP Server...");

  // Connect to editor WebSocket
  connectToEditor();

  // Connect to MCP transport (stdio for Claude Desktop)
  const transport = new StdioServerTransport();

  console.error("📡 Connecting to Claude Desktop via stdio...");
  await server.connect(transport);

  console.error("✅ p5.js MCP Server is running!");
  console.error("💡 Make sure your p5.js editor is running at http://localhost:3000 with MCP enabled");
}

// Handle process termination
process.on('SIGINT', () => {
  console.error("👋 Shutting down p5.js MCP Server...");
  if (editorSocket) {
    editorSocket.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error("👋 Shutting down p5.js MCP Server...");
  if (editorSocket) {
    editorSocket.disconnect();
  }
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
}); 