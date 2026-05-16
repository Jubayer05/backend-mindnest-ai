import "dotenv/config";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";

export default app;

const isVercel = process.env.VERCEL === "1";

async function startLocalServer() {
  try {
    await prisma.$connect();
    console.log("Connected to database successfully 🚀");

    const PORT = process.env.PORT || 8000;
    const httpServer = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
    });

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      console.error("Server error:", error);
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use`);
      }
    });
  } catch (error) {
    await prisma.$disconnect();
    console.error("Error connecting to database:", error);
    process.exit(1);
  }
}

if (isVercel) {
  void prisma.$connect().catch((error) => {
    console.error("Error connecting to database:", error);
  });
} else {
  void startLocalServer();
}
