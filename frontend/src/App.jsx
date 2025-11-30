import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import "./App.css";
import PromptPage from "./pages/PromptPage";
import ReportPage from "./pages/ReportPage";

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <main className="card">
          <header>
            <p className="eyebrow">AI Triage Assistant</p>
            <h1>Clinical Guidance Workspace</h1>
            <p className="subhead">
              Choose between free-text prompt mode or document upload mode.
              Gemini surfaces possible conditions, key findings, and follow-up
              guidance. This does not replace licensed clinicians.
            </p>
          </header>

          <nav className="nav-tabs">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Prompt mode
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Report mode
            </NavLink>
          </nav>

          <Routes>
            <Route path="/" element={<PromptPage />} />
            <Route path="/reports" element={<ReportPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
