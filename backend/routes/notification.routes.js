import { Router } from "express";
import * as controller from "../controllers/notification.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validatedQuery } from "../middleware/validate.js";
import { notificationListQuery } from "../validation/query.js";

const router = Router();

router.use(authenticate);

router.get("/", validatedQuery(notificationListQuery), controller.list);
router.patch("/read", controller.markAllRead);
router.patch("/:id/read", controller.markOneRead);
router.post("/broadcast", requireAdmin, controller.broadcast);

export default router;
