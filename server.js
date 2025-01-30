const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const xss = require("xss");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/room/:roomId/:username", (req, res) => {
  res.render("room", { 
    roomId: req.params.roomId,
    username: req.params.username
  });
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { code: "", users: {}, messages: [] };
    }

    rooms[roomId].users[socket.id] = username;
    io.to(roomId).emit("update-users", Object.values(rooms[roomId].users));
    socket.emit("load-code", rooms[roomId].code);
    socket.emit("load-messages", rooms[roomId].messages);
  });

  socket.on("code-update", ({ roomId, code }) => {
    rooms[roomId].code = code;
    socket.to(roomId).emit("code-update", code);
  });

  socket.on("send-message", ({ roomId, message, username }) => {
    const sanitizedMessage = xss(message);
    const newMessage = { username, message: sanitizedMessage };

    rooms[roomId].messages.push(newMessage);
    io.to(roomId).emit("new-message", newMessage);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        delete rooms[roomId].users[socket.id];
        io.to(roomId).emit("update-users", Object.values(rooms[roomId].users));
      }
    }
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
