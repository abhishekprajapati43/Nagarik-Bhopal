import { Router } from "express";
import * as controller from "../controllers/search.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validatedQuery } from "../middleware/validate.js";
import { searchQuery } from "../validation/query.js";

const router = Router();

router.get("/", authenticate, validatedQuery(searchQuery), controller.searchAll);

export default router;
