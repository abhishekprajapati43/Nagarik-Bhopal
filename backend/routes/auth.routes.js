import { Router } from "express";

const router = Router();

router.post("/register", (req, res) => {
  res.json({
    message: "Register API Working",
  });
});

router.post("/login", (req, res) => {
  res.json({
    message: "Login API Working",
  });
});

export default router;
