import { Folo } from "@suhui/components/icons/folo.js"
import { Logo } from "@suhui/components/icons/logo.jsx"
import { cn } from "@suhui/utils/utils"
import pkg from "@pkg"

export const PoweredByFooter: Component = ({ className }) => (
  <footer className={cn("center mt-12 flex gap-2", className)}>
    {new Date().getFullYear()}
    <Logo className="size-5" />{" "}
    <a
      href={pkg.homepage}
      className="cursor-pointer font-bold text-orange-500 no-underline"
      target="_blank"
      rel="noreferrer"
    >
      <Folo className="size-6" />
    </a>
  </footer>
)
