<script lang="ts">
    import { Setting, renderMatches, prepareSimpleSearch } from "obsidian";
    import { stringify } from "src/util/util";
    import { EditItemModal, ViewItemModal } from "../modal";
    import type { Item } from "index";
    import { Itemary } from "src/itemary/itemary";
    import { getContext } from "../layout/context";
    import { NameFilter } from "./filters/filters";
    import { createEventDispatcher } from "svelte";

    export let item: Item;

    const dispatch = createEventDispatcher<{ close: void }>();
    const plugin = getContext("plugin");
    let content: Setting;
    const buildSetting = (node: HTMLElement) => {
        content = new Setting(node);

        let desc: string,
            needTooltip = false;
        if (Array.isArray(item.source)) {
            let source = item.source.slice(0, 4);
            if (item.source.length > 4) {
                source.push(`and ${item.source.length - 4} more`);
                needTooltip = true;
            }
            desc = stringify(source, 0, ", ", false);
        } else {
            desc = item.source;
        }
        content.setDesc(desc ?? "");
        if (needTooltip) {
            content.descEl.setAttr(
                "aria-label",
                stringify(item.source, 0, ", ", false)
            );
        }

        if (Itemary.isLocal(item.name)) {
            content
                .addExtraButton((b) => {
                    b.setIcon("pencil")
                        .setTooltip("Edit")
                        .onClick(() => {
                            const modal = new EditItemModal(plugin, item);
                            modal.open();
                        });
                })
                .addExtraButton((b) => {
                    b.setIcon("trash")
                        .setTooltip("Delete")
                        .onClick(async () => {
                            await plugin.deleteItems(item.name);
                        });
                });
        } else if (item.path) {
            const file = plugin.app.vault.getFileByPath(item.path);
            if (!file) return;
            content.addExtraButton((b) => {
                b.setIcon("file-symlink").onClick(async () => {
                    const leaf = plugin.app.workspace.getLeaf();
                    await leaf.openFile(file);
                    plugin.app.setting.close();
                });
            });
        }
        content.addExtraButton((b) => {
            b.setIcon("info")
                .setTooltip("View")
                .onClick(() => {
                    const modal = new ViewItemModal(plugin, item as Item);
                    modal.open();
                });
        });
    };

    $: {
        if (content) {
            if ($NameFilter.length) {
                const result = prepareSimpleSearch($NameFilter)(item.name);
                if (result) {
                    content.nameEl.empty();
                    renderMatches(content.nameEl, item.name, result.matches);
                }
            } else {
                content.setName(item.name);
            }
        }
    }
</script>

<div class="item" use:buildSetting />
