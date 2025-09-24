<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import {
        ButtonComponent,
        ExtraButtonComponent,
        Notice,
        parseYaml,
        stringifyYaml
    } from "obsidian";
    import type { Item } from "index";

    const dispatch = createEventDispatcher();

    export let item: Partial<Item> = {};
    let useJson = false;
    let textArea: HTMLTextAreaElement;

    const json = (node: HTMLElement) => {
        new ExtraButtonComponent(node).setIcon("code-glyph").setTooltip("JSON");
    };
    const yaml = (node: HTMLElement) => {
        new ExtraButtonComponent(node)
            .setIcon("lines-of-text")
            .setTooltip("YAML");
    };
    const save = (node: HTMLElement) => {
        new ButtonComponent(node)
            .setIcon("checkmark")
            .setTooltip("Save Changes")
            .onClick(() => {
                if (useJson) {
                    try {
                        if (useJson) {
                            item = JSON.parse(textArea.value);
                        } else {
                            item = parseYaml(textArea.value);
                        }
                    } catch (e) {
                        console.error(e);
                        new Notice(
                            `There was an error saving the itemn\n\n${e.message}`
                        );
                        return;
                    }
                }
                dispatch("save", item);
            });
    };
    const cancel = (node: HTMLElement) => {
        new ExtraButtonComponent(node)
            .setIcon("cross")
            .setTooltip("Cancel")
            .onClick(() => {
                dispatch("cancel");
            });
    };

    function getItemText() {
        if (useJson) return JSON.stringify(item, null, 2);
        if (!item || !Object.keys(item ?? {})?.length) return "";
        return stringifyYaml(item).trim();
    }

    function setItem() {
        try {
            if (useJson) {
                item = JSON.parse(textArea.value);
            } else {
                item = parseYaml(textArea.value);
            }
        } catch (e) {
            console.error(e);
        }
    }
</script>

<div class="edit-item-modal">
    <h2>Edit Item</h2>
    <div class="top-level">
        <div class="json">
            <div
                class:active={!useJson}
                use:yaml
                on:click={() => (useJson = false)}
            />
            <div
                class:active={useJson}
                use:json
                on:click={() => (useJson = true)}
            />
        </div>
        {#key useJson}
            <textarea bind:this={textArea} on:blur={() => setItem()}
                >{getItemText()}</textarea
            >
        {/key}
    </div>
    <div class="buttons">
        <div use:save />
        <div use:cancel />
    </div>
</div>

<style scoped>
    .top-level {
        display: flex;
        flex-flow: column nowrap;
    }
    textarea {
        flex-grow: 1;
        height: 500px;
        max-height: 50vh;
    }
    .json {
        margin-bottom: 1rem;
        display: flex;
        justify-content: flex-start;
        align-items: center;
    }
    .json > div {
        border-radius: 4px;
        margin: 5px 0px;
    }
    .active {
        background-color: var(--background-secondary-alt);
    }

    .buttons {
        margin-top: 1rem;
        display: flex;
        justify-content: flex-end;
        align-items: center;
    }
</style>
