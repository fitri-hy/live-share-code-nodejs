const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const xss = require("xss");
const crypto = require("crypto");
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SECRET_KEY = "1234567890abcdef1234567890abcdef";
const IV = "abcdef1234567890";

const encrypt = (text) => {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(SECRET_KEY), IV);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

const decrypt = (text) => {
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(SECRET_KEY), IV);
    let decrypted = decipher.update(text, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    return null;
  }
};

app.use(
  session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/join/:roomId/:username", (req, res) => {
  const encryptedRoomId = encrypt(req.params.roomId);
  const encryptedUsername = encrypt(req.params.username);
  res.redirect(`/room/${encryptedRoomId}/${encryptedUsername}`);
});

app.get("/room/:roomId/:username", (req, res) => {
  const roomId = decrypt(req.params.roomId);
  const username = decrypt(req.params.username);

  if (!roomId || !username) {
    return res.redirect(`/?error=invalid_room`);
  }

  req.session.roomId = roomId;
  req.session.username = username;

  res.render("room", { roomId, username });
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
