import {
    addIcon,
    type MarkdownPostProcessorContext,
    Notice,
    type ObsidianProtocolHandler,
    parseYaml,
    Plugin,
    WorkspaceLeaf
} from "obsidian";
import domtoimage from "dom-to-image";

import StatBlockRenderer from "./view/statblock";
import { nanoid } from "./util/util";
import type { Item, ItemblockParameters, Monster, StatblockParameters } from "../index";
import StatblockSettingTab from "./settings/settings";
import fastCopy from "fast-copy";

import type { HomebrewCreature } from "obsidian-overload";
import type {
    DefaultLayout,
    Layout,
    StatblockItem
} from "./layouts/layout.types";
import { Layout5e } from "./layouts/basic 5e/basic5e";
import { StatblockSuggester } from "./suggest/statblocksuggester";
import { DefaultLayouts, ItemDefaultLayouts } from "./layouts";
import type { StatblockData } from "index";
import LayoutManager from "./layouts/manager";
import { CREATURE_VIEW, CreatureView, ITEMARY_VIEW, ItemaryView } from "./combatant";
import { API } from "./api/api";
import { Linkifier } from "./parser/linkify";
import { Bestiary } from "./bestiary/bestiary";
import { ExpectedValue } from "@javalent/dice-roller";
import { Itemary } from "./itemary/itemary";
import ItemBlockRenderer from "./view/itemblock";
import { ItemAPI } from "./api/itemApi";

export const DICE_ROLLER_SOURCE = "FANTASY_STATBLOCKS_PLUGIN";

const DEFAULT_DATA: StatblockData = {
    monsters: [],
    items: [],
    statBlockLayoutSettings: {
        defaultLayouts: {},
        layouts: [],
        default: Layout5e.name,
        showAdvanced: false,
        alwaysImport: false,
    },
    itemBlockLayoutSettings: {
        defaultLayouts: {},
        layouts: [],
        default: Layout5e.name,
        showAdvanced: false,
        alwaysImport: false,
    },
    useDice: true,
    renderDice: false,
    export: true,
    version: {
        major: null,
        minor: null,
        patch: null
    },
    paths: ["/"],
    autoParse: false,
    disableSRD: false,
    tryToRenderLinks: true,
    debug: false,
    notifiedOfFantasy: false,
    hideConditionHelp: false,
    defaultLayoutsIntegrated: false,
    atomicWrite: false
};

export default class StatBlockPlugin extends Plugin {
    settings: StatblockData;
    manager = new LayoutManager();
    itemManager = new LayoutManager();
    api: API = new API(this);
    itemApi: ItemAPI = new ItemAPI(this)

    getRoller(str: string) {
        if (!this.canUseDiceRoller) return;
        const roller = window.DiceRoller.getRollerSync(str, DICE_ROLLER_SOURCE);
        return roller;
    }
    getRollerString(str: string) {
        if (!this.canUseDiceRoller) return str;
        return window.DiceRoller.getRollerString(str, DICE_ROLLER_SOURCE);
    }
    get diceRollerInstalled() {
        if (window.DiceRoller != null) {
            return true;
        }
        return false;
    }
    get canUseDiceRoller() {
        if (this.diceRollerInstalled) {
            return this.settings.useDice;
        }
        return false;
    }

