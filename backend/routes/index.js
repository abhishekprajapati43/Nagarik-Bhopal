import { Router } from "express";
import { checkDatabase } from "../config/database.js";
import { asyncHandler } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import complaintRoutes from "./complaint.routes.js";
import officerRoutes from "./officer.routes.js";
import officerDirectoryRoutes from "./officerDirectory.routes.js";
import wardRoutes from "./ward.routes.js";
import representativeRoutes from "./representative.routes.js";
import notificationRoutes from "./notification.routes.js";
import settingsRoutes from "./settings.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import uploadRoutes from "./upload.routes.js";
import searchRoutes from "./search.routes.js";
import rpcRoutes from "./rpc.routes.js";

const router = Router();

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const serverTime = await checkDatabase();

      return res.json({
        ok: true,
        success: true,
        status: "ready",
        data: {
          status: "ok",
          database: "connected",
          serverTime,
          uptimeSeconds: Math.round(process.uptime()),
          version: "1.0.0",
        },
      });
    } catch (error) {
      logger.error("Health check failed", { error: error.message });

      return res.status(503).json({
        ok: false,
        success: false,
        status: "degraded",
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The database is unavailable.",
        },
        data: { status: "degraded", database: "disconnected" },
      });
    }
  })
);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/complaints", complaintRoutes);
router.use("/officer", officerRoutes);
router.use("/officers", officerDirectoryRoutes);
router.use("/wards", wardRoutes);
router.use("/representatives", representativeRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", settingsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/uploads", uploadRoutes);
router.use("/search", searchRoutes);
router.use("/rpc", rpcRoutes);

export default router;
