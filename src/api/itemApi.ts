import fastCopy from "fast-copy";
import type { Item } from "index";
import { Component, MarkdownRenderer } from "obsidian";
import type { HomebrewCreature, HomebrewItem } from "obsidian-overload";
import { Itemary } from "src/itemary/itemary";
import type StatBlockPlugin from "src/main";
import { LinkStringifier } from "src/parser/stringifier";
import ItemBlockRenderer from "src/view/itemblock";
import StatBlockRenderer from "src/view/statblock";

declare global {
    interface Window {
        FantasyItemblocks: ItemAPI;
    }
}

declare module "obsidian" {
    interface Workspace {
        on(name: "fantasy-statblocks:loaded", callback: () => void): EventRef;
        on(
            name: "fantasy-statblocks:itemary:resolved",
            callback: () => void
        ): EventRef;
        on(
            name: "fantasy-statblocks:itemary:updated",
            callback: () => void
        ): EventRef;
    }
}
export class ItemAPI {
    #plugin: StatBlockPlugin;
    constructor(plugin: StatBlockPlugin) {
        this.#plugin = plugin;
    }

    getVersion(): {
        major: number;
        minor: number;
        patch: number;
    } {
        return this.#plugin.settings.version;
    }

    /**
     * Get the fully defined plugin bestiary.
     *
     * @returns {Map<string, Item>}
     */
    getItemary() {
        return Itemary.getItemary();
    }


    /**
     * Get a list of itemary items.
     *
     * @returns {Item[]}
     */
    getItemaryItem(): Item[] {
        return Itemary.getItemaryItems();
    }

    /**
     * Get a list of itermary names.
     *
     * @returns {string[]}
     */
    getItemaryNames(): string[] {
        return Itemary.getItemaryNames();
    }

    /**
     * Returns true if the itemary contains the item.
     *
     * @param {string} name
     * @returns {boolean}
     */
    hasItem(name: string): boolean {
        return Itemary.hasItem(name);
    }

    /**
     * Retrieve a fully defined item out of the itemary, resolving all extensions.
     *
     * @param {string} name Name of the item to retrieve.
     * @returns {Partial<Item> | null} The item from the itemary, or null if not present.
     */
    getItemFromItemary(name: string): Partial<Item> | null {
        return Itemary.getItemFromItemary(name);
    }

    /**
     * Retrieve a fully defined item out of the itemary, resolving all extensions.
     *
     * @param {string} name Name of the item to retrieve.
     * @returns {Partial<Item> | null} The item from the itemary, or null if not present.
     */
    async getItem(name: string): Promise<Partial<Item> | null> {
        return await Itemary.getItemFromItemary(name);
    }

    /**
     * Gets an array of items sorted by the specified field.
     *
     * @param {string} field - The field by which items should be sorted.
     * @returns {Array<Item>} - An array of items sorted by the specified field.
     */
    getSortedBy(field: string): Array<Item> {
        return Itemary.getSortedBy(field);
    }
    /**
     * Registers a callback to be invoked when items are sorted by the specified field.
     *
     * @param {string} field - The field by which items are sorted.
     * @param {(values: Array<Item>) => void} cb - The callback function to be invoked when sorting occurs.
     * @returns {() => void} - A function that can be used to unregister the callback.
     */
    onSortedBy(
        field: string,
        cb: (values: Array<Item>) => void
    ): () => void {
        return Itemary.onSortedBy(field, cb);
    }
    /**
     * Registers a custom sorter function for sorting items by the specified field.
     *
     * @param {string} field - The field by which items should be sorted.
     * @param {(a: Item, b: Item) => number} compareFn - The comparison function used for sorting.
     */
    registerSorter(
        field: string,
        compareFn: (a: Item, b: Item) => number
    ) {
        return Itemary.registerSorter(field, compareFn);
    }

    /**
     * Gets an array of indices.
     *
     * @returns {Array<string>} - An array of indices.
     */
    getIndices() {
        return Itemary.getIndices();
    }
    /**
     * Gets the index map for the specified field.
     *
     * @param {string} field - The field for which the index map is retrieved.
     * @returns {Map<string, Set<string>>} - The index map for the specified field.
     */
    getIndex(field: string): Map<string, Set<string>> {
        return Itemary.getIndex(field);
    }
    /**
     * Registers an index for the specified field.
     *
     * @param {string} field - The field for which the index is registered.
     */
    registerIndex(field: string) {
        return Itemary.registerIndex(field);
    }
    /**
     * Registers a callback to be invoked when the specified index is updated.
     *
     * @param {string} index - The index for which the callback is registered.
     * @param {() => void} callback - The callback function to be invoked when the index is updated.
     * @returns {() => void} - A function that can be used to unregister the callback.
     */
    onIndexUpdated(index: string, callback: () => void): () => void {
        return Itemary.onIndexUpdated(index, callback);
    }

    isResolved(): boolean {
        return Itemary.isResolved();
    }
    onResolved(callback: () => void) {
        return Itemary.onResolved(callback);
    }
    onUpdated(callback: () => void) {
        return Itemary.onUpdated(callback);
    }

    render(
        source: HomebrewItem,
        el: HTMLElement,
        display?: string
    ): Component {
        const item: Item = Object.assign<
            Partial<Item>,
            HomebrewItem
        >(
            {},
            fastCopy(this.getItemFromItemary(source.name ?? "") ?? {}),
            //@ts-ignore
            fastCopy(source)
        ) as Item;
        if (!item) return new Component();
        if (display) {
            item.name = display;
        }
        return new ItemBlockRenderer({
            container: el,
            item,
            plugin: this.#plugin,
            context: "ITEMBLOCK_RENDERER"
        });
    }

    //Links
    isStatblockLink(link: string): boolean {
        return LinkStringifier.isStatblockLink(link);
    }
    parseStatblockLink(link: string): string {
        return LinkStringifier.stringifyLinks(link);
    }
    /**
     * Replaces any already transformed links back into their original link type.
     * @param source
     * @returns {string} The corrected string.
     */
    stringifyLinks(source: string): string {
        return LinkStringifier.stringifyLinks(source);
    }
    /**
     * This method can be used to replace any markdown or wikilinks in a source, so that it
     * can safely be transformed into YAML.
     *
     * @param {string} source The string to be transformed.
     * @returns {string} A transformed source, with links replaced.
     */
    transformLinks(source: string): string {
        return LinkStringifier.transformSource(source);
    }

    /**
     * Renders markdown string to an HTML element using Obsidian's Markdown renderer.
     * @param markdown — The markdown source code
     * @param el — The element to append to
     * @param sourcePath — The normalized path of this markdown file, used to resolve relative internal links
     * @param component — A parent component to manage the lifecycle of the rendered child components.
     */
    renderMarkdown(
        markdown: string,
        el: HTMLElement,
        sourcePath = "",
        component = this.#plugin
    ): void {
        MarkdownRenderer.render(
            this.#plugin.app,
            markdown,
            el,
            sourcePath,
            component
        );
    }
}
