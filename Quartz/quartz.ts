import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const config = await loadQuartzConfig()

config.plugins.transformers.unshift({
  name: "FilenameAsTitle",
  markdownPlugins() {
    return [
      () => (_tree: unknown, file: any) => {
        const fm = (file.data.frontmatter ??= {}) as Record<string, unknown>
        if (fm.title) return

        const fullPath: string = (file.history && file.history[0]) || file.path || ""
        const base = fullPath.split(/[\\/]/).pop() ?? ""
        const name = base.replace(/\.md$/i, "")

        if (name === "index" || name === "") {
          fm.title = config.configuration.pageTitle
        } else {
          fm.title = name
        }
      },
    ]
  },
} as any)

export default config
export const layout = await loadQuartzLayout()