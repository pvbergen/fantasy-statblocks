<script lang="ts">
    import type { Monster, Item } from "index";
    import { Notice } from "obsidian";
    import type { JavaScriptItem } from "src/layouts/layout.types";
    import type StatBlockPlugin from "src/main";

    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";

    export let block: JavaScriptItem;

    let store = getContext<Writable<Monster|Item>>("monster");
    if (store == undefined) {
        store = getContext<Writable<Monster|Item>>("item");
    }
    let source = $store;
    store.subscribe((m) => (source = m));
    let plugin = getContext<StatBlockPlugin>("plugin");

    const render = (div: HTMLElement) => {
        if (block.code) {
            try {
                const func = new Function("source", "property", block.code);
                const htmlElement = func.call(undefined, source, plugin);
                if (htmlElement instanceof HTMLElement) {
                    div.appendChild(htmlElement);
                }
            } catch (e) {
                console.error(e);
            }
        }
    };
</script>

<div class="statblock-javascript" use:render />

<style>
</style>
