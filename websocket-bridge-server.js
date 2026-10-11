const http = require('http');
const { Server } = require('socket.io');

// Always 3001: the editor and the MCP server both look for the hub here.
// (Moving to another port silently is what used to break the connection.)
const PORT = 3001;
let io = null;

// Store connected clients; each says whether it's the 'editor' or 'claude' (the MCP server)
const clients = new Set();

const roleCounts = () => {
  let editors = 0;
  let claude = 0;
  for (const socket of clients) {
    if (socket.data.role === 'editor') editors++;
    else if (socket.data.role === 'claude') claude++;
    // 'pending': just connected, hasn't said what it is yet
  }
  return { editors, claude };
};

// Tell every editor who is connected, so it can show a live status
const broadcastStatus = () => {
  if (io) io.emit('hubStatus', roleCounts());
};

function startServer() {
  // Plain HTTP on the same port answers /status, so tools can check this is our hub
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ hub: 'p5js-editor', ...roleCounts() }));
  });

  io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"]
    }
  });

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use, so the hub can't start.`);
      console.error('   Close the other program using it, or double-click start-p5.command (it cleans this up).');
    } else {
      console.error('❌ Hub error:', error);
    }
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`🚀 WebSocket Bridge Server running on port ${PORT}`);
    console.log('📝 Ready to bridge MCP commands to p5.js AI Editor...\n');
  });

  setupServerHandlers();
}

// Set up server event handlers
function setupServerHandlers() {
  // Handle client connections
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    socket.data.role = 'pending';
    clients.add(socket);
    // Editors identify right away. Anything silent after 2s is an older MCP server
    // (built before 'identify' existed), which is Claude.
    setTimeout(() => {
      if (socket.connected && socket.data.role === 'pending') {
        socket.data.role = 'claude';
        broadcastStatus();
      }
    }, 2000);
    broadcastStatus();

    socket.on('identify', (role) => {
      socket.data.role = role === 'editor' ? 'editor' : 'claude';
      console.log(`🪪 ${socket.id} is ${socket.data.role === 'editor' ? 'an editor' : 'Claude (MCP)'}`);
      broadcastStatus();
    });

    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
      clients.delete(socket);
      broadcastStatus();
    });

    // Listen for heartbeat pings
    socket.on('ping', (data) => {
      console.log(`💓 Heartbeat from ${socket.id}`);
      socket.emit('pong', data);
    });

    // ===== MCP COMMAND FORWARDING =====
    // These events come from the MCP server and need to be forwarded to the webapp

    // Code update from MCP server
    socket.on('codeUpdate', (data) => {
      console.log('📝 [MCP→WebApp] Code update received, forwarding to webapp clients...');
      console.log(`   Code preview: ${data.code ? data.code.substring(0, 100) + '...' : 'No code'}`);

      // Forward to all OTHER clients (not the sender)
      socket.broadcast.emit('codeUpdate', data);
      console.log(`   ✅ Forwarded to ${clients.size - 1} webapp client(s)`);
    });

    // Execution control commands
    socket.on('startExecution', () => {
      console.log('▶️ [MCP→WebApp] Start execution command, forwarding...');
      socket.broadcast.emit('startExecution');
    });

    socket.on('stopExecution', () => {
      console.log('⏹️ [MCP→WebApp] Stop execution command, forwarding...');
      socket.broadcast.emit('stopExecution');
    });

    socket.on('toggleExecution', () => {
      console.log('🔄 [MCP→WebApp] Toggle execution command, forwarding...');
      socket.broadcast.emit('toggleExecution');
    });

    // Console control commands
    socket.on('clearConsole', () => {
      console.log('🧹 [MCP→WebApp] Clear console command, forwarding...');
      socket.broadcast.emit('clearConsole');
    });

    socket.on('addConsoleMessage', (data) => {
      console.log('📱 [MCP→WebApp] Add console message command, forwarding...');
      socket.broadcast.emit('addConsoleMessage', data);
    });

    socket.on('setConsoleHeight', (height) => {
      console.log(`📏 [MCP→WebApp] Set console height (${height}px), forwarding...`);
      socket.broadcast.emit('setConsoleHeight', height);
    });

    // File management commands
    socket.on('selectFile', (fileId) => {
      console.log(`📂 [MCP→WebApp] Select file (${fileId}), forwarding...`);
      socket.broadcast.emit('selectFile', fileId);
    });

    socket.on('closeTab', (fileId) => {
      console.log(`❌ [MCP→WebApp] Close tab (${fileId}), forwarding...`);
      socket.broadcast.emit('closeTab', fileId);
    });

    socket.on('createFile', (fileData) => {
      console.log(`📄 [MCP→WebApp] Create file (${fileData.name}), forwarding...`);
      socket.broadcast.emit('createFile', fileData);
    });

    socket.on('deleteFile', (fileId) => {
      console.log(`🗑️ [MCP→WebApp] Delete file (${fileId}), forwarding...`);
      socket.broadcast.emit('deleteFile', fileId);
    });

    // Layout control commands
    socket.on('toggleSidebar', () => {
      console.log('📋 [MCP→WebApp] Toggle sidebar, forwarding...');
      socket.broadcast.emit('toggleSidebar');
    });

    socket.on('updateProjectName', (name) => {
      console.log(`📝 [MCP→WebApp] Update project name (${name}), forwarding...`);
      socket.broadcast.emit('updateProjectName', name);
    });

    // Navigation commands
    socket.on('backToDashboard', () => {
      console.log('🏠 [MCP→WebApp] Navigate to dashboard, forwarding...');
      socket.broadcast.emit('backToDashboard');
    });

    // ===== WEBAPP RESPONSES =====
    // These events come from the webapp and can be logged or forwarded to MCP server

    socket.on('projectState', (data) => {
      console.log('📥 [WebApp→MCP] Received project state:', data.projectName, `(${data.files?.length || 0} files)`);
      // Could forward this to MCP server if needed
    });

    socket.on('getProjectState', () => {
      console.log('📝 [WebApp→MCP] Client requesting project state...');
    });

    // Catch-all for any other events
    socket.onAny((eventName, ...args) => {
      if (!['ping', 'pong'].includes(eventName)) {
        console.log(`📨 [Unknown] Received event: ${eventName}`, args.length > 0 ? `(${args.length} args)` : '');
      }
    });
  });

  // Handle server errors
  io.engine.on('connection_error', (err) => {
    console.log('🔌 Connection error:', err.req, err.code, err.message, err.context);
  });
}

// Show status
function showStatus() {
  console.log(`\n📊 Bridge Server Status:`);
  const { editors, claude } = roleCounts();
  console.log(`   Connected: ${editors} editor(s), ${claude} Claude`);
  console.log(`   Server port: ${PORT}`);
  console.log(`   CORS origin: http://localhost:3000`);
  console.log(`   Mode: MCP Command Bridge`);
  console.log(`   Function: Forwards MCP commands to webapp\n`);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bridge server...');
  if (io) {
    io.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down bridge server...');
  if (io) {
    io.close();
  }
  process.exit(0);
});

// Start the server
startServer();

// Show initial status
setTimeout(() => {
  showStatus();
  console.log('💡 Leave this running. The editor and Claude connect on their own.\n');
}, 1000); 