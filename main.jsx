import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        {/* HashRouter keeps routes (e.g. #/complaints) working on a plain static
            server such as VS Code Live Server, which has no SPA fallback. */}
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
