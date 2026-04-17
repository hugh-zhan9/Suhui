import { IN_ELECTRON } from "@suhui/shared/constants"
import { createBrowserRouter, createHashRouter } from "react-router"

import { Component as App, StartupFallback } from "./App"
import { ErrorElement } from "./components/common/ErrorElement"
import { NotFound } from "./components/common/NotFound"
// @ts-ignore
import { routes as tree } from "./generated-routes"

const routerCreator =
  IN_ELECTRON || globalThis["__DEBUG_PROXY__"] ? createHashRouter : createBrowserRouter

export const router = routerCreator([
  {
    path: "/",
    Component: App,
    HydrateFallback: StartupFallback,
    children: tree,
    errorElement: <ErrorElement />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
])
