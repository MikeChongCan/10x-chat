import React from "react"
import ReactDOM from "react-dom/client"
import OptionsPage from "~/options"
import "~/style.css"

const container = document.getElementById("root")
if (container) {
  const root = ReactDOM.createRoot(container)
  root.render(
    <React.StrictMode>
      <OptionsPage />
    </React.StrictMode>
  )
}