    get creature_view() {
        const leaves = this.app.workspace.getLeavesOfType(CREATURE_VIEW);
        const leaf = leaves?.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof CreatureView)
            return leaf.view;
    }
    async openCreatureView(newPane: boolean = false) {
        let leaf: WorkspaceLeaf;
        const existing = this.app.workspace.getLeavesOfType(CREATURE_VIEW);

        if (!newPane && existing?.length) {
            leaf = existing.shift();
        } else {
            if (newPane && existing?.length) {
                leaf = this.app.workspace.createLeafInParent(
                    existing[0].parent,
                    existing[0].parent.children.length
                );
            } else {
                leaf = this.app.workspace.getRightLeaf(true);
            }
            await leaf.setViewState({
                type: CREATURE_VIEW
            });
        }
        this.app.workspace.revealLeaf(leaf);
        return leaf.view as CreatureView;
    }

    get item_view() {
        const leaves = this.app.workspace.getLeavesOfType(ITEMARY_VIEW);
        const leaf = leaves?.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof ItemaryView)
            return leaf.view;
    }
    async openItemView(newPane: boolean = false) {
        let leaf: WorkspaceLeaf;
        const existing = this.app.workspace.getLeavesOfType(ITEMARY_VIEW);

        if (!newPane && existing?.length) {
            leaf = existing.shift();
        } else {
            if (newPane && existing?.length) {
                leaf = this.app.workspace.createLeafInParent(
                    existing[0].parent,
                    existing[0].parent.children.length
                );
            } else {
                leaf = this.app.workspace.getRightLeaf(true);
            }
            await leaf.setViewState({
                type: ITEMARY_VIEW
            });
        }
        this.app.workspace.revealLeaf(leaf);
        return leaf.view as ItemaryView;
    }

    #creaturePaneProtocolHandler: ObsidianProtocolHandler = (data) => {
        const name = data?.creature ?? data?.name ?? "";

        if (Bestiary.hasCreature(name)) {
            const creature = Bestiary.get(name);
            if (!this.creature_view) {
                this.openCreatureView().then((v) => v.render(creature));
            } else {
                this.creature_view.render(creature);
            }
        }
    };

    #itemPaneProtocolHandler: ObsidianProtocolHandler = (data) => {
        const name = data?.item ?? data?.name ?? "";

        if (Itemary.hasItem(name)) {
            const item = Itemary.get(name);
            if (!this.item_view) {
                this.openItemView().then((v) => v.render(item));
            } else {
                this.item_view.render(item);
            }
        }
    };
    async onload() {
        console.log("Fantasy StatBlocks loaded");
        this.app.workspace.trigger("fantasy-statblocks:loaded", null);

        await this.loadSettings();
        await this.saveSettings();

        this.manager.initialize(this.settings.statBlockLayoutSettings, DefaultLayouts);
        this.itemManager.initialize(this.settings.itemBlockLayoutSettings, ItemDefaultLayouts);
        this.register(() => this.manager.unload());
        this.register(() => this.itemManager.unload());

        Bestiary.initialize(this);
        Itemary.initialize(this);
        Linkifier.initialize(this.app.metadataCache, this.app);

        this.register(() => Linkifier.unload());

        this.registerHoverLinkSource(this.manifest.id, {
            display: this.manifest.name,
            defaultMod: false
        });

        this.addCommand({
            id: "open-creature-view",
            name: "Open Creature pane",
            checkCallback: (checking) => {
                const existing =
                    this.app.workspace.getLeavesOfType(CREATURE_VIEW);
                if (!existing.length) {
                    if (!checking) {
                        this.openCreatureView();
                    }
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "reveal-creature-view",
            name: "Reveal Creature pane",
            checkCallback: (checking) => {
                const existing =
                    this.app.workspace.getLeavesOfType(CREATURE_VIEW);
                if (existing.length) {
                    if (!checking) {
                        this.openCreatureView();
                    }
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "open-new-creature-view",
            name: "Open new Creature pane",
            callback: () => {
                this.openCreatureView(true);
            }
        });
        this.addRibbonIcon("skull", "Open Creature pane", async (evt) => {
            this.openCreatureView(evt.getModifierState("Meta"));
        });

        this.registerObsidianProtocolHandler(
            "creature-pane",
            this.#creaturePaneProtocolHandler.bind(this)
        );

        this.addCommand({
            id: "open-item-view",
            name: "Open Item pane",
            checkCallback: (checking) => {
                const existing =
                    this.app.workspace.getLeavesOfType(ITEMARY_VIEW);
                if (!existing.length) {
                    if (!checking) {
                        this.openItemView();
                    }
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "reveal-item-view",
            name: "Reveal Item pane",
            checkCallback: (checking) => {
                const existing =
                    this.app.workspace.getLeavesOfType(ITEMARY_VIEW);
                if (existing.length) {
                    if (!checking) {
                        this.openItemView();
                    }
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: "open-new-item-view",
            name: "Open new Item pane",
            callback: () => {
                this.openItemView(true);
            }
        });
        this.addRibbonIcon("sword", "Open Item pane", async (evt) => {
            this.openItemView(evt.getModifierState("Meta"));
        });

        this.registerObsidianProtocolHandler(
            "item-pane",
            this.#itemPaneProtocolHandler.bind(this)
        );

        addIcon(
            "markdown-icon",
            `<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M593.8 59.1H46.2C20.7 59.1 0 79.8 0 105.2v301.5c0 25.5 20.7 46.2 46.2 46.2h547.7c25.5 0 46.2-20.7 46.1-46.1V105.2c0-25.4-20.7-46.1-46.2-46.1zM338.5 360.6H277v-120l-61.5 76.9-61.5-76.9v120H92.3V151.4h61.5l61.5 76.9 61.5-76.9h61.5v209.2zm135.3 3.1L381.5 256H443V151.4h61.5V256H566z"/></svg>`
        );

        this.addSettingTab(new StatblockSettingTab(this.app, this));

        (window["FantasyStatblocks"] = this.api) &&
            this.register(() => delete window["FantasyStatblocks"]);

        this.registerMarkdownCodeBlockProcessor(
            "statblock",
            this.statBlockPostprocessor.bind(this)
        );

        this.registerMarkdownCodeBlockProcessor(
            "itemblock",
            this.itemBlockPostprocessor.bind(this)
        );

        this.registerEditorSuggest(new StatblockSuggester(this));

        this.registerView(
            CREATURE_VIEW,
            (leaf: WorkspaceLeaf) => new CreatureView(leaf, this)
        );
        this.registerView(
            ITEMARY_VIEW,
            (leaf: WorkspaceLeaf) => new ItemaryView(leaf, this)
        );

        if (this.canUseDiceRoller) {
            window.DiceRoller.registerSource(DICE_ROLLER_SOURCE, {
                showDice: true,
                shouldRender: this.settings.renderDice,
                showFormula: false,
                showParens: false,
                expectedValue: ExpectedValue.Average,
                text: null
            });
        }
        this.registerEvent(
            this.app.workspace.on("dice-roller:loaded", () => {
                window.DiceRoller.registerSource(DICE_ROLLER_SOURCE, {
                    showDice: true,
                    shouldRender: this.settings.renderDice,
                    showFormula: false,
                    showParens: false,
                    expectedValue: ExpectedValue.Average,
                    text: null
                });
            })
        );
    }

    async loadSettings() {
        const settings: StatblockData = await this.loadData();
        this.settings = {
            ...DEFAULT_DATA,
            ...settings
        };
        if (!this.settings.defaultLayoutsIntegrated) {
            for (const layout of this.settings.layouts) {
                layout.id = nanoid();
            }
            for (const layout of this.settings.itemLayouts) {
                layout.id = nanoid();
            }
            this.settings.default = (
                this.manager.getAllLayouts().find(
                    ({ name }) => name == this.settings.default
                ) ?? Layout5e
            ).id;
            this.settings.itemDefault = (
                this.itemManager.getAllLayouts().find(
                    ({ name }) => name == this.settings.itemDefault
                ) ?? Layout5e
            ).id;

            this.settings.defaultLayoutsIntegrated = true;
        }
        if (Array.isArray(this.settings.defaultLayouts)) {
            const map: Record<string, DefaultLayout> = {};
            for (const layout of this.settings
                .defaultLayouts as DefaultLayout[]) {
                if (layout.removed || layout.edited) {
                    map[layout.id] = layout;
                }
            }
            this.settings.defaultLayouts = map;
        }
        if (Array.isArray(this.settings.itemDefaultLayouts)) {
            const map: Record<string, DefaultLayout> = {};
            for (const layout of this.settings
                .itemDefaultLayouts as DefaultLayout[]) {
                if (layout.removed || layout.edited) {
                    map[layout.id] = layout;
                }
            }
            this.settings.itemDefaultLayouts = map;
        }
        for (const layout of DefaultLayouts) {
            if (!(layout.id in this.settings.defaultLayouts)) continue;
            if (layout.version == null) continue;
            const existing = this.settings.defaultLayouts[layout.id];
            if (existing.version >= layout.version) continue;
            if (existing.edited) {
                existing.updatable = true;
                continue;
            }
            existing.blocks = fastCopy(layout.blocks);
        }
        for (const layout of ItemDefaultLayouts) {
            if (!(layout.id in this.settings.itemDefaultLayouts)) continue;
            if (layout.version == null) continue;
            const existing = this.settings.itemDefaultLayouts[layout.id];
            if (existing.version >= layout.version) continue;
            if (existing.edited) {
                existing.updatable = true;
                continue;
            }
            existing.blocks = fastCopy(layout.blocks);
        }

        function fixSpells(...blocks: StatblockItem[]) {
            for (const block of blocks) {
                if (block.type == "spells") {
                    if (!block.properties.length)
                        block.properties.push("spells");
                }
                if ("nested" in block) {
                    fixSpells(...block.nested);
                }
            }
        }
        for (const layout of this.settings.layouts) {
            fixSpells(...layout.blocks);
        }

        const version = this.manifest.version.split(".");
        this.settings.version = {
            major: Number(version[0]),
            minor: Number(version[1]),
            patch: Number(version[2])
        };
    }
    async saveSettings() {
        this.app.workspace.trigger(
            "fantasy-statblocks:settings-change",
            this.settings
        );
        await this.saveData(this.settings);
    }
    async loadData(): Promise<StatblockData> {
        return (await super.loadData()) as StatblockData;
    }
    async saveData(settings: StatblockData) {
        super.saveData(settings);
    }

    async saveMonster(monster: Monster, save: boolean = true) {
        if (!monster.name) return;
        if (Bestiary.isLocal(monster.name)) {
            //already exists, replace it
            const index = this.settings.monsters.findIndex(
                ([name]) => name === monster.name
            );
            if (index >= 0) {
                this.settings.monsters.splice(index, 1, [
                    monster.name,
                    monster
                ]);
            } else {
                this.settings.monsters.push([monster.name, monster]);
            }
        } else {
            this.settings.monsters.push([monster.name, monster]);
        }
        Bestiary.addLocalCreature(monster);

        if (save) {
            await this.saveSettings();
        }
    }
    async saveMonsters(monsters: Monster[]) {
        for (let monster of monsters) {
            await this.saveMonster(monster, false);
        }
        await this.saveSettings();
    }

    async updateMonster(oldMonster: Monster, newMonster: Monster) {
        await this.deleteMonsters(oldMonster.name);
        await this.saveMonster(newMonster);
    }

    async deleteMonsters(...monsters: string[]) {
        for (let monster of monsters) {
            Bestiary.removeLocalCreature(monster);
        }
        this.settings.monsters = this.settings.monsters.filter(
            ([name]) => !monsters.includes(name)
        );
        await this.saveSettings();
    }

    async saveItem(item: Item, save: boolean = true) {
        if (!item.name) return;
        if (Itemary.isLocal(item.name)) {
            //already exists, replace it
            const index = this.settings.items.findIndex(
                ([name]) => name === item.name
            );
            if (index >= 0) {
                this.settings.items.splice(index, 1, [
                    item.name,
                    item
                ]);
            } else {
                this.settings.items.push([item.name, item]);
            }
        } else {
            this.settings.items.push([item.name, item]);
        }
        Itemary.addLocalItem(item);

        if (save) {
            await this.saveSettings();
        }
    }
    async saveItems(items: Item[]) {
        for (let item of items) {
            await this.saveItem(item, false);
        }
        await this.saveSettings();
    }

    async updateItem(oldItem: Item, newItem: Item) {
        await this.deleteItems(oldItem.name);
        await this.saveItem(newItem);
    }

    async deleteItems(...items: string[]) {
        for (let item of items) {
            Itemary.removeLocalItem(item);
        }
        this.settings.items = this.settings.items.filter(
            ([name]) => !items.includes(name)
        );
        await this.saveSettings();
    }

    onunload() {
        console.log("Fantasy StatBlocks unloaded");

        this.app.workspace
            .getLeavesOfType(CREATURE_VIEW)
            .forEach((leaf) => leaf.detach());

        this.app.workspace
            .getLeavesOfType(ITEMARY_VIEW)
            .forEach((leaf) => leaf.detach());
    }

    exportAsPng(name: string, containerEl: Element) {
        function filter(node: HTMLElement) {
            return !node.hasClass || !node.hasClass("clickable-icon");
        }
        const content =
            containerEl.querySelector<HTMLDivElement>(".statblock-content");
        if (content) delete content.style["boxShadow"];
        domtoimage
            .toPng(containerEl, {
                filter: filter,
                style: { height: "100%" }
            })
            .then((url) => {
                const link = document.createElement("a");
                link.download = name + ".png";
                link.href = url;
                link.click();
                link.detach();
            })
            .catch((e) => {
                new Notice(
                    `There was an error creating the image: \n\n${e.message}`
                );
                console.error(e);
            });
    }

    getLayoutOrDefault(object: Monster | Item): Layout | null {
        if (object instanceof Monster) {
            return this.manager.getLayoutOrDefault(object.layout);
        } else if (object instanceof Item) {
            return this.itemManager.getLayoutOrDefault(object.layout);
        }
        return null;
    }

    async statBlockPostprocessor(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ) {
        try {
            /** Replace Links */
            source = Linkifier.transformSource(source);

            /** Get Parameters */
            let params: StatblockParameters = parseYaml(source);

            el.addClass("statblock-plugin-container");
            el.parentElement?.addClass("statblock-plugin-parent");

            let statblock = new StatBlockRenderer({
                container: el,
                plugin: this,
                params,
                context: ctx.sourcePath
            });

            ctx.addChild(statblock);
        } catch (e) {
            console.error(`Obsidian Statblock Error:\n${e}`);
            let pre = createEl("pre");
            pre.setText(`\`\`\`statblock
There was an error rendering the statblock:
${e.stack
                    .split("\n")
                    .filter((line: string) => !/^at/.test(line?.trim()))
                    .join("\n")}
\`\`\``);
        }
    }

    async itemBlockPostprocessor(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ) {
        try {
            /** Replace Links */
            source = Linkifier.transformSource(source);

            /** Get Parameters */
            let params: ItemblockParameters = parseYaml(source);

            el.addClass("statblock-plugin-container");
            el.parentElement?.addClass("statblock-plugin-parent");

            let itemblock = new ItemBlockRenderer({
                container: el,
                plugin: this,
                params,
                context: ctx.sourcePath
            });

            ctx.addChild(itemblock);
        } catch (e) {
            console.error(`Obsidian Itemblock Error:\n${e}`);
            let pre = createEl("pre");
            pre.setText(`\`\`\`statblock
There was an error rendering the statblock:
${e.stack
                    .split("\n")
                    .filter((line: string) => !/^at/.test(line?.trim()))
                    .join("\n")}
\`\`\``);
        }
    }

    //backwards-compat
    render(creature: HomebrewCreature, el: HTMLElement, display?: string) {
        this.api.render(creature, el, display);
    }
}
