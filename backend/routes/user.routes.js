import { Router } from "express";
import * as controller from "../controllers/user.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validatedQuery } from "../middleware/validate.js";
import { userListQuery } from "../validation/query.js";

const router = Router();

router.use(authenticate);

router.patch("/me", controller.updateMe);
router.get("/", requireAdmin, validatedQuery(userListQuery), controller.list);
router.patch("/:id/status", requireAdmin, controller.setStatus);

export default router;
