import "@suhui/components/tailwind"
import "./remote.css"

import React from "react"
import ReactDOM from "react-dom/client"

import { RemoteApp } from "./remote-app"

const container = document.querySelector("#root")

if (!container) {
  throw new Error("Remote root container not found")
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <RemoteApp />
  </React.StrictMode>,
)
