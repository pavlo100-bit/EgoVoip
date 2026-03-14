const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("EgoVoip server running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "EgoVoip server working"
  });
});

app.post("/call", (req, res) => {
  const { number } = req.body;

  console.log("Call request:", number);

  res.json({
    success: true,
    number: number
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});