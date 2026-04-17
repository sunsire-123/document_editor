const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// 1. Setup SQLite (The 'No-Download' SQL)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite' 
});

// 2. Define the Table
const Document = sequelize.define('Document', {
  id: { type: DataTypes.STRING, primaryKey: true },
  data: { type: DataTypes.TEXT } 
});

const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] },
});

// 3. Sync Database and Start
sequelize.sync().then(() => {
  console.log("✅ SQL Database Connected & File Created");
  server.listen(3001, () => console.log("🚀 Server running on port 3001"));
});

io.on("connection", (socket) => {
  socket.on("get-document", async (documentId) => {
    const document = await findOrCreateDocument(documentId);
    socket.join(documentId);
    socket.emit("load-document", JSON.parse(document.data));

    // --- User Tracking Logic ---
    // Count users in this room and tell everyone
    const updateCount = () => {
      const userCount = io.sockets.adapter.rooms.get(documentId)?.size || 0;
      io.in(documentId).emit("user-count", userCount);
    };

    updateCount(); // Update when someone joins

    socket.on("disconnect", () => {
      updateCount(); // Update when someone leaves
    });
    // ---------------------------

    socket.on("send-changes", (delta) => {
      socket.broadcast.to(documentId).emit("receive-changes", delta);
    });

    socket.on("save-document", async (data) => {
      await Document.update({ data: JSON.stringify(data) }, { where: { id: documentId } });
    });
  });
});

async function findOrCreateDocument(id) {
  if (id == null) return;
  const document = await Document.findByPk(id);
  if (document) return document;
  return await Document.create({ id: id, data: JSON.stringify("") });
}