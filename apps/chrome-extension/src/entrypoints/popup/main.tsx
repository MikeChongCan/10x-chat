import React from "react"
import ReactDOM from "react-dom/client"
import IndexPopup from "~/popup"
import "~/style.css"

const container = document.getElementById("root")
if (container) {
  const root = ReactDOM.createRoot(container)
  root.render(
    <React.StrictMode>
      <IndexPopup />
    </React.StrictMode>
  )
}
