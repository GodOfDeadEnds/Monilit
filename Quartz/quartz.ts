import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const config = await loadQuartzConfig()

config.plugins.transformers.unshift({
  name: "FilenameAsTitle",
  markdownPlugins() {
    return [
      () => (_tree: unknown, file: any) => {
        const fm = (file.data.frontmatter ??= {}) as Record<string, unknown>
        if (fm.title) return

        // Берем "сырое" имя файла из истории
        const fullPath: string = (file.history && file.history[0]) || file.path || ""
        const base = fullPath.split(/[\\/]/).pop() ?? ""
        let name = base.replace(/\.md$/i, "")

        // Если имя выглядит как URL-encoded строка, декодируем его
        try {
          if (/%[0-9A-F]{2}/i.test(name)) {
            name = decodeURIComponent(name)
          }
        } catch (e) {
          // Если декодирование не удалось, оставляем имя как есть
          console.warn(`Failed to decode filename: ${name}`, e)
        }

        // Для главной страницы используем название сайта, для остальных — имя файла
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