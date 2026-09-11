const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require("obsidian");

const DEFAULT_SETTINGS = {
    webhookUrl: "",
    playerName: "Obsidian2Discord"
};

module.exports = class Obsidian2DiscordPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.registerMarkdownCodeBlockProcessor(
            "discord-dice",
            (source, el, ctx) => this.renderSendButton(el, ctx)
        );

        this.addSettingTab(
            new Obsidian2DiscordSettingTab(this.app, this)
        );

        this.addCommand({
            id: "test-discord-webhook",
            name: "Test Discord webhook",
            callback: () => this.sendTestMessage()
        });
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    renderSendButton(el, ctx) {
        el.empty();

        const button = el.createEl("button", {
            text: "💬",
            cls: "obsidian2discord-button",
            attr: {
                "aria-label": "Отправить блок в Discord",
                title: "Отправить блок в Discord"
            }
        });

        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            button.disabled = true;

            try {
                const block = await this.findSourceBlock(ctx);

                if (!block) {
                    new Notice(
                        "Obsidian2Discord: не удалось определить блок."
                    );
                    return;
                }

                await this.sendToDiscord(block);
            } catch (error) {
                console.error("Obsidian2Discord:", error);
                new Notice(
                    "Obsidian2Discord: ошибка при отправке."
                );
            } finally {
                button.disabled = false;
            }
        });
    }

    async findSourceBlock(ctx) {
        if (!ctx?.sourcePath) return null;

        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!file) return null;

        const markdown = await this.app.vault.read(file);

        /*
         * Obsidian gives the processor its source path, but not a direct
         * Markdown character offset for this particular code block.
         *
         * We therefore identify the clicked marker by its position among
         * discord-dice processor blocks in the rendered parent.
         */
        const markerIndex = this.getMarkerIndex(ctx.el);
        const markers = this.findMarkers(markdown);

        if (!markers.length) return null;

        const marker = markers[
            Math.min(markerIndex, markers.length - 1)
        ];

        return this.extractHeadingBlock(markdown, marker.start);
    }

    findMarkers(markdown) {
        const markers = [];
        const regex = /```discord-dice\s*```|```discord-dice\s*\r?\n[\s\S]*?^```/gm;

        let match;
        while ((match = regex.exec(markdown)) !== null) {
            markers.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }

        return markers;
    }

    getMarkerIndex(element) {
        /*
         * Count preceding discord-dice blocks in the same rendered
         * container. For normal Obsidian Reading View documents this
         * corresponds to the marker's order in the note.
         */
        let index = 0;
        let current = element;

        while (current?.previousElementSibling) {
            current = current.previousElementSibling;

            if (
                current.matches?.(".block-language-discord-dice")
            ) {
                index++;
            }
        }

        return index;
    }

    extractHeadingBlock(markdown, markerStart) {
        const before = markdown.slice(0, markerStart);

        const headingRegex =
            /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/gm;

        let heading = null;
        let match;

        while ((match = headingRegex.exec(before)) !== null) {
            heading = {
                start: match.index,
                end: match.index + match[0].length,
                level: match[1].length,
                text: match[2].trim()
            };
        }

        if (!heading) return null;

        const afterHeading = markdown.slice(heading.end);

        const nextHeadingRegex =
            /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/gm;

        let nextHeading = null;

        while ((match = nextHeadingRegex.exec(afterHeading)) !== null) {
            const level = match[1].length;

            if (level <= heading.level) {
                nextHeading = heading.end + match.index;
                break;
            }
        }

        const end = nextHeading ?? markdown.length;

        let block = markdown.slice(heading.start, end);

        block = block
            .replace(/```discord-dice\s*```/g, "")
            .replace(
                /```discord-dice\s*\r?\n[\s\S]*?^```/gm,
                ""
            )
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        return {
            markdown: block,
            heading: heading.text
        };
    }

    async sendToDiscord(block) {
        const webhookUrl = this.settings.webhookUrl?.trim();

        if (!webhookUrl) {
            new Notice(
                "Obsidian2Discord: укажи Webhook URL в настройках."
            );
            return;
        }

        if (
            !webhookUrl.startsWith(
                "https://discord.com/api/webhooks/"
            )
        ) {
            new Notice(
                "Obsidian2Discord: неправильный Discord Webhook URL."
            );
            return;
        }

        /*
         * Discord webhook messages have a 2000-character content limit.
         * We leave a little room for the truncation marker.
         */
        const message =
            block.markdown.length > 1950
                ? block.markdown.slice(0, 1950) +
                  "\n\n…[текст обрезан]"
                : block.markdown;

        await requestUrl({
            url: webhookUrl,
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                content: message,
                username:
                    this.settings.playerName ||
                    "Obsidian2Discord"
            })
        });

        new Notice(
            `💬 «${block.heading}» → Discord`
        );
    }

    async sendTestMessage() {
        const webhookUrl = this.settings.webhookUrl?.trim();

        if (!webhookUrl) {
            new Notice(
                "Obsidian2Discord: сначала укажи Webhook URL."
            );
            return;
        }

        try {
            await requestUrl({
                url: webhookUrl,
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    content:
                        "💬 Тестовое сообщение от Obsidian2Discord.",
                    username:
                        this.settings.playerName ||
                        "Obsidian2Discord"
                })
            });

            new Notice(
                "Obsidian2Discord: тест отправлен."
            );
        } catch (error) {
            console.error(
                "Obsidian2Discord test:",
                error
            );

            new Notice(
                "Obsidian2Discord: тест не отправлен."
            );
        }
    }
};

class Obsidian2DiscordSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", {
            text: "Obsidian2Discord"
        });

        new Setting(containerEl)
            .setName("Discord Webhook URL")
            .setDesc(
                "URL Discord Webhook. Не публикуй его в заметках или Git."
            )
            .addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder(
                    "https://discord.com/api/webhooks/..."
                );
                text.setValue(
                    this.plugin.settings.webhookUrl
                );

                text.onChange(async value => {
                    this.plugin.settings.webhookUrl =
                        value.trim();
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Имя отправителя")
            .setDesc(
                "Имя, которое будет отображаться у сообщений Discord."
            )
            .addText(text => {
                text.setValue(
                    this.plugin.settings.playerName
                );
                text.setPlaceholder(
                    "Obsidian2Discord"
                );

                text.onChange(async value => {
                    this.plugin.settings.playerName =
                        value.trim() ||
                        "Obsidian2Discord";

                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Проверить Webhook")
            .setDesc(
                "Отправить тестовое сообщение."
            )
            .addButton(button => {
                button.setButtonText("Отправить тест");

                button.onClick(async () => {
                    await this.plugin.sendTestMessage();
                });
            });

        containerEl.createEl("h3", {
            text: "Использование"
        });

        containerEl.createEl("p", {
            text:
                "Вставь ```discord-dice``` в нужное место правила. В Reading View он превратится в 💬."
        });

        containerEl.createEl("p", {
            text:
                "При нажатии плагин берёт текст от ближайшего предыдущего заголовка до следующего заголовка того же или более высокого уровня."
        });
    }
}
